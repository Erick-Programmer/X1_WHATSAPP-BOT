import { Intent } from "../types/intent";
import { ReplySuggestion, SuggestionType } from "../types/copilot";
import { productKnowledge } from "../config/product";
import { commercialSettings } from "./commercialSettings";
import { validateResponse } from "./qaValidator";
import * as fs from "fs";
import * as path from "path";

const APPROVED_FILE = path.resolve(process.cwd(), "data", "approved-responses.json");

function getApprovedExamples(intent: Intent): string[] {
  if (!fs.existsSync(APPROVED_FILE)) return [];
  try {
    const list: Array<{ intent: string; text: string }> = JSON.parse(fs.readFileSync(APPROVED_FILE, "utf-8"));
    return list
      .filter(e => e.intent === intent)
      .slice(-3)
      .map(e => e.text);
  } catch { return []; }
}

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

function buildSystemPrompt(): string {
  const pk = productKnowledge;
  const settings = commercialSettings.getEffectiveConfig();
  const price = settings.price;
  const planners = pk.planners.map(p => `${p.name} (${p.style})`).join(", ");
  const ebooks = pk.ebooks.map(e => e.name).join(", ");

  return `Você é um vendedor humano brasileiro vendendo pelo WhatsApp. Responda de forma natural, direta e sem formalidade excessiva. Nunca use travessão (—). Use linguagem do dia a dia.

PRODUTO: ${pk.name}
PREÇO: ${price}
O QUE VEM: 10 planners digitais em PDF (${planners}) + 3 ebooks bônus (${ebooks})
CONTEÚDO DE CADA PLANNER: calendário mensal, planejamento semanal, metas, hábitos, controle de provas
ENTREGA: digital por e-mail após a compra, tudo em PDF

REGRAS:
- Nunca invente informações sobre o produto
- Nunca use travessão (—)
- Seja humano, curto e direto
- Não comece frases com "Olá!" ou "Claro!" toda hora
- Não use emojis em excesso`;
}

function buildUserPrompt(intent: Intent, history: string[]): string {
  const settings = commercialSettings.getEffectiveConfig();

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
    ? `\nATENÇÃO: o cliente quer comprar. NÃO justifique o preço. Mande o link direto: ${settings.checkoutUrl}`
    : intent === Intent.ObjectionExpensive
    ? `\nATENÇÃO: não use frases como "vale muito a pena" ou "ótimo custo-benefício". Seja empático e mostre o conteúdo.`
    : "";

  // Few-shot: exemplos aprovados pelo vendedor
  const approved = getApprovedExamples(intent);
  const fewShotBlock = approved.length > 0
    ? `\nRespostas que o vendedor já aprovou para essa situação:\n${approved.map(t => `- "${t}"`).join("\n")}\nImite o estilo dessas respostas.\n`
    : "";

  return `${historyText}

Intenção detectada: ${intentLabels[intent]}${extraInstruction}${fewShotBlock}

Gere exatamente 3 sugestões de resposta em JSON, no formato abaixo. Retorne APENAS o JSON, sem texto antes ou depois, sem markdown.

{
  "direct": "resposta curta e direta, 1 frase",
  "explanatory": "resposta mais completa explicando o produto, 2 a 3 frases",
  "human": "resposta mais natural e conversacional, como um vendedor humano falaria"
}`;
}

export async function generateSuggestionsDeepSeek(
  intent: Intent,
  history: string[],
  round: number = 1
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
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(intent, history) },
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

    return types.map((type) => {
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

  } catch (e) {
    console.error("[DeepSeek] Erro ao gerar sugestões:", e);
    return null;
  }
}