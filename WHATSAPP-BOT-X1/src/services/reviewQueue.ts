import { Intent } from "../types/intent";
import { ReviewItem, ReplySuggestion } from "../types/copilot";
import { whatsappClient } from "./whatsappClient";
import {
  logReviewCreated,
  logSuggestionApproved,
  logSuggestionSent,
  logReviewCancelled,
  logReviewExpired,
  logSuggestionsRegenerated,
  logSaleOutcome,
  logManualSuggestionSent,
} from "./eventLogger";
import { loadReviews, saveReviews } from "./reviewStore";

/**
 * In-memory review queue for the copilot mode.
 * Stores pending review items and manages their lifecycle.
 * Persists to data/reviews.json so items survive server restarts.
 */
class ReviewQueue {
  private items: Map<string, ReviewItem> = new Map();

  constructor() {
    const saved = loadReviews();
    for (const item of saved) {
      this.items.set(item.id, item);
    }
    if (saved.length > 0) {
      console.log(`[reviewQueue] Restaurados ${saved.length} reviews do arquivo.`);
    }
  }

  /**
   * Persist all current reviews to disk.
   * Errors are logged by saveReviews but never thrown.
   */
  private persist(): void {
    saveReviews(Array.from(this.items.values()));
  }

  /**
   * Create a new review item with pending_review status.
   */
  createReviewItem(
    contactId: string,
    messageId: string,
    customerMessage: string,
    intent: Intent,
    suggestions: ReplySuggestion[]
  ): ReviewItem {
    const now = new Date();
    const item: ReviewItem = {
      id: crypto.randomUUID(),
      contactId,
      messageId,
      customerMessage,
      intent,
      suggestions,
      suggestionRound: 1,
      status: "pending_review",
      chosenSuggestionId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.items.set(item.id, item);

    // Log review_created + suggestions_generated
    logReviewCreated(item);

    this.persist();

    return item;
  }

  /**
   * Get all pending review items.
   */
  getPendingReviews(): ReviewItem[] {
    return Array.from(this.items.values()).filter(
      (item) => item.status === "pending_review"
    );
  }

  /**
   * Get a specific review item by id.
   */
  getReviewItem(id: string): ReviewItem | undefined {
    return this.items.get(id);
  }

  deleteReview(reviewId: string): void {
    if (!this.items.has(reviewId)) {
      throw new Error(`Review item ${reviewId} not found`);
    }
    this.items.delete(reviewId);
    this.persist();
  }

  /**
   * Update metadata fields after an imported review is created.
   * Used by local panel/import endpoints to persist contact info.
   */
  updateReviewMetadata(
    reviewId: string,
    metadata: Pick<ReviewItem, "contactName" | "contactPhone" | "source" | "receivedAt">
  ): ReviewItem {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }

    item.contactName = metadata.contactName;
    item.contactPhone = metadata.contactPhone;
    item.source = metadata.source;
    item.receivedAt = metadata.receivedAt;
    item.updatedAt = new Date();
    this.persist();
    return item;
  }

  /**
   * Approve a suggestion for a review item.
   * Sets status to "approved" and records the chosen suggestion id.
   * Throws if item is cancelled or expired.
   */
  approveSuggestion(reviewId: string, suggestionId: string): ReviewItem {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }

    if (item.status === "cancelled") {
      throw new Error(`Review item ${reviewId} is cancelled`);
    }
    if (item.status === "expired") {
      throw new Error(`Review item ${reviewId} is expired`);
    }

    const suggestion = item.suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found in review item ${reviewId}`);
    }

    item.chosenSuggestionId = suggestionId;
    item.status = "approved";
    item.updatedAt = new Date();

    // Log suggestion_approved
    logSuggestionApproved(item);

    this.persist();

    return item;
  }

  /**
   * Replace suggestions for a review item with new ones.
   * Only allowed if status is "pending_review".
   * Keeps the item in pending_review status.
   * Resets chosenSuggestionId to null.
   */
  regenerateSuggestions(
    reviewId: string,
    newSuggestions: ReplySuggestion[],
    suggestionRound?: number
  ): ReviewItem {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }

    if (item.status === "sent") {
      throw new Error(`Review item ${reviewId} is already sent`);
    }
    if (item.status === "cancelled") {
      throw new Error(`Review item ${reviewId} is cancelled`);
    }
    if (item.status === "expired") {
      throw new Error(`Review item ${reviewId} is expired`);
    }
    if (item.status === "approved") {
      throw new Error(
        `Review item ${reviewId} is already approved. Cancel it first before regenerating.`
      );
    }

    item.suggestions = newSuggestions;
    item.suggestionRound = suggestionRound ?? ((item.suggestionRound ?? 1) + 1);
    item.chosenSuggestionId = null;
    item.updatedAt = new Date();

    // Log suggestions_regenerated + new suggestions_generated
    logSuggestionsRegenerated(item);

    this.persist();

    return item;
  }

  /**
   * Mark a review item as sent.
   * Only allowed if status is "approved".
   */
  markAsSent(reviewId: string): ReviewItem {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }

    if (item.status !== "approved") {
      throw new Error(
        `Cannot mark as sent: review item ${reviewId} is ${item.status}. Must be "approved".`
      );
    }

    item.status = "sent";
    item.updatedAt = new Date();
    this.persist();
    return item;
  }

  /**
   * Cancel a review item.
   */
  cancelReview(reviewId: string): ReviewItem {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }

    item.status = "cancelled";
    item.updatedAt = new Date();

    // Log review_cancelled
    logReviewCancelled(item);

    this.persist();

    return item;
  }

  /**
   * Expire a review item.
   */
  expireReview(reviewId: string): ReviewItem {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }

    item.status = "expired";
    item.updatedAt = new Date();

    // Log review_expired
    logReviewExpired(item);

    this.persist();

    return item;
  }

  /**
   * Send the chosen suggestion via the mocked whatsappClient.
   * Only allowed if status is "approved".
   * After sending, marks the item as "sent".
   */
  async sendChosen(reviewId: string): Promise<void> {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }

    if (item.status !== "approved") {
      throw new Error(
        `Cannot send: review item ${reviewId} is ${item.status}. Must be "approved".`
      );
    }

    if (!item.chosenSuggestionId) {
      throw new Error(
        `Cannot send: no suggestion chosen for review item ${reviewId}`
      );
    }

    const suggestion = item.suggestions.find(
      (s) => s.id === item.chosenSuggestionId
    );
    if (!suggestion) {
      throw new Error(
        `Cannot send: chosen suggestion ${item.chosenSuggestionId} not found in review item ${reviewId}`
      );
    }

    // Send via mocked client
    await whatsappClient.sendText(item.contactId, suggestion.text);

    // Mark as sent
    this.markAsSent(reviewId);

    // Log suggestion_sent
    logSuggestionSent(item);
  }

  /**
   * Mark a sale outcome for a review item.
   * Only allowed if status is "sent".
   * Does NOT change the status — remains "sent".
   * Logs a sale_outcome event to the JSONL file.
   * Throws if a sale outcome already exists for this review.
   */
  markSaleOutcome(
    reviewId: string,
    sale: boolean,
    options?: { amount?: string; note?: string }
  ): void {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }

    if (item.status !== "sent") {
      throw new Error(
        `Cannot mark sale outcome: review item ${reviewId} is ${item.status}. Must be "sent".`
      );
    }

    if (item.saleOutcome) {
      throw new Error(
        `Sale outcome already registered for review item ${reviewId}`
      );
    }

    item.saleOutcome = {
      sale,
      amount: options?.amount,
      note: options?.note,
      createdAt: new Date(),
    };

    logSaleOutcome(item, sale, options);

    this.persist();
  }

  /**
   * Mark a suggestion as manually sent (no API call).
   * Only allowed if status is "pending_review".
   * Sets chosenSuggestionId, changes status to "sent", logs manual_suggestion_sent.
   * Does NOT call whatsappClient.
   */
  markManualSent(reviewId: string, suggestionId: string, sentText?: string): ReviewItem {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }

    if (item.status === "cancelled") {
      throw new Error(`Review item ${reviewId} is cancelled`);
    }
    if (item.status === "expired") {
      throw new Error(`Review item ${reviewId} is expired`);
    }
    if (item.status === "sent") {
      throw new Error(`Review item ${reviewId} is already sent`);
    }
    if (item.status === "approved") {
      throw new Error(
        `Review item ${reviewId} is already approved. Use "Enviar mock" instead.`
      );
    }

    const suggestion = item.suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found in review item ${reviewId}`);
    }

    if (sentText && sentText.trim()) {
      suggestion.text = sentText.trim();
    }

    item.chosenSuggestionId = suggestionId;
    item.status = "sent";
    item.updatedAt = new Date();

    // Log manual_suggestion_sent (no whatsappClient call)
    logManualSuggestionSent(item);

    this.persist();

    return item;
  }

  /**
   * Mark a manually typed response as sent.
   * Creates a synthetic suggestion so metrics, history and learning can use the exact sent text.
   */
  markManualTextSent(reviewId: string, text: string): ReviewItem {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }
    if (item.status === "cancelled") {
      throw new Error(`Review item ${reviewId} is cancelled`);
    }
    if (item.status === "expired") {
      throw new Error(`Review item ${reviewId} is expired`);
    }
    if (item.status === "sent") {
      throw new Error(`Review item ${reviewId} is already sent`);
    }
    if (item.status === "approved") {
      throw new Error(`Review item ${reviewId} is already approved. Use "Enviar mock" instead.`);
    }

    const cleanText = text.trim();
    if (!cleanText) {
      throw new Error("Manual text is required");
    }

    const suggestion: ReplySuggestion = {
      id: `manual_${crypto.randomUUID()}`,
      type: "human",
      text: cleanText,
      validated: true,
      createdAt: new Date(),
    };

    item.suggestions = [suggestion, ...item.suggestions];
    item.chosenSuggestionId = suggestion.id;
    item.status = "sent";
    item.updatedAt = new Date();

    logManualSuggestionSent(item);
    this.persist();

    return item;
  }

  /**
   * Update the manual lead status for a review item.
   * Only updates the in-memory field, no event logged.
   */
  updateManualStatus(reviewId: string, status: "novo" | "conversando" | "interessado" | "comprou" | "nao_comprou"): ReviewItem {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }

    item.manualStatus = status;
    item.updatedAt = new Date();
    this.persist();
    return item;
  }

  /**
   * Update the manual note for a review item.
   * Only updates the in-memory field, no event logged.
   */
  updateManualNote(reviewId: string, note: string): ReviewItem {
    const item = this.items.get(reviewId);
    if (!item) {
      throw new Error(`Review item ${reviewId} not found`);
    }

    item.manualNote = note;
    item.updatedAt = new Date();
    this.persist();
    return item;
  }
}

export const reviewQueue = new ReviewQueue();
