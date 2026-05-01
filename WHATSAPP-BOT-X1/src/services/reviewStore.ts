import * as fs from "fs";
import * as path from "path";
import { ReviewItem } from "../types/copilot";

/**
 * Path to the reviews persistence file.
 * Uses process.cwd() so it resolves relative to the project root at runtime.
 */
export function getReviewsPath(): string {
  return path.resolve(process.cwd(), "data", "reviews.json");
}

/**
 * Normalize a raw parsed JSON object into a proper ReviewItem,
 * converting date strings back to Date objects.
 */
function normalizeReview(raw: Record<string, unknown>): ReviewItem {
  const suggestions = (raw.suggestions as Array<Record<string, unknown>> || []).map((s) => ({
    id: s.id as string,
    type: s.type as "direct" | "explanatory" | "human",
    text: s.text as string,
    validated: s.validated as boolean,
    createdAt: new Date(s.createdAt as string),
  }));

  const saleOutcomeRaw = raw.saleOutcome as Record<string, unknown> | undefined;
  const saleOutcome = saleOutcomeRaw
    ? {
        sale: saleOutcomeRaw.sale as boolean,
        amount: saleOutcomeRaw.amount as string | undefined,
        note: saleOutcomeRaw.note as string | undefined,
        createdAt: new Date(saleOutcomeRaw.createdAt as string),
      }
    : undefined;

  return {
    id: raw.id as string,
    contactId: raw.contactId as string,
    messageId: raw.messageId as string,
    customerMessage: raw.customerMessage as string,
    intent: raw.intent as ReviewItem["intent"],
    suggestions,
    status: raw.status as ReviewItem["status"],
    chosenSuggestionId: (raw.chosenSuggestionId as string | null) ?? null,
    saleOutcome,
    manualStatus: raw.manualStatus as ReviewItem["manualStatus"],
    manualNote: raw.manualNote as string | undefined,
    contactName: raw.contactName as string | undefined,
    contactPhone: raw.contactPhone as string | undefined,
    source: raw.source as ReviewItem["source"],
    receivedAt: raw.receivedAt as string | undefined,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
  };
}

/**
 * Load reviews from data/reviews.json.
 * Returns an empty array if the file doesn't exist or is invalid.
 * Logs a clear error message if JSON is malformed.
 */
export function loadReviews(): ReviewItem[] {
  const filePath = getReviewsPath();

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      console.error(`[reviewStore] Erro: ${filePath} não contém um array. Ignorando.`);
      return [];
    }

    return parsed.map((item: Record<string, unknown>) => normalizeReview(item));
  } catch (err) {
    console.error(`[reviewStore] Erro ao ler ${filePath}:`, err);
    console.error(`[reviewStore] O arquivo não foi apagado. Corrija manualmente ou remova-o.`);
    return [];
  }
}

/**
 * Save reviews to data/reviews.json.
 * Creates the data/ directory if it doesn't exist.
 * Logs a clear error if writing fails, but does NOT throw.
 */
export function saveReviews(items: ReviewItem[]): void {
  const filePath = getReviewsPath();

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), "utf-8");
  } catch (err) {
    console.error(`[reviewStore] Erro ao salvar ${filePath}:`, err);
  }
}
