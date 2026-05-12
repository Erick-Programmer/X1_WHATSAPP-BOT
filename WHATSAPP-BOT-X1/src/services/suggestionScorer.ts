import * as fs from "fs";
import * as path from "path";
import { ReviewItem, ReplySuggestion } from "../types/copilot";

type ScoreLabel = "recomendada" | "boa" | "teste";

interface TextExample {
  intent?: string;
  text: string;
  sale?: boolean;
}

interface ScoreResult {
  score: number;
  scoreLabel: ScoreLabel;
  scoreReasons: string[];
}

const LOG_FILE = path.resolve(process.cwd(), "data", "copilot-events.jsonl");
const APPROVED_FILE = path.resolve(process.cwd(), "data", "approved-responses.json");

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): Set<string> {
  const stop = new Set([
    "a", "o", "e", "de", "do", "da", "dos", "das", "um", "uma", "para", "por", "com",
    "que", "se", "eu", "voce", "te", "me", "no", "na", "em", "os", "as", "ao", "ou",
    "link", "aqui", "agora", "pode", "posso",
  ]);
  return new Set(normalizeText(text).split(" ").filter((word) => word.length > 2 && !stop.has(word)));
}

function similarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const word of left) {
    if (right.has(word)) intersection++;
  }

  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function readJsonArray(filePath: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readEventExamples(): TextExample[] {
  if (!fs.existsSync(LOG_FILE)) return [];

  const sentByReview = new Map<string, TextExample>();
  const examples: TextExample[] = [];
  const lines = fs.readFileSync(LOG_FILE, "utf-8").split("\n").filter((line) => line.trim()).slice(-500);

  for (const line of lines) {
    try {
      const ev = JSON.parse(line) as Record<string, unknown>;
      const event = ev.event as string;
      const reviewId = ev.reviewId as string | undefined;
      const text = ev.suggestionText as string | undefined;
      if (!reviewId || !text) continue;

      if (event === "suggestion_sent" || event === "manual_suggestion_sent") {
        sentByReview.set(reviewId, {
          intent: ev.intent as string | undefined,
          text,
          sale: false,
        });
      }

      if (event === "sale_outcome" && ev.sale === true) {
        const sent = sentByReview.get(reviewId);
        examples.push({
          intent: (ev.intent as string | undefined) || sent?.intent,
          text: text || sent?.text || "",
          sale: true,
        });
      }
    } catch {
      // Ignore malformed historical lines.
    }
  }

  return examples.filter((example) => example.text);
}

function readApprovedExamples(): TextExample[] {
  return readJsonArray(APPROVED_FILE)
    .map((item) => ({
      intent: item.intent as string | undefined,
      text: item.text as string,
      sale: false,
    }))
    .filter((example) => example.text);
}

function bestSimilarity(text: string, examples: TextExample[], intent?: string): number {
  let best = 0;
  for (const example of examples) {
    const base = similarity(text, example.text);
    const boosted = intent && example.intent === intent ? base + 0.05 : base;
    if (boosted > best) best = boosted;
  }
  return Math.min(best, 1);
}

function hasCheckout(text: string): boolean {
  return /https?:\/\/\S+/i.test(text);
}

function wordCount(text: string): number {
  return normalizeText(text).split(" ").filter(Boolean).length;
}

function scoreOne(review: ReviewItem, suggestion: ReplySuggestion, sales: TextExample[], approved: TextExample[]): ScoreResult {
  let score = 50;
  const reasons: string[] = [];
  const text = suggestion.text;
  const words = wordCount(text);
  const lower = normalizeText(text);

  const saleSimilarity = bestSimilarity(text, sales, review.intent);
  if (saleSimilarity >= 0.25) {
    score += Math.round(saleSimilarity * 24);
    reasons.push("parecida com resposta que ja gerou venda");
  }

  const approvedSimilarity = bestSimilarity(text, approved, review.intent);
  if (approvedSimilarity >= 0.22) {
    score += Math.round(approvedSimilarity * 14);
    reasons.push("parecida com resposta ja aprovada/enviada");
  }

  if (suggestion.validated) {
    score += 8;
    reasons.push("passou no QA");
  } else {
    score -= 18;
    reasons.push("QA reprovou");
  }

  if (words >= 12 && words <= 55) {
    score += 8;
    reasons.push("tamanho bom para WhatsApp");
  } else if (words > 80) {
    score -= 10;
    reasons.push("pode estar longa demais");
  }

  if ((review.intent === "ask_price" || review.intent === "buy_intent") && hasCheckout(text)) {
    score += 8;
    reasons.push("inclui link quando ha intencao de compra/preco");
  }

  if (hasCheckout(text) && /17|recuperacao|condicao|especial/.test(lower)) {
    score += 6;
    reasons.push("usa checkout de recuperacao quando acionado");
  }

  if (suggestion.type === "human") {
    score += 4;
    reasons.push("tom mais humano");
  }

  if (/garantia|garantido|aprovacao|nota alta|desconto|promocao relampago/.test(lower)) {
    score -= 12;
    reasons.push("tem termo sensivel");
  }

  score = Math.max(0, Math.min(100, score));
  const scoreLabel: ScoreLabel = score >= 75 ? "recomendada" : score >= 60 ? "boa" : "teste";

  return {
    score,
    scoreLabel,
    scoreReasons: reasons.slice(0, 3),
  };
}

export function scoreReviewSuggestions(review: ReviewItem, sales: TextExample[], approved: TextExample[]): ReviewItem {
  const scoredSuggestions = review.suggestions.map((suggestion) => ({
    ...suggestion,
    ...scoreOne(review, suggestion, sales, approved),
  }));

  const bestScore = Math.max(...scoredSuggestions.map((suggestion) => suggestion.score ?? 0));
  return {
    ...review,
    suggestions: scoredSuggestions.map((suggestion) => ({
      ...suggestion,
      scoreLabel:
        suggestion.score === bestScore && bestScore >= 60
          ? "recomendada"
          : suggestion.scoreLabel,
      scoreReasons:
        suggestion.score === bestScore && bestScore >= 60
          ? ["melhor opcao deste atendimento", ...(suggestion.scoreReasons || [])].slice(0, 3)
          : suggestion.scoreReasons,
    })),
  };
}

let cachedSales: TextExample[] = [];
let cachedApproved: TextExample[] = [];
let cacheTs = 0;

function loadCache(): void {
  if (Date.now() - cacheTs < 30000) return;
  cachedSales = readEventExamples();
  cachedApproved = readApprovedExamples();
  cacheTs = Date.now();
}

export function scoreReviews(reviews: ReviewItem[]): ReviewItem[] {
  loadCache();
  return reviews.map((r) => scoreReviewSuggestions(r, cachedSales, cachedApproved));
}
