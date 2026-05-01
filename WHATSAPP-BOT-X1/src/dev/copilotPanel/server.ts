import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { classifyIntent } from "../../services/intentClassifier";
import { generateSuggestions } from "../../services/replySuggestions";
import { reviewQueue } from "../../services/reviewQueue";
import { botRuntime } from "../../services/botRuntimeState";
import { whatsappCredentials } from "../../services/whatsappCredentials";
import { commercialSettings } from "../../services/commercialSettings";
import { commercialConfig } from "../../config/commercial";

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
      jsonResponse(res, 200, items);
      return;
    }

    // GET /api/stats
    if (method === "GET" && url === "/api/stats") {
      jsonResponse(res, 200, readStats());
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
      const rawContactName = (body.contactName as string) || "";
      const rawContactPhone = (body.contactPhone as string) || "";
      const receivedAt = (body.receivedAt as string) || new Date().toISOString();

      // Limpar telefone: só dígitos
      const contactPhone = rawContactPhone.replace(/\D/g, "");

      // Gerar contactId
      let contactId: string;
      if (contactPhone) {
        contactId = contactPhone;
      } else if (rawContactName) {
        contactId = rawContactName.trim();
      } else {
        contactId = `unknown_${Date.now()}`;
      }

      const messageId = `msg_import_${Date.now()}`;

      const intentResult = classifyIntent(lastMessage);
      const suggestions = generateSuggestions(intentResult.intent);

      const item = reviewQueue.createReviewItem(
        contactId,
        messageId,
        lastMessage,
        intentResult.intent,
        suggestions
      );

      // Salvar campos extras
      item.contactName = rawContactName || undefined;
      item.contactPhone = contactPhone || undefined;
      item.source = source as "manual" | "whatsapp_web_extension" | "api" | "mock";
      item.receivedAt = receivedAt;

      jsonResponse(res, 201, {
        reviewId: item.id,
        contactId: item.contactId,
        contactName: item.contactName,
        contactPhone: item.contactPhone,
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
      const suggestions = generateSuggestions(intentResult.intent);

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

      const newSuggestions = generateSuggestions(item.intent, 2);
      reviewQueue.regenerateSuggestions(reviewId, newSuggestions);

      const updated = reviewQueue.getReviewItem(reviewId);
      jsonResponse(res, 200, {
        reviewId: updated!.id,
        status: updated!.status,
        suggestions: updated!.suggestions.map((s) => ({
          id: s.id,
          type: s.type,
          text: s.text,
          validated: s.validated,
        })),
      });
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
      if (!suggestionId) {
        jsonResponse(res, 400, { error: "suggestionId is required" });
        return;
      }

      try {
        reviewQueue.markManualSent(reviewId, suggestionId);
        const updated = reviewQueue.getReviewItem(reviewId);
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

        const saved = commercialSettings.save({ productName, price, checkoutUrl, deliveryMethod });
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
        if (!checkoutUrl) {
          jsonResponse(res, 400, { error: "checkoutUrl é obrigatório" });
          return;
        }
        const result = await commercialSettings.validateCheckout(checkoutUrl);
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
        const result = commercialSettings.approve();
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
        const result = commercialSettings.reject();
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
