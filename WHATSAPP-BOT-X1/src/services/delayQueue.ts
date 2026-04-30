import { salesRules } from "../config/rules";

interface QueuedMessage {
  contactPhone: string;
  messageText: string;
  receivedAt: Date;
}

interface PendingResponse {
  contactPhone: string;
  responses: QueuedMessage[];
  timerId: ReturnType<typeof setTimeout> | null;
}

class DelayQueue {
  private pending: Map<string, PendingResponse> = new Map();
  private readonly minDelay: number;
  private readonly maxDelay: number;

  constructor() {
    this.minDelay = salesRules.delayMinSeconds * 1000;
    this.maxDelay = salesRules.delayMaxSeconds * 1000;
  }

  /**
   * Add a message to the queue for a contact.
   * Messages received in sequence for the same contact are grouped.
   */
  addMessage(contactPhone: string, messageText: string): void {
    const existing = this.pending.get(contactPhone);

    const newMessage: QueuedMessage = {
      contactPhone,
      messageText,
      receivedAt: new Date(),
    };

    if (existing) {
      // Group: add to existing pending responses
      existing.responses.push(newMessage);
      return;
    }

    // New contact: create pending entry
    const pendingResponse: PendingResponse = {
      contactPhone,
      responses: [newMessage],
      timerId: null,
    };

    this.pending.set(contactPhone, pendingResponse);
  }

  /**
   * Check if there are pending messages for a contact.
   */
  hasPending(contactPhone: string): boolean {
    return this.pending.has(contactPhone);
  }

  /**
   * Get the grouped messages for a contact and clear the pending state.
   * Returns null if no pending messages.
   */
  consumePending(contactPhone: string): QueuedMessage[] | null {
    const pending = this.pending.get(contactPhone);
    if (!pending) return null;

    this.pending.delete(contactPhone);
    return pending.responses;
  }

  /**
   * Generate a random human-like delay in milliseconds.
   */
  getRandomDelay(): number {
    return Math.floor(Math.random() * (this.maxDelay - this.minDelay + 1)) + this.minDelay;
  }

  /**
   * Wait for the random delay period.
   * If SIMULATION_FAST=true, resolves immediately (for testing).
   */
  async waitForDelay(): Promise<void> {
    if (process.env.SIMULATION_FAST === "true") {
      return;
    }
    const delay = this.getRandomDelay();
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Clear all pending messages.
   */
  clear(): void {
    for (const [, pending] of this.pending) {
      if (pending.timerId) {
        clearTimeout(pending.timerId);
      }
    }
    this.pending.clear();
  }
}

export const delayQueue = new DelayQueue();
