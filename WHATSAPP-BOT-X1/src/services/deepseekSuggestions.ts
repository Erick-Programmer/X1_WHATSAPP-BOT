import { Intent } from "../types/intent";
import { ReplySuggestion, SuggestionType } from "../types/copilot";
import { getProductProfile, productProfileText } from "./productProfile";
import { validateResponse } from "./qaValidator";
import * as fs from "fs";
import * as path from "path";
import { DEFAULT_PRODUCT_ID, normalizeProductId } from "./productContext";

const APPROVED_FILE = path.resolve(process.cwd(), "data", "approved-responses.json");

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

function getApprovedExamples(intent: Intent, productId: string = DEFAULT_PRODUCT_ID): string[] {
  if (!fs.existsSync(APPROVED_FILE)) return [];
  try {
    const list: Array<{ intent: string; text: string }> = JSON.parse(fs.readFileSync(APPROVED_FILE, "utf-8"));
    return list
      .filter(e => e.intent === intent && normalizeProductId((e as any).productId) === normalizeProductId(productId))
      .slice(-3)
      .map(e => e.text);
  } catch { return []; }
}

function buildSystemPrompt(productId: string = DEFAULT_PRODUCT_ID): string {
  const profile = getProductProfile(productId);

  return `Voce e um vendedor humano brasileiro vendendo pelo WhatsApp. Responda de forma natural, direta e sem formalidade excessiva. Nunca use travessao. Use linguagem do dia a dia.

PRODUTO ATUAL:
${productProfileText(productId)}

REGRAS:
- Use somente informacoes do PRODUTO ATUAL
- Nunca use nome, preco, bonus, entrega ou detalhes de outro produto
- Nunca invente informacoes sobre o produto
- Nunca use travessao
- Seja humano, curto e direto
- Nao comece frases com "Ola!" ou "Claro!" toda hora
- Nao use emojis em excesso
- Se nao souber algo, responda de forma simples e peca permissao para explicar melhor
- Se for checkout, use somente este link quando fizer sentido: ${profile.checkoutUrl}`;
}

function buildUserPrompt(intent: Intent, history: string[], productId: string = DEFAULT_PRODUCT_ID): string {
  const profile = getProductProfile(productId);

  const intentLabels: Record<Intent, string> = {
    [Intent.AskPrice]: "cliente perguntou o preço",
    [Intent.AskContent]: "cliente perguntou o que vem no pacote",
    [Intent.AskDelivery]: "cliente perguntou como recebe",
    [Intent.AskTargetAudience]: "cliente perguntou pra quem é",
    [Intent.PositiveConfirmation]: "cliente confirmou interesse / disse ok / quer ver",
    [Intent.ObjectionExpensive]: "cliente achou caro",
    [Intent.ObjectionThink]: "cliente disse que vai pensar",
    [Intent.BuyIntent]: "cliente quer comprar",
    [Intent.StopContact]: "cliente não quer mais contato",
    [Intent.HumanNeeded]: "situação fora do padrão, precisa de atenção",
    [Intent.Unknown]: "mensagem com intenção não identificada",
  };

  const historyText = history.length > 0
    ? `Últimas mensagens do cliente:\n${history.map((m, i) => `${i + 1}. "${m}"`).join("\n")}`
    : "Primeira mensagem do cliente.";

  const extraInstruction = intent === Intent.BuyIntent
    ? `\nATENCAO: o cliente quer comprar. NAO justifique o preco. Mande o link direto se fizer sentido: ${profile.checkoutUrl}`
    : intent === Intent.ObjectionExpensive
    ? `\nATENÇÃO: não use frases como "vale muito a pena" ou "ótimo custo-benefício". Seja empático e mostre o conteúdo.`
    : "";

  const flowRules = [
    "FLUXO DE VENDA:",
    "- A resposta precisa fazer sentido com a mensagem mais recente e com a etapa do cliente.",
    "- Se a pessoa so cumprimentou, responda o cumprimento e peca permissao para mostrar.",
    "- Se a pessoa respondeu sim ou pode sim logo depois da abordagem inicial, apresente o produto atual sem preco e sem checkout.",
    "- Se a pessoa ja recebeu a apresentacao e respondeu algo como ah sim, avance suavemente para valor ou pergunta de link.",
    "- Se a pessoa perguntou preco, informe o valor e pergunte se pode mandar o link.",
    "- Nao pule para preco ou checkout antes do cliente pedir valor ou demonstrar compra.",
    "- Use somente informacoes do produto atual. Nao copie nome, preco, bonus, entrega ou detalhes de outro produto.",
  ].join("\n");

  // Few-shot: exemplos aprovados pelo vendedor
  const approved = getApprovedExamples(intent, productId);
  const fewShotBlock = approved.length > 0
    ? `\nRespostas que o vendedor já aprovou para essa situação:\n${approved.map(t => `- "${t}"`).join("\n")}\nImite o estilo dessas respostas.\n`
    : "";

  return `${historyText}

Intenção detectada: ${intentLabels[intent]}${extraInstruction}${fewShotBlock}

Gere exatamente 3 sugestões de resposta em JSON, no formato abaixo. Retorne APENAS o JSON, sem texto antes ou depois, sem markdown.

${flowRules}

{
  "direct": "resposta curta e direta, 1 frase",
  "explanatory": "resposta mais completa explicando o produto, 2 a 3 frases",
  "human": "resposta mais natural e conversacional, como um vendedor humano falaria"
}`;
}

function hasCrossProductLeak(text: string, productId: string): boolean {
  if (normalizeProductId(productId) === DEFAULT_PRODUCT_ID) return false;

  const lower = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return /planner|planners|ebook|ebooks|kit digital|produto-planners|produto-completo|cyber focus|candy dream|deep tech|lavender|3 ebooks|10 planners/.test(lower);
}

export async function generateSuggestionsDeepSeek(
  intent: Intent,
  history: string[],
  round: number = 1,
  productId: string = DEFAULT_PRODUCT_ID
): Promise<ReplySuggestion[] | null> {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
  if (!DEEPSEEK_API_KEY) return null;

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 600,
        temperature: 0.7,
        messages: [
          { role: "system", content: buildSystemPrompt(productId) },
          { role: "user", content: buildUserPrompt(intent, history, productId) },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || "";

    // Remove possível markdown ```json ... ```
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    const types: SuggestionType[] = ["direct", "explanatory", "human"];

    const suggestions = types.map((type) => {
      const text = parsed[type] || "";
      const validation = validateResponse([{ type: "text", content: text }]);
      return {
        id: crypto.randomUUID(),
        type,
        text,
        validated: validation.approved,
        createdAt: new Date(),
      };
    });

    if (suggestions.some((suggestion) => hasCrossProductLeak(suggestion.text, productId))) {
      console.warn("[DeepSeek] Sugestao descartada por vazamento de outro produto:", {
        productId,
        texts: suggestions.map((s) => s.text),
      });
      return null;
    }

    return suggestions;

  } catch (e) {
    console.error("[DeepSeek] Erro ao gerar sugestões:", e);
    return null;
  }
}
