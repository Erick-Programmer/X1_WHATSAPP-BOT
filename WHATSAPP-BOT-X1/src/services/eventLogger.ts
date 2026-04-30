import * as fs from "fs";
import * as path from "path";
import { ReviewItem } from "../types/copilot";

/**
 * Path to the JSONL event log file.
 * Uses process.cwd() so it resolves relative to the project root at runtime.
 */
const LOG_FILE = path.resolve(process.cwd(), "data", "copilot-events.jsonl");

/**
 * Ensure the data directory exists.
 * Creates it recursively if it doesn't exist.
 */
function ensureDataDir(): void {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Event shape for standard copilot lifecycle events.
 *
 * NOTE: contactId is saved as plain text during simulation.
 * TODO: In production, hash the phone number before logging (e.g., SHA-256).
 * Never log tokens, checkoutUrl real, .env, or sensitive data.
 */
interface CopilotEvent {
  event: string;
  reviewId: string;
  contactId: string;
  messageId: string;
  intent: string;
  customerMessage: string;
  suggestionId?: string;
  suggestionType?: string;
  suggestionText?: string;
  status: string;
  createdAt: string;
}

/**
 * Event shape for sale outcome marking.
 * Does NOT include status — uses sale/amount/note instead.
 * Never logs checkoutUrl or tokens.
 */
interface SaleOutcomeEvent {
  event: "sale_outcome";
  reviewId: string;
  contactId: string;
  messageId: string;
  intent: string;
  customerMessage: string;
  suggestionId?: string;
  suggestionType?: string;
  suggestionText?: string;
  sale: boolean;
  amount?: string;
  note?: string;
  createdAt: string;
}

type EventLogEntry = CopilotEvent | SaleOutcomeEvent;

/**
 * Append a single event as a JSON line to the log file.
 */
function logEvent(data: EventLogEntry): void {
  ensureDataDir();
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(data) + "\n", "utf-8");
  } catch (err) {
    console.error(`[eventLogger] Failed to write event: ${err}`);
  }
}

/**
 * Log when a review item is created, along with its initial suggestions.
 */
export function logReviewCreated(item: ReviewItem): void {
  const base = {
    reviewId: item.id,
    contactId: item.contactId,
    messageId: item.messageId,
    intent: item.intent,
    customerMessage: item.customerMessage,
    createdAt: new Date().toISOString(),
  };

  // Log the review_created event
  logEvent({ ...base, event: "review_created", status: item.status });

  // Log each suggestion as a suggestions_generated event
  for (const s of item.suggestions) {
    logEvent({
      ...base,
      event: "suggestions_generated",
      suggestionId: s.id,
      suggestionType: s.type,
      suggestionText: s.text,
      status: item.status,
    });
  }
}

/**
 * Log when a suggestion is approved.
 */
export function logSuggestionApproved(item: ReviewItem): void {
  const suggestion = item.suggestions.find((s) => s.id === item.chosenSuggestionId);
  logEvent({
    event: "suggestion_approved",
    reviewId: item.id,
    contactId: item.contactId,
    messageId: item.messageId,
    intent: item.intent,
    customerMessage: item.customerMessage,
    suggestionId: suggestion?.id,
    suggestionType: suggestion?.type,
    suggestionText: suggestion?.text,
    status: item.status,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Log when a suggestion is sent (after mock send).
 */
export function logSuggestionSent(item: ReviewItem): void {
  const suggestion = item.suggestions.find((s) => s.id === item.chosenSuggestionId);
  logEvent({
    event: "suggestion_sent",
    reviewId: item.id,
    contactId: item.contactId,
    messageId: item.messageId,
    intent: item.intent,
    customerMessage: item.customerMessage,
    suggestionId: suggestion?.id,
    suggestionType: suggestion?.type,
    suggestionText: suggestion?.text,
    status: item.status,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Log when a review is cancelled.
 */
export function logReviewCancelled(item: ReviewItem): void {
  logEvent({
    event: "review_cancelled",
    reviewId: item.id,
    contactId: item.contactId,
    messageId: item.messageId,
    intent: item.intent,
    customerMessage: item.customerMessage,
    status: item.status,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Log when a review is expired.
 */
export function logReviewExpired(item: ReviewItem): void {
  logEvent({
    event: "review_expired",
    reviewId: item.id,
    contactId: item.contactId,
    messageId: item.messageId,
    intent: item.intent,
    customerMessage: item.customerMessage,
    status: item.status,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Log when suggestions are regenerated (replaced) for a review item.
 */
export function logSuggestionsRegenerated(item: ReviewItem): void {
  const base = {
    reviewId: item.id,
    contactId: item.contactId,
    messageId: item.messageId,
    intent: item.intent,
    customerMessage: item.customerMessage,
    status: item.status,
    createdAt: new Date().toISOString(),
  };

  // Log the regeneration event
  logEvent({ ...base, event: "suggestions_regenerated" });

  // Log each new suggestion
  for (const s of item.suggestions) {
    logEvent({
      ...base,
      event: "suggestions_generated",
      suggestionId: s.id,
      suggestionType: s.type,
      suggestionText: s.text,
    });
  }
}

/**
 * Log a sale outcome for a review item.
 * Does NOT log checkoutUrl or tokens.
 */
export function logSaleOutcome(
  item: ReviewItem,
  sale: boolean,
  options?: { amount?: string; note?: string }
): void {
  const suggestion = item.suggestions.find((s) => s.id === item.chosenSuggestionId);

  const event: SaleOutcomeEvent = {
    event: "sale_outcome",
    reviewId: item.id,
    contactId: item.contactId,
    messageId: item.messageId,
    intent: item.intent,
    customerMessage: item.customerMessage,
    suggestionId: suggestion?.id,
    suggestionType: suggestion?.type,
    suggestionText: suggestion?.text,
    sale,
    amount: options?.amount,
    note: options?.note,
    createdAt: new Date().toISOString(),
  };

  logEvent(event);
}

/**
 * Get the path to the log file (for display in simulations).
 */
export function getLogFilePath(): string {
  return LOG_FILE;
}
