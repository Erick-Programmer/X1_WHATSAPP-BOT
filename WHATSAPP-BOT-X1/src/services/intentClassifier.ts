import { Intent, IntentResult } from "../types/intent";
import { salesRules } from "../config/rules";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Match using word boundaries for short keywords (1-3 chars)
 * and substring for longer phrases.
 */
function matchKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = normalize(keyword);
  const words = normalizedKeyword.split(/\s+/);

  // For single short words (1-3 chars), use word boundary match
  if (words.length === 1 && words[0].length <= 3) {
    const pattern = new RegExp(`\\b${words[0]}\\b`);
    return pattern.test(text);
  }

  // For multi-word or longer phrases, use includes
  return text.includes(normalizedKeyword);
}

function matchAnyKeyword(text: string, keywords: string[]): boolean {
  const normalized = normalize(text);
  return keywords.some((keyword) => matchKeyword(normalized, keyword));
}

export function classifyIntent(input: string): IntentResult {
  const normalized = normalize(input);

  if (!normalized || normalized.length === 0) {
    return { intent: Intent.Unknown, confidence: 0, rawInput: input };
  }

  // Priority order:
  // 1. stopContact
  // 2. humanNeeded
  // 3. ask_price
  // 4. ask_delivery
  // 5. ask_content
  // 6. ask_target_audience
  // 7. objection_expensive
  // 8. objection_think
  // 9. buy_intent
  // 10. positive_confirmation
  // 11. unknown

  // 1. STOP CONTACT
  if (matchAnyKeyword(normalized, salesRules.stopContactKeywords)) {
    return { intent: Intent.StopContact, confidence: 0.9, rawInput: input };
  }

  // 2. HUMAN NEEDED
  if (matchAnyKeyword(normalized, salesRules.humanNeededKeywords)) {
    return { intent: Intent.HumanNeeded, confidence: 0.9, rawInput: input };
  }

  // 3. ASK PRICE
  const pricePatterns = [
    /\bquanto\s+custa\b/,
    /\bquanto\s+e\b/,
    /\bpreco\b/,
    /\bvalor\b/,
    /\bqual\s+(o|a)\s+(valor|preco)\b/,
    /\bcusta\b/,
    /\bquanto\s+sai\b/,
    /\bquanto\s+vem\s+a\s+ser\b/,
    /\bdesconto\b/,
    /\bpromocao\b/,
    /\bpromo[cç][aã]o\b/,
    /\bcupom\b/,
    /\bpre[cç]o\s+menor\b/,
  ];
  if (pricePatterns.some((p) => p.test(normalized))) {
    return { intent: Intent.AskPrice, confidence: 0.85, rawInput: input };
  }

  // 4. ASK DELIVERY
  const deliveryPatterns = [
    /\bcomo\s+(recebo|vem|entrega|funciona|ter|comprar|acessar)\b/,
    /\bentrega\b/,
    /\b(e|recebo)\s+(digital|pdf|online)\b/,
    /\bformas?\s+de\s+(entrega|pagamento|acesso)\b/,
    /\bcomo\s+fa[co]o?\s+para\s+(comprar|ter|acessar|receber)\b/,
    /\bemail\b/,
    /\be[- ]mail\b/,
    /\bgoogle\s+drive\b/,
    /\bacesso\b/,
    /\bdrive\b/,
    /\bimprimir\b/,
    /\btablet\b/,
    /\bcelular\b/,
    /\bcomputador\b/,
    /\bfunciona\s+no\s+tablet\b/,
    /\bposso\s+imprimir\b/,
    /\busar\s+no\s+tablet\b/,
  ];
  if (deliveryPatterns.some((p) => p.test(normalized))) {
    return { intent: Intent.AskDelivery, confidence: 0.8, rawInput: input };
  }

  // 5. ASK CONTENT
  const contentPatterns = [
    /\bo\s+que\s+(vem|tem|inclui|contem)\b/,
    /\bconteudo\b/,
    /\bmostra\b/,
    /\bmostre\b/,
    /\bdetalhes\b/,
    /\bquais\s+sao\b/,
    /\bo\s+que\s+tem\s+no\s+pacote\b/,
    /\bquero\s+ver\s+(o|os|a|as)\b/,
    /\b(planners|material)\b/,
    /\btem\s+simulado\b/,
    /\binclui\b/,
    /\bredacao\b/,
    /\breda[cç][aã]o\b/,
    /\bajuda\s+com\s+redacao\b/,
    /\btem\s+redacao\b/,
  ];
  if (contentPatterns.some((p) => p.test(normalized))) {
    return { intent: Intent.AskContent, confidence: 0.8, rawInput: input };
  }

  // 6. ASK TARGET AUDIENCE
  const audiencePatterns = [
    /\bpara\s+quem\b/,
    /\bpublico\b/,
    /\bpublico\s+alvo\b/,
    /\b(serve|destinado)\s+para\b/,
    /\b(e|serve)\s+para\s+(quem|qual)\b/,
    /\b(estudante|aluno)\s+de\s+(qual|que)\b/,
    /\bfundamental\b/,
    /\bmedio\b/,
    /\benem\b/,
    /\bvestibular\b/,
  ];
  if (audiencePatterns.some((p) => p.test(normalized))) {
    return { intent: Intent.AskTargetAudience, confidence: 0.8, rawInput: input };
  }

  // 7. OBJECTION EXPENSIVE
  if (matchAnyKeyword(normalized, salesRules.objectionExpensiveKeywords)) {
    return { intent: Intent.ObjectionExpensive, confidence: 0.8, rawInput: input };
  }

  // 8. OBJECTION THINK
  if (matchAnyKeyword(normalized, salesRules.objectionThinkKeywords)) {
    return { intent: Intent.ObjectionThink, confidence: 0.8, rawInput: input };
  }

  // 9. BUY INTENT
  if (matchAnyKeyword(normalized, salesRules.buyIntentKeywords)) {
    return { intent: Intent.BuyIntent, confidence: 0.85, rawInput: input };
  }

  // 10. POSITIVE CONFIRMATION
  if (matchAnyKeyword(normalized, salesRules.positiveConfirmationKeywords)) {
    return { intent: Intent.PositiveConfirmation, confidence: 0.8, rawInput: input };
  }

  // 11. UNKNOWN
  return { intent: Intent.Unknown, confidence: 0.3, rawInput: input };
}
