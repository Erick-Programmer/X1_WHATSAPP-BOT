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
} from "./eventLogger";

/**
 * In-memory review queue for the copilot mode.
 * Stores pending review items and manages their lifecycle.
 * No database — uses a local Map.
 */
class ReviewQueue {
  private items: Map<string, ReviewItem> = new Map();

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
      status: "pending_review",
      chosenSuggestionId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.items.set(item.id, item);

    // Log review_created + suggestions_generated
    logReviewCreated(item);

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

    return item;
  }

  /**
   * Replace suggestions for a review item with new ones.
   * Only allowed if status is "pending_review".
   * Keeps the item in pending_review status.
   * Resets chosenSuggestionId to null.
   */
  regenerateSuggestions(reviewId: string, newSuggestions: ReplySuggestion[]): ReviewItem {
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
    item.chosenSuggestionId = null;
    item.updatedAt = new Date();

    // Log suggestions_regenerated + new suggestions_generated
    logSuggestionsRegenerated(item);

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
  }
}

export const reviewQueue = new ReviewQueue();
