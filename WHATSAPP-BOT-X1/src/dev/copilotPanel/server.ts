import "../../config/env";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { classifyIntent } from "../../services/intentClassifier";
import {
  generateFlowContinuationSuggestionsSmart,
  generateFlowContinuationSuggestions,
  generateRecoverySuggestions,
  generateSuggestions,
} from "../../services/replySuggestions";
import { reviewQueue } from "../../services/reviewQueue";
import { botRuntime } from "../../services/botRuntimeState";
import { whatsappCredentials } from "../../services/whatsappCredentials";
import { commercialSettings } from "../../services/commercialSettings";
import { commercialConfig } from "../../config/commercial";
import { leadStore, normalizePhone, looksLikePhone } from "../../services/leadStore";
import { scoreReviews } from "../../services/suggestionScorer";
import { ReviewItem } from "../../types/copilot";
import { campaignStore } from "../../services/campaignStore";
import { Intent } from "../../types/intent";
import { injectionQueue } from "../../services/injectionQueue";
import { telegramInjectionQueue, normalizeTelegramUsername } from "../../services/telegramInjectionQueue";
import { telegramIdentityMap } from "../../services/telegramIdentityMap";
import { initialMessageHistory } from "../../services/initialMessageHistory";
import { telegramSentHistory } from "../../services/telegramSentHistory";
import { telegramLeadStore } from "../../services/telegramLeadStore";

let pendingInjectTelegram: { taskId: string; username: string; text: string } | null = null;

// ─── Approved Responses (few-shot) ──────────────────────────
const APPROVED_FILE = path.resolve(process.cwd(), "data", "approved-responses.json");

function saveApprovedResponse(intent: string, text: string): void {
  let list: Array<{ intent: string; text: string; injectedAt: string }> = [];
  if (fs.existsSync(APPROVED_FILE)) {
    try { list = JSON.parse(fs.readFileSync(APPROVED_FILE, "utf-8")); } catch { list = []; }
  }
  list.push({ intent, text, injectedAt: new Date().toISOString() });
  fs.writeFileSync(APPROVED_FILE, JSON.stringify(list, null, 2), "utf-8");
}

function getConversationHistory(contactId: string, limit = 8): string[] {
  const items = (Array.from(
    (reviewQueue as unknown as { items: Map<string, unknown> }).items.values()
  ) as ReviewItem[])
    .filter((item) => item.contactId === contactId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return items
    .flatMap((review) => {
      const sent = review.chosenSuggestionId
        ? review.suggestions.find((suggestion) => suggestion.id === review.chosenSuggestionId)?.text
        : null;
      return sent
        ? [`Cliente: ${review.customerMessage}`, `Voce: ${sent}`]
        : [`Cliente: ${review.customerMessage}`];
    })
    .slice(-limit);
}

function inferNextFlowStage(items: ReviewItem[]): { stage: string; reason: string } {
  const sorted = items
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const last = sorted[sorted.length - 1];
  const allText = sorted
    .flatMap((item) => {
      const sent = item.chosenSuggestionId
        ? item.suggestions.find((suggestion) => suggestion.id === item.chosenSuggestionId)?.text || ""
        : "";
      return [item.customerMessage, sent];
    })
    .join(" ")
    .toLowerCase();
  const lastSent = sorted
    .slice()
    .reverse()
    .find((item) => item.status === "sent");
  const hoursSinceLastSent = lastSent
    ? (Date.now() - new Date(lastSent.updatedAt || lastSent.createdAt).getTime()) / 36e5
    : null;
  const hasPrice = /r\$\s*27|27 reais|pre[cÃ§]o|valor/.test(allText);
  if (last && hasPrice && hoursSinceLastSent !== null && hoursSinceLastSent >= 20) {
    return { stage: "recovery", reason: "cliente ja recebeu valor e ficou quase um dia sem resposta, pode avaliar recuperacao" };
  }

  if (!last) {
    return { stage: "presentation", reason: "sem historico suficiente, melhor apresentar com leveza" };
  }
  if (last.intent === Intent.AskPrice || /r\$\s*27|27 reais|pre[cç]o|valor/.test(allText)) {
    return { stage: "followup", reason: "cliente ja recebeu ou perguntou valor, agora o melhor e tirar duvida sem pressionar" };
  }
  if (last.intent === Intent.ObjectionExpensive) {
    return { stage: "followup", reason: "cliente demonstrou objeção de preço, melhor recuperar com calma antes de desconto" };
  }
  if (last.intent === Intent.ObjectionThink || /vou dar uma analisada|vou ver|pensar|depois/.test(allText)) {
    return { stage: "followup", reason: "cliente pediu tempo, melhor fazer follow-up leve" };
  }
  if (last.intent === Intent.BuyIntent || /manda.*link|quero comprar|como compra|checkout/.test(allText)) {
    return { stage: "close", reason: "cliente demonstrou intenção de compra ou pediu proximo passo" };
  }
  if (/10 planners|3 ebooks|kit digital|planner estudante pro/.test(allText)) {
    return { stage: "price", reason: "produto ja foi apresentado, proximo passo natural e falar valor com suavidade" };
  }
  if (last.intent === Intent.PositiveConfirmation || /pode sim|sim|quero ver|manda/.test(last.customerMessage.toLowerCase())) {
    return { stage: "product", reason: "cliente deu permissao para ver, melhor mostrar o que vem no kit" };
  }
  return { stage: "presentation", reason: "cliente ainda nao recebeu apresentacao clara do produto" };
}

const PORT = parseInt(process.env.COPILOT_PANEL_PORT || "8787", 10);
const HOST = "127.0.0.1";

const PUBLIC_DIR = path.resolve(process.cwd(), "src", "dev", "copilotPanel", "public");
const INDEX_HTML = path.join(PUBLIC_DIR, "index.html");
const LOG_FILE = path.resolve(process.cwd(), "data", "copilot-events.jsonl");

// ─── Helpers ────────────────────────────────────────────────

function jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

// ─── Stats (duplicated minimally from reportCopilotStats) ───

function readStats(): Record<string, unknown> {
  if (!fs.existsSync(LOG_FILE)) {
    return { totalSent: 0, totalMockSent: 0, totalManualSent: 0, totalSaleOutcomes: 0, totalSales: 0, conversion: "0.00%" };
  }

  const raw = fs.readFileSync(LOG_FILE, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);

  let totalMockSent = 0;
  let totalManualSent = 0;
  let totalSaleOutcomes = 0;
  let totalSales = 0;

  for (const line of lines) {
    try {
      const ev = JSON.parse(line);
      if (ev.event === "suggestion_sent") totalMockSent++;
      if (ev.event === "manual_suggestion_sent") totalManualSent++;
      if (ev.event === "sale_outcome") {
        totalSaleOutcomes++;
        if (ev.sale === true) totalSales++;
      }
    } catch {
      // skip invalid lines
    }
  }

  const totalSent = totalMockSent + totalManualSent;
  const conversion = totalSent > 0 ? ((totalSales / totalSent) * 100).toFixed(2) + "%" : "0.00%";

  return { totalSent, totalMockSent, totalManualSent, totalSaleOutcomes, totalSales, conversion };
}

// ─── Router ─────────────────────────────────────────────────

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = req.url || "/";
  const method = req.method || "GET";

  try {
    // ── API routes ──

    // GET /api/reviews
    if (method === "GET" && url === "/api/reviews") {
      const items = Array.from(
        (reviewQueue as unknown as { items: Map<string, unknown> }).items.values()
      );
      jsonResponse(res, 200, scoreReviews(items as ReviewItem[]));
      return;
    }

    // GET /api/stats
    if (method === "GET" && url === "/api/stats") {
      jsonResponse(res, 200, readStats());
      return;
    }

    // GET /api/leads
    if (method === "GET" && url === "/api/leads") {
      const leads = leadStore.list();
      jsonResponse(res, 200, { total: leads.length, leads });
      return;
    }

    // POST /api/leads/import
    if (method === "POST" && url === "/api/leads/import") {
      const body = await parseBody(req);
      const rawText = (body.rawText as string || "").trim();
      if (!rawText) {
        jsonResponse(res, 400, { error: "rawText e obrigatorio" });
        return;
      }

      jsonResponse(res, 200, leadStore.importFromText(rawText));
      return;
    }

    // POST /api/leads/clear
    if (method === "POST" && url === "/api/leads/clear") {
      leadStore.clear();
      jsonResponse(res, 200, { total: 0, leads: [] });
      return;
    }

    // GET /api/campaign
    if (method === "GET" && url === "/api/campaign") {
      jsonResponse(res, 200, campaignStore.getStatus());
      return;
    }

    // POST /api/campaign/prepare
    if (method === "POST" && url === "/api/campaign/prepare") {
      try {
        const body = await parseBody(req);
        const messages = Array.isArray(body.messages)
          ? (body.messages as unknown[]).map((msg) => String(msg || "").trim()).filter(Boolean)
          : [String(body.message || "").trim()].filter(Boolean);
        const state = campaignStore.prepare({
          message: messages[0] || ((body.message as string) || ""),
          messages,
          limit: body.limit as number | undefined,
          minDelaySeconds: body.minDelaySeconds as number | undefined,
          maxDelaySeconds: body.maxDelaySeconds as number | undefined,
          allowResendForTest: body.allowResendForTest === true,
        });
        jsonResponse(res, 200, campaignStore.getStatus());
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/campaign/start
    if (method === "POST" && url === "/api/campaign/start") {
      try {
        campaignStore.start();
        jsonResponse(res, 200, campaignStore.getStatus());
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/campaign/pause
    if (method === "POST" && url === "/api/campaign/pause") {
      try {
        campaignStore.pause();
        jsonResponse(res, 200, campaignStore.getStatus());
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/campaign/cancel
    if (method === "POST" && url === "/api/campaign/cancel") {
      campaignStore.cancel();
      jsonResponse(res, 200, campaignStore.getStatus());
      return;
    }

    // POST /api/campaign/clear
    if (method === "POST" && url === "/api/campaign/clear") {
      campaignStore.clear();
      jsonResponse(res, 200, campaignStore.getStatus());
      return;
    }

    // DELETE /api/reviews/:id
    const deleteMatch = url.match(/^\/api\/reviews\/([^/]+)$/);
    if (method === "DELETE" && deleteMatch) {
      const reviewId = deleteMatch[1];
      reviewQueue.deleteReview(reviewId);
      jsonResponse(res, 200, { reviewId, deleted: true });
      return;
    }

    // POST /api/inbox/import
    if (method === "POST" && url === "/api/inbox/import") {
      const body = await parseBody(req);
      const lastMessage = (body.lastMessage as string || "").trim();
      if (!lastMessage) {
        jsonResponse(res, 400, { error: "lastMessage é obrigatório" });
        return;
      }

      const source = (body.source as string) || "manual";
      const channel = body.channel === "telegram" ? "telegram" : "whatsapp";
      const rawContactName = (body.contactName as string) || "";
      const rawContactPhone = (body.contactPhone as string) || "";
      const rawContactUsername = (body.contactUsername as string) || "";
      let contactUsername = channel === "telegram"
        ? normalizeTelegramUsername(rawContactUsername || rawContactName)
        : "";
      if (channel === "telegram" && contactUsername) {
        const resolvedUsername = telegramIdentityMap.resolve(contactUsername);
        if (resolvedUsername.startsWith("peer_")) {
          if (contactUsername !== resolvedUsername) {
            telegramIdentityMap.saveMapping(contactUsername, resolvedUsername, rawContactName || undefined);
          }
          contactUsername = resolvedUsername;
        }
        if (contactUsername.startsWith("peer_") && rawContactName) {
          telegramIdentityMap.saveMapping(rawContactName, contactUsername, rawContactName);
        }
      }
      const receivedAt = (body.receivedAt as string) || new Date().toISOString();

      // Limpar telefone: só dígitos. Se o WhatsApp Web mostrar o número
      // como "nome" da conversa, também usamos esse texto como telefone.
      let contactPhone = normalizePhone(rawContactPhone);
      if (!looksLikePhone(contactPhone) && looksLikePhone(rawContactName)) {
        contactPhone = normalizePhone(rawContactName);
      }
      const importedLead = contactPhone ? leadStore.findByPhone(contactPhone) : null;

      // Gerar contactId — telefone tem prioridade SEMPRE sobre nome
      let contactId: string;
      if (channel === "telegram" && contactUsername) {
        contactId = `telegram:${contactUsername.toLowerCase()}`;
      } else if (looksLikePhone(contactPhone)) {
        contactId = contactPhone;  // sempre usa telefone se disponível
      } else {
        contactId = `unknown_${Date.now()}`;  // nunca usa nome como ID
      }

      // Rejeitar duplicata: mesmo contactId + mesma mensagem já na fila
      const existingItems = Array.from(
        (reviewQueue as unknown as { items: Map<string, unknown> }).items.values()
      ) as ReviewItem[];

      const isDuplicate = existingItems.some(
        (i) => i.contactId === contactId && i.customerMessage === lastMessage
      );
      if (isDuplicate) {
        jsonResponse(res, 200, { skipped: true, reason: "duplicate" });
        return;
      }
      
      // Ignorar se o contato já tem sent recente (evita reimportar mensagem enviada pelo vendedor)
      const hasRecentSent = existingItems.some(
        (i) => i.contactId === contactId && i.status === "sent" &&
        (Date.now() - new Date(i.updatedAt || i.createdAt || 0).getTime()) < 30000
      );
      if (hasRecentSent) {
        jsonResponse(res, 200, { skipped: true, reason: "recent_sent" });
        return;
      }

      const normalizeMessage = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
      const incomingNormalized = normalizeMessage(lastMessage);
      const looksLikeOwnSent = existingItems.some((i) => {
        if (i.contactId !== contactId || i.status !== "sent" || !i.chosenSuggestionId) return false;
        const sentText = i.suggestions.find((s) => s.id === i.chosenSuggestionId)?.text || "";
        const sentNormalized = normalizeMessage(sentText);
        return incomingNormalized.length > 25 && sentNormalized.length > 0 && (
          incomingNormalized === sentNormalized ||
          sentNormalized.startsWith(incomingNormalized) ||
          incomingNormalized.startsWith(sentNormalized.slice(0, 80))
        );
      });
      if (looksLikeOwnSent) {
        jsonResponse(res, 200, { skipped: true, reason: "own_sent_message" });
        return;
      }

      const messageId = `msg_import_${Date.now()}`;

      const intentResult = classifyIntent(lastMessage);

      // Monta histórico das últimas 3 mensagens deste contato
      const contactHistory = [
        ...getConversationHistory(contactId, 8),
        `Cliente: ${lastMessage}`,
      ];

      const suggestions = await generateSuggestions(intentResult.intent, 1, contactHistory);

      const item = reviewQueue.createReviewItem(
        contactId,
        messageId,
        lastMessage,
        intentResult.intent,
        suggestions
      );

      reviewQueue.updateReviewMetadata(item.id, {
        contactName: importedLead ? undefined : rawContactName || undefined,
        contactPhone: contactPhone || importedLead?.phone || undefined,
        contactUsername: contactUsername || undefined,
        channel,
        source: source as "manual" | "whatsapp_web_extension" | "telegram_web_extension" | "api" | "mock",
        receivedAt,
      });

      jsonResponse(res, 201, {
        reviewId: item.id,
        contactId: item.contactId,
        contactName: item.contactName,
        contactPhone: item.contactPhone,
        contactUsername: item.contactUsername,
        channel: item.channel,
        messageId: item.messageId,
        customerMessage: item.customerMessage,
        intent: item.intent,
        confidence: intentResult.confidence,
        source: item.source,
        receivedAt: item.receivedAt,
        status: item.status,
        suggestions: item.suggestions.map((s) => ({
          id: s.id,
          type: s.type,
          text: s.text,
          validated: s.validated,
        })),
      });
      return;
    }

    // POST /api/mock-message
    if (method === "POST" && url === "/api/mock-message") {
      const body = await parseBody(req);
      const customerMessage = (body.message as string) || "quanto custa?";
      const contactId = (body.contactId as string) || "5511999999999";
      const messageId = (body.messageId as string) || `msg_${Date.now()}`;

      const intentResult = classifyIntent(customerMessage);
      const suggestions = await generateSuggestions(intentResult.intent, 1, [customerMessage]);

      const item = reviewQueue.createReviewItem(
        contactId,
        messageId,
        customerMessage,
        intentResult.intent,
        suggestions
      );

      jsonResponse(res, 201, {
        reviewId: item.id,
        contactId: item.contactId,
        messageId: item.messageId,
        customerMessage: item.customerMessage,
        intent: item.intent,
        confidence: intentResult.confidence,
        status: item.status,
        suggestions: item.suggestions.map((s) => ({
          id: s.id,
          type: s.type,
          text: s.text,
          validated: s.validated,
        })),
      });
      return;
    }

    // POST /api/reviews/:id/regenerate
    const regenMatch = url.match(/^\/api\/reviews\/([^/]+)\/regenerate$/);
    if (method === "POST" && regenMatch) {
      const reviewId = regenMatch[1];
      const item = reviewQueue.getReviewItem(reviewId);
      if (!item) {
        jsonResponse(res, 404, { error: "Review not found" });
        return;
      }

      const nextRound = (item.suggestionRound ?? 1) + 1;

      const regenHistory = getConversationHistory(item.contactId, 8);

      const newSuggestions = await generateSuggestions(item.intent, nextRound, regenHistory);
      reviewQueue.regenerateSuggestions(reviewId, newSuggestions, nextRound);

      const updated = reviewQueue.getReviewItem(reviewId);
      jsonResponse(res, 200, {
        reviewId: updated!.id,
        status: updated!.status,
        suggestionRound: updated!.suggestionRound,
        suggestions: updated!.suggestions.map((s) => ({
          id: s.id,
          type: s.type,
          text: s.text,
          validated: s.validated,
        })),
      });
      return;
    }

    // POST /api/reviews/:id/recovery-suggestions
    const recoveryMatch = url.match(/^\/api\/reviews\/([^/]+)\/recovery-suggestions$/);
    if (method === "POST" && recoveryMatch) {
      try {
        const reviewId = recoveryMatch[1];
        const item = reviewQueue.getReviewItem(reviewId);
        if (!item) {
          jsonResponse(res, 404, { error: "Review not found" });
          return;
        }

        const nextRound = (item.suggestionRound ?? 1) + 1;
        const newSuggestions = generateRecoverySuggestions(nextRound);
        reviewQueue.regenerateSuggestions(reviewId, newSuggestions, nextRound);

        const updated = reviewQueue.getReviewItem(reviewId);
        jsonResponse(res, 200, {
          reviewId: updated!.id,
          status: updated!.status,
          suggestionRound: updated!.suggestionRound,
          suggestions: updated!.suggestions.map((s) => ({
            id: s.id,
            type: s.type,
            text: s.text,
            validated: s.validated,
          })),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/reviews/:id/checkout-suggestions
    const checkoutSuggestionsMatch = url.match(/^\/api\/reviews\/([^/]+)\/checkout-suggestions$/);
    if (method === "POST" && checkoutSuggestionsMatch) {
      try {
        const reviewId = checkoutSuggestionsMatch[1];
        const item = reviewQueue.getReviewItem(reviewId);
        if (!item) {
          jsonResponse(res, 404, { error: "Review not found" });
          return;
        }

        const config = commercialSettings.getEffectiveConfig();
        if (!config.isCheckoutConfigured || !config.checkoutUrl) {
          jsonResponse(res, 400, { error: "Checkout normal nao configurado/aprovado." });
          return;
        }

        const nextRound = (item.suggestionRound ?? 1) + 1;
        const history = getConversationHistory(item.contactId, 10);

        const newSuggestions = await generateFlowContinuationSuggestionsSmart("close", [
          ...history,
          `Mensagem atual do cliente: ${item.customerMessage}`,
          `O cliente demonstrou interesse. Temos um link de pagamento aprovado: ${config.checkoutUrl}`,
          `Preco do produto: ${config.price}`,
          "Gere 3 respostas completas para WhatsApp, cada uma com abordagem diferente para fechar a venda.",
          "Cada resposta deve incluir o link de pagamento naturalmente no texto.",
          "As respostas devem parecer humanas, calorosas e objetivas.",
          "Nao invente desconto. Nao seja agressivo.",
        ], nextRound);

        const withCheckoutLink = newSuggestions.map((suggestion) => {
          const hasLink = suggestion.text.includes(config.checkoutUrl);
          return {
            ...suggestion,
            text: hasLink
              ? suggestion.text
              : `${suggestion.text}\n\nLink para comprar: ${config.checkoutUrl}`,
          };
        });

        reviewQueue.regenerateSuggestions(reviewId, withCheckoutLink, nextRound);

        const updated = reviewQueue.getReviewItem(reviewId);
        jsonResponse(res, 200, {
          ok: true,
          reviewId: updated!.id,
          suggestionRound: updated!.suggestionRound,
          suggestions: updated!.suggestions,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }


    // POST /api/reviews/:id/focus
    const focusMatch = url.match(/^\/api\/reviews\/([^/]+)\/focus$/);
    if (method === "POST" && focusMatch) {
      try {
        const reviewId = focusMatch[1];
        const item = reviewQueue.getReviewItem(reviewId);
        if (!item) {
          jsonResponse(res, 404, { error: "Review not found" });
          return;
        }

        const nextRound = (item.suggestionRound ?? 1) + 1;
        const focusHistory = getConversationHistory(item.contactId, 8);

        const newSuggestions = await generateSuggestions(item.intent, nextRound, [
          ...focusHistory,
          `Responder especificamente esta mensagem: ${item.customerMessage}`,
        ]);
        reviewQueue.regenerateSuggestions(reviewId, newSuggestions, nextRound);
        jsonResponse(res, 200, { ok: true, reviewId });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/reviews/:id/strategic-reply
    const strategicReplyMatch = url.match(/^\/api\/reviews\/([^/]+)\/strategic-reply$/);
    if (method === "POST" && strategicReplyMatch) {
      try {
        const reviewId = strategicReplyMatch[1];
        const item = reviewQueue.getReviewItem(reviewId);
        if (!item) {
          jsonResponse(res, 404, { error: "Review not found" });
          return;
        }
        if (item.status !== "pending_review") {
          jsonResponse(res, 400, { error: `Review is ${item.status}. Must be pending_review.` });
          return;
        }

        const contactItems = (Array.from(
          (reviewQueue as unknown as { items: Map<string, unknown> }).items.values()
        ) as ReviewItem[])
          .filter((review) => review.contactId === item.contactId);
        const decision = inferNextFlowStage(contactItems);
        const nextRound = (item.suggestionRound ?? 1) + 1;
        const history = [
          ...getConversationHistory(item.contactId, 10),
          `Mensagem atual do cliente: ${item.customerMessage}`,
          `Intencao detectada da mensagem atual: ${item.intent}`,
          `Etapa sugerida: ${decision.stage}`,
          `Motivo estrategico: ${decision.reason}`,
          "Responda especificamente a mensagem atual, mas respeitando a etapa do fluxo.",
        ];

        const newSuggestions = await generateFlowContinuationSuggestionsSmart(decision.stage, history, nextRound);
        reviewQueue.regenerateSuggestions(reviewId, newSuggestions, nextRound);

        jsonResponse(res, 200, {
          ok: true,
          reviewId,
          stage: decision.stage,
          reason: decision.reason,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/contacts/:contactId/continue-flow
    const continueMatch = url.match(/^\/api\/contacts\/([^/]+)\/continue-flow$/);
    if (method === "POST" && continueMatch) {
      try {
        const contactId = decodeURIComponent(continueMatch[1]);
        const body = await parseBody(req);
        const stage = (body.stage as string) || "followup";
        const contactItems = (Array.from(
          (reviewQueue as unknown as { items: Map<string, unknown> }).items.values()
        ) as ReviewItem[])
          .filter((item) => item.contactId === contactId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const latest = contactItems[0];
        const history = contactItems
          .slice()
          .reverse()
          .flatMap((review) => {
            const sent = review.chosenSuggestionId
              ? review.suggestions.find((suggestion) => suggestion.id === review.chosenSuggestionId)?.text
              : null;
            return sent
              ? [`Cliente: ${review.customerMessage}`, `Voce: ${sent}`]
              : [`Cliente: ${review.customerMessage}`];
          })
          .slice(-8);
        const suggestions = await generateFlowContinuationSuggestionsSmart(stage, history, 1);
        const item = reviewQueue.createReviewItem(
          contactId,
          `msg_flow_${Date.now()}`,
          `Continuar fluxo manual: ${stage}`,
          Intent.Unknown,
          suggestions
        );
        reviewQueue.updateReviewMetadata(item.id, {
          contactName: latest?.contactName,
          contactPhone: latest?.contactPhone || latest?.contactId,
          source: "manual",
          receivedAt: new Date().toISOString(),
        });

        jsonResponse(res, 201, reviewQueue.getReviewItem(item.id));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/contacts/:contactId/suggest-next-flow
    const suggestFlowMatch = url.match(/^\/api\/contacts\/([^/]+)\/suggest-next-flow$/);
    if (method === "POST" && suggestFlowMatch) {
      try {
        const contactId = decodeURIComponent(suggestFlowMatch[1]);
        const contactItems = (Array.from(
          (reviewQueue as unknown as { items: Map<string, unknown> }).items.values()
        ) as ReviewItem[])
          .filter((item) => item.contactId === contactId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (contactItems.length === 0) {
          jsonResponse(res, 404, { error: "Contato sem historico" });
          return;
        }

        const latest = contactItems[0];
        const decision = inferNextFlowStage(contactItems);
        const history = getConversationHistory(contactId, 10);
        const suggestions = await generateFlowContinuationSuggestionsSmart(decision.stage, [
          ...history,
          `Etapa sugerida: ${decision.stage}`,
          `Motivo estrategico: ${decision.reason}`,
          "Gere uma mensagem de follow-up/venda sem parecer insistente. Use contexto real da conversa.",
        ], 1);

        const item = reviewQueue.createReviewItem(
          contactId,
          `msg_flow_suggest_${Date.now()}`,
          `Sugestao de proximo passo: ${decision.stage}. Motivo: ${decision.reason}`,
          Intent.Unknown,
          suggestions
        );
        reviewQueue.updateReviewMetadata(item.id, {
          contactName: latest.contactName,
          contactPhone: latest.contactPhone || latest.contactId,
          source: "manual",
          receivedAt: new Date().toISOString(),
        });

        jsonResponse(res, 201, {
          review: reviewQueue.getReviewItem(item.id),
          stage: decision.stage,
          reason: decision.reason,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/reviews/:id/approve-send
    const approveMatch = url.match(/^\/api\/reviews\/([^/]+)\/approve-send$/);
    if (method === "POST" && approveMatch) {
      const reviewId = approveMatch[1];
      const body = await parseBody(req);
      const suggestionId = body.suggestionId as string;
      if (!suggestionId) {
        jsonResponse(res, 400, { error: "suggestionId is required" });
        return;
      }

      reviewQueue.approveSuggestion(reviewId, suggestionId);
      await reviewQueue.sendChosen(reviewId);

      const updated = reviewQueue.getReviewItem(reviewId);
      jsonResponse(res, 200, {
        reviewId: updated!.id,
        status: updated!.status,
        chosenSuggestionId: updated!.chosenSuggestionId,
      });
      return;
    }

    // GET /api/waiting-reply
    if (method === "GET" && url === "/api/waiting-reply") {
      const history = initialMessageHistory.load();
      const existingItems = Array.from(
        (reviewQueue as unknown as { items: Map<string, unknown> }).items.values()
      ) as ReviewItem[];
      const waiting = history.filter((entry) => {
        const phone = normalizePhone(entry.phone);
        return !existingItems.some((i) => i.contactId === phone);
      });
      jsonResponse(res, 200, { total: waiting.length, waiting });
      return;
    }

    // POST /api/waiting-reply/create-followup
    if (method === "POST" && url === "/api/waiting-reply/create-followup") {
      const body = await parseBody(req);
      const phone = normalizePhone(body.phone as string || "");
      if (!phone) { jsonResponse(res, 400, { error: "phone obrigatorio" }); return; }
      const suggestions = await generateSuggestions(Intent.Unknown, 1, [
        `Voce enviou anteriormente: ${body.lastMessage || "mensagem inicial"}`,
        "Cliente nao respondeu ainda.",
        "Gere 3 mensagens de follow-up leves e humanizadas.",
      ]);
      const item = reviewQueue.createReviewItem(
        phone, `followup_${Date.now()}`,
        "follow-up (sem resposta)",
        Intent.Unknown,
        suggestions
      );
      reviewQueue.updateReviewMetadata(item.id, { contactPhone: phone, source: "manual" });
      jsonResponse(res, 200, { ok: true, reviewId: item.id });
      return;
    }


    // POST /api/reviews/:id/sale
    const saleMatch = url.match(/^\/api\/reviews\/([^/]+)\/sale$/);
    if (method === "POST" && saleMatch) {
      const reviewId = saleMatch[1];
      const body = await parseBody(req);
      const sale = body.sale === true;

      const item = reviewQueue.getReviewItem(reviewId);
      if (!item) {
        jsonResponse(res, 404, { error: "Review not found" });
        return;
      }
      if (item.status !== "sent") {
        jsonResponse(res, 400, {
          error: `Cannot mark sale outcome: review is ${item.status}. Must be "sent".`,
        });
        return;
      }

      const effectiveConfig = commercialSettings.getEffectiveConfig();
      reviewQueue.markSaleOutcome(reviewId, sale, {
        amount: effectiveConfig.price,
        note: sale ? "venda confirmada no painel" : "nao vendeu",
      });

      jsonResponse(res, 200, { reviewId, sale, status: item.status });
      return;
    }

    // POST /api/reviews/:id/manual-sent
    const manualSentMatch = url.match(/^\/api\/reviews\/([^/]+)\/manual-sent$/);
    if (method === "POST" && manualSentMatch) {
      const reviewId = manualSentMatch[1];
      const body = await parseBody(req);
      const suggestionId = body.suggestionId as string;
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!suggestionId) {
        jsonResponse(res, 400, { error: "suggestionId is required" });
        return;
      }

      try {
        reviewQueue.markManualSent(reviewId, suggestionId, text || undefined);
        const updated = reviewQueue.getReviewItem(reviewId);
        if (text) {
          saveApprovedResponse(updated!.intent, text);
        }

        // Cancelar todos os outros pending_review do mesmo contato
        const allItems = Array.from(
          (reviewQueue as unknown as { items: Map<string, unknown> }).items.values()
        ) as Array<{ id: string; contactId: string; status: string }>;
        for (const item of allItems) {
          if (item.id !== reviewId && item.contactId === updated!.contactId && item.status === "pending_review") {
            reviewQueue.cancelReview(item.id);
          }
        }

        jsonResponse(res, 200, {
          reviewId: updated!.id,
          status: updated!.status,
          chosenSuggestionId: updated!.chosenSuggestionId,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/reviews/:id/manual-text-sent
    const manualTextSentMatch = url.match(/^\/api\/reviews\/([^/]+)\/manual-text-sent$/);
    if (method === "POST" && manualTextSentMatch) {
      const reviewId = manualTextSentMatch[1];
      const body = await parseBody(req);
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) {
        jsonResponse(res, 400, { error: "text is required" });
        return;
      }

      try {
        reviewQueue.markManualTextSent(reviewId, text);
        const updated = reviewQueue.getReviewItem(reviewId);
        saveApprovedResponse(updated!.intent, text);

        const allItems = Array.from(
          (reviewQueue as unknown as { items: Map<string, unknown> }).items.values()
        ) as Array<{ id: string; contactId: string; status: string }>;
        for (const item of allItems) {
          if (item.id !== reviewId && item.contactId === updated!.contactId && item.status === "pending_review") {
            reviewQueue.cancelReview(item.id);
          }
        }

        jsonResponse(res, 200, {
          reviewId: updated!.id,
          status: updated!.status,
          chosenSuggestionId: updated!.chosenSuggestionId,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/reviews/:id/manual-status
    const manualStatusMatch = url.match(/^\/api\/reviews\/([^/]+)\/manual-status$/);
    if (method === "POST" && manualStatusMatch) {
      const reviewId = manualStatusMatch[1];
      const body = await parseBody(req);
      const manualStatus = body.manualStatus as string;
      const validStatuses = ["novo", "conversando", "interessado", "comprou", "nao_comprou"];
      if (!validStatuses.includes(manualStatus)) {
        jsonResponse(res, 400, { error: `manualStatus invalido. Use: ${validStatuses.join(", ")}` });
        return;
      }

      try {
        reviewQueue.updateManualStatus(reviewId, manualStatus as "novo" | "conversando" | "interessado" | "comprou" | "nao_comprou");
        const updated = reviewQueue.getReviewItem(reviewId);
        jsonResponse(res, 200, {
          reviewId: updated!.id,
          manualStatus: updated!.manualStatus,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/reviews/:id/manual-note
    const manualNoteMatch = url.match(/^\/api\/reviews\/([^/]+)\/manual-note$/);
    if (method === "POST" && manualNoteMatch) {
      const reviewId = manualNoteMatch[1];
      const body = await parseBody(req);
      const manualNote = (body.manualNote as string) || "";

      try {
        reviewQueue.updateManualNote(reviewId, manualNote);
        const updated = reviewQueue.getReviewItem(reviewId);
        jsonResponse(res, 200, {
          reviewId: updated!.id,
          manualNote: updated!.manualNote,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/reviews/:id/cancel
    const cancelMatch = url.match(/^\/api\/reviews\/([^/]+)\/cancel$/);
    if (method === "POST" && cancelMatch) {
      const reviewId = cancelMatch[1];
      reviewQueue.cancelReview(reviewId);
      jsonResponse(res, 200, { reviewId, status: "cancelled" });
      return;
    }

    // ── Runtime state routes ──

    // GET /api/runtime
    if (method === "GET" && url === "/api/runtime") {
      const pendingReviewsCount = reviewQueue.getPendingReviews().length;
      jsonResponse(res, 200, {
        mode: botRuntime.mode,
        realSendAllowed: botRuntime.realSendAllowed,
        pendingReviewsCount,
        canGoLive: botRuntime.canGoLive,
      });
      return;
    }

    // POST /api/runtime/enable
    if (method === "POST" && url === "/api/runtime/enable") {
      try {
        botRuntime.enable();
        jsonResponse(res, 200, { mode: botRuntime.mode });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/runtime/disable
    if (method === "POST" && url === "/api/runtime/disable") {
      botRuntime.disable();
      const pendingReviewsCount = reviewQueue.getPendingReviews().length;
      jsonResponse(res, 200, { mode: botRuntime.mode, pendingReviewsCount });
      return;
    }

    // POST /api/runtime/safe-mode
    if (method === "POST" && url === "/api/runtime/safe-mode") {
      try {
        botRuntime.safeMode();
        jsonResponse(res, 200, { mode: botRuntime.mode });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // ── Credentials routes ──

    // GET /api/credentials/status
    if (method === "GET" && url === "/api/credentials/status") {
      const creds = whatsappCredentials.load();
      if (!creds) {
        jsonResponse(res, 200, { hasCredentials: false });
        return;
      }
      jsonResponse(res, 200, {
        hasCredentials: true,
        maskedCredentials: whatsappCredentials.mask(creds),
        savedAt: creds.savedAt,
        lastUsedAt: creds.lastUsedAt,
      });
      return;
    }

    // POST /api/credentials/save
    if (method === "POST" && url === "/api/credentials/save") {
      try {
        const body = await parseBody(req);
        const apiToken = (body.apiToken as string) || "";
        const phoneNumberId = (body.phoneNumberId as string) || "";
        const businessAccountId = (body.businessAccountId as string) || "";
        const verifyToken = (body.verifyToken as string) || "";

        const saved = whatsappCredentials.save({ apiToken, phoneNumberId, businessAccountId, verifyToken });
        jsonResponse(res, 200, {
          hasCredentials: true,
          maskedCredentials: whatsappCredentials.mask(saved),
          savedAt: saved.savedAt,
          lastUsedAt: saved.lastUsedAt,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/credentials/clear
    if (method === "POST" && url === "/api/credentials/clear") {
      whatsappCredentials.clear();
      jsonResponse(res, 200, { success: true });
      return;
    }

    // POST /api/credentials/use-saved
    if (method === "POST" && url === "/api/credentials/use-saved") {
      try {
        const creds = whatsappCredentials.markUsed();
        jsonResponse(res, 200, {
          hasCredentials: true,
          maskedCredentials: whatsappCredentials.mask(creds),
          savedAt: creds.savedAt,
          lastUsedAt: creds.lastUsedAt,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // ── Commercial settings routes ──

    // GET /api/commercial-settings
    if (method === "GET" && url === "/api/commercial-settings") {
      const settings = commercialSettings.load();
      if (!settings) {
        jsonResponse(res, 200, { hasSettings: false });
        return;
      }
      jsonResponse(res, 200, {
        hasSettings: true,
        settings,
      });
      return;
    }

    // POST /api/commercial-settings/save
    if (method === "POST" && url === "/api/commercial-settings/save") {
      try {
        const body = await parseBody(req);
        const productName = (body.productName as string) || "";
        const price = (body.price as string) || "";
        const checkoutUrl = (body.checkoutUrl as string) || "";
        const deliveryMethod = (body.deliveryMethod as string) || "";
        const recoveryPrice = (body.recoveryPrice as string) || "";
        const recoveryCheckoutUrl = (body.recoveryCheckoutUrl as string) || "";

        const saved = commercialSettings.save({
          productName,
          price,
          checkoutUrl,
          deliveryMethod,
          productDescription: (body.productDescription as string) || "",
          recoveryPrice,
          recoveryCheckoutUrl,
        });
        jsonResponse(res, 200, { hasSettings: true, settings: saved });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/commercial-settings/validate-checkout
    if (method === "POST" && url === "/api/commercial-settings/validate-checkout") {
      try {
        const body = await parseBody(req);
        const checkoutUrl = (body.checkoutUrl as string) || "";
        const target = body.target === "recovery" ? "recovery" : "normal";
        if (!checkoutUrl) {
          jsonResponse(res, 400, { error: "checkoutUrl é obrigatório" });
          return;
        }
        const result = await commercialSettings.validateCheckout(checkoutUrl, target);
        jsonResponse(res, 200, { hasSettings: true, settings: result });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/commercial-settings/approve
    if (method === "POST" && url === "/api/commercial-settings/approve") {
      try {
        const body = await parseBody(req);
        const target = body.target === "recovery" ? "recovery" : "normal";
        const result = commercialSettings.approve(target);
        jsonResponse(res, 200, { hasSettings: true, settings: result });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/commercial-settings/reject
    if (method === "POST" && url === "/api/commercial-settings/reject") {
      try {
        const body = await parseBody(req);
        const target = body.target === "recovery" ? "recovery" : "normal";
        const result = commercialSettings.reject(target);
        jsonResponse(res, 200, { hasSettings: true, settings: result });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        jsonResponse(res, 400, { error: msg });
      }
      return;
    }

    // POST /api/commercial-settings/reset
    if (method === "POST" && url === "/api/commercial-settings/reset") {
      commercialSettings.reset();
      jsonResponse(res, 200, { success: true });
      return;
    }

    // POST /api/inject-whatsapp
    if (method === "POST" && url === "/api/inject-whatsapp") {
      const body = await parseBody(req);
      const task = injectionQueue.enqueue({
        phone: body.phone as string,
        text: body.text as string,
        intent: body.intent as string | undefined,
        source: "manual_reply",
      });

      // Salva resposta aprovada para few-shot
      if (body.intent && body.text) {
        saveApprovedResponse(body.intent as string, body.text as string);
      }

      jsonResponse(res, 200, { ok: true, taskId: task.id, status: task.status });
      return;
    }

    if (method === "GET" && url === "/api/inject-whatsapp/pending") {
      let task = injectionQueue.claimNext();
      if (!task) {
        const campaignPayload = campaignStore.claimNextForSend();
        if (campaignPayload) {
          injectionQueue.enqueue({
            phone: campaignPayload.phone,
            text: campaignPayload.text,
            source: "initial_campaign",
            campaignItemId: campaignPayload.campaignItemId,
          });
          task = injectionQueue.claimNext();
        }
      }

      if (task) {
        jsonResponse(res, 200, {
          ok: true,
          taskId: task.id,
          phone: task.phone,
          text: task.text,
          source: task.source,
        });
        return;
      }
      jsonResponse(res, 200, { ok: false });
      return;
    }

    // POST /api/inject-whatsapp/:id/status
    const injectStatusMatch = url.match(/^\/api\/inject-whatsapp\/([^/]+)\/status$/);
    if (method === "POST" && injectStatusMatch) {
      const taskId = injectStatusMatch[1];
      const body = await parseBody(req);
      const status = body.status as string;
      if (status === "sending") {
        injectionQueue.markSending(taskId);
      } else if (status === "sent") {
        const task = injectionQueue.markSent(taskId);
        if (task && task.source === "initial_campaign") {
          campaignStore.recordInitialSent(task.campaignItemId, task.phone, task.text);
          campaignStore.markItemSent(task.campaignItemId);
        }
      } else if (status === "failed") {
        const error = (body.error as string) || "Erro desconhecido";
        const task = injectionQueue.markFailed(taskId, error);
        if (task && task.source === "initial_campaign") {
          campaignStore.markItemFailed(task.campaignItemId, error);
        }
      } else {
        jsonResponse(res, 400, { error: "status invalido" });
        return;
      }
      jsonResponse(res, 200, { ok: true });
      return;
    }

    // GET /api/inject-whatsapp/queue
    if (method === "GET" && url === "/api/inject-whatsapp/queue") {
      jsonResponse(res, 200, injectionQueue.status());
      return;
    }

    // POST /api/inject-whatsapp/queue/clear-finished
    if (method === "POST" && url === "/api/inject-whatsapp/queue/clear-finished") {
      injectionQueue.clearFinished();
      jsonResponse(res, 200, injectionQueue.status());
      return;
    }

    // POST /api/inject-whatsapp/queue/clear-stuck
    if (method === "POST" && url === "/api/inject-whatsapp/queue/clear-stuck") {
      injectionQueue.clearStuck(2);
      jsonResponse(res, 200, injectionQueue.status());
      return;
    }

    // POST /api/inject-telegram/direct
    if (method === "POST" && url === "/api/inject-telegram/direct") {
      const body = await parseBody(req);
      const resolvedUsername = telegramIdentityMap.resolve(body.username as string);
      pendingInjectTelegram = { taskId: `direct_${Date.now()}`, username: resolvedUsername, text: body.text as string };
      if (body.intent && body.text) saveApprovedResponse(body.intent as string, body.text as string);
      jsonResponse(res, 200, { ok: true, taskId: pendingInjectTelegram.taskId });
      return;
    }

    // GET /api/inject-telegram/direct/pending
    if (method === "GET" && url === "/api/inject-telegram/direct/pending") {
      if (pendingInjectTelegram) {
        const payload = pendingInjectTelegram;
        pendingInjectTelegram = null;
        jsonResponse(res, 200, { ok: true, ...payload });
      } else {
        jsonResponse(res, 200, { ok: false });
      }
      return;
    }

    // POST /api/inject-telegram
    if (method === "POST" && url === "/api/inject-telegram") {
      const body = await parseBody(req);
      const requestedUsername = body.username as string;
      const task = telegramInjectionQueue.enqueue({
        username: telegramIdentityMap.resolve(requestedUsername),
        text: body.text as string,
        intent: body.intent as string | undefined,
        source: "manual_reply",
      });
      if (task.username !== normalizeTelegramUsername(requestedUsername)) {
        telegramIdentityMap.saveMapping(requestedUsername, task.username);
      }

      if (body.intent && body.text) {
        saveApprovedResponse(body.intent as string, body.text as string);
      }

      jsonResponse(res, 200, { ok: true, taskId: task.id, status: task.status });
      return;
    }

    if (method === "GET" && url === "/api/inject-telegram/pending") {
      const task = telegramInjectionQueue.claimNext();
      if (task) {
        jsonResponse(res, 200, {
          ok: true,
          taskId: task.id,
          username: task.username,
          text: task.text,
          source: task.source,
        });
        return;
      }
      jsonResponse(res, 200, { ok: false });
      return;
    }

    const telegramStatusMatch = url.match(/^\/api\/inject-telegram\/([^/]+)\/status$/);
    if (method === "POST" && telegramStatusMatch) {
      const taskId = telegramStatusMatch[1];
      const body = await parseBody(req);
      const status = body.status as string;
      if (status === "sending") {
        telegramInjectionQueue.markSending(taskId);
      } else if (status === "sent") {
        const task = telegramInjectionQueue.markSent(taskId);
        const peerUsername = normalizeTelegramUsername(String(body.peerUsername || body.peerId || ""));
        if (task && peerUsername.startsWith("peer_")) {
          telegramIdentityMap.saveMapping(task.username, peerUsername);
        }
        // ADICIONA ESTA LINHA:
        if (task && task.source === "initial_campaign") {
          telegramSentHistory.recordSent(task.username, task.text);
        }
      } else if (status === "failed") {
        telegramInjectionQueue.markFailed(taskId, (body.error as string) || "Erro desconhecido");
      } else {
        jsonResponse(res, 400, { error: "status invalido" });
        return;
      }
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && url === "/api/inject-telegram/queue") {
      jsonResponse(res, 200, telegramInjectionQueue.status());
      return;
    }

    if (method === "POST" && url === "/api/inject-telegram/queue/clear-finished") {
      telegramInjectionQueue.clearFinished();
      jsonResponse(res, 200, telegramInjectionQueue.status());
      return;
    }

    if (method === "POST" && url === "/api/inject-telegram/queue/start") {
      telegramInjectionQueue.start();
      jsonResponse(res, 200, telegramInjectionQueue.status());
      return;
    }

    if (method === "POST" && url === "/api/inject-telegram/queue/pause") {
      telegramInjectionQueue.pause();
      jsonResponse(res, 200, telegramInjectionQueue.status());
      return;
    }

    // GET /api/telegram-leads
    if (method === "GET" && url === "/api/telegram-leads") {
      const leads = telegramLeadStore.list();
      jsonResponse(res, 200, { total: leads.length, leads });
      return;
    }

    // POST /api/telegram-leads/import
    if (method === "POST" && url === "/api/telegram-leads/import") {
      const body = await parseBody(req);
      const rawText = String(body.rawText || "").trim();
      if (!rawText) { jsonResponse(res, 400, { error: "rawText obrigatorio" }); return; }
      jsonResponse(res, 200, telegramLeadStore.importFromText(rawText));
      return;
    }

    // POST /api/telegram-leads/clear
    if (method === "POST" && url === "/api/telegram-leads/clear") {
      telegramLeadStore.clear();
      jsonResponse(res, 200, { total: 0, leads: [] });
      return;
    }

    if (method === "POST" && url === "/api/telegram/campaign/prepare") {
      const body = await parseBody(req);
      const rawText = String(body.rawText || "");
      const messages = Array.isArray(body.messages)
        ? (body.messages as unknown[]).map((msg) => String(msg || "").trim()).filter(Boolean)
        : [String(body.message || "").trim()].filter(Boolean);
      if (messages.length === 0) {
        jsonResponse(res, 400, { error: "Mensagem inicial obrigatoria." });
        return;
      }
      const usernames = rawText
        .split(/\r?\n|,|;/)
        .map((line) => normalizeTelegramUsername(line))
        .filter(Boolean);
      const unique = Array.from(new Set(usernames));
      const prepared = telegramInjectionQueue.prepareBatch({
        usernames: unique,
        messages,
        limit: Number(body.limit || unique.length),
        minDelaySeconds: Number(body.minDelaySeconds || 45),
        maxDelaySeconds: Number(body.maxDelaySeconds || 120),
        allowDuplicates: body.allowDuplicates === true,
      });
      jsonResponse(res, 200, { ok: true, total: prepared.tasks.length, tasks: prepared.tasks, skipped: prepared.skipped });
      return;
    }
    
    // GET /api/telegram/campaign
    if (method === "GET" && url === "/api/telegram/campaign") {
      jsonResponse(res, 200, telegramInjectionQueue.status());
      return;
    }

    // POST /api/telegram/campaign/cancel
    if (method === "POST" && url === "/api/telegram/campaign/cancel") {
      telegramInjectionQueue.cancelAll();
      jsonResponse(res, 200, telegramInjectionQueue.status());
      return;
    }

    // POST /api/inject-telegram/queue/clear-stuck
    if (method === "POST" && url === "/api/inject-telegram/queue/clear-stuck") {
      telegramInjectionQueue.clearStuck(2);
      jsonResponse(res, 200, telegramInjectionQueue.status());
      return;
    }

    // ── Static files ──

    // Check if index.html exists
    if (!fs.existsSync(INDEX_HTML)) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`index.html nao encontrado em: ${INDEX_HTML}`);
      return;
    }

    let filePath = path.join(PUBLIC_DIR, url === "/" ? "index.html" : url);

    // Security: prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(filePath)) {
      filePath = INDEX_HTML;
    }

    const extMap: Record<string, string> = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    };

    const ext = path.extname(filePath);
    const contentType = extMap[ext] || "application/octet-stream";

    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch (err) {
    console.error("[copilotPanel] Error:", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}

// ─── Start ──────────────────────────────────────────────────

const server = http.createServer((req, res): void => {
  handleRequest(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`[copilotPanel] Servidor rodando em http://${HOST}:${PORT}`);
  console.log(`[copilotPanel] Para encerrar: Ctrl+C`);
});
