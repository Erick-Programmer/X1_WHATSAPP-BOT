import { Intent } from "./intent";

export type ReviewStatus =
  | "pending_review"
  | "approved"
  | "sent"
  | "cancelled"
  | "expired";

export type SuggestionType = "direct" | "explanatory" | "human";

export interface ReplySuggestion {
  id: string;
  type: SuggestionType;
  text: string;
  validated: boolean;
  createdAt: Date;
}

export interface SaleOutcome {
  sale: boolean;
  amount?: string;
  note?: string;
  createdAt: Date;
}

export interface ReviewItem {
  id: string;
  contactId: string;
  messageId: string;
  customerMessage: string;
  intent: Intent;
  suggestions: ReplySuggestion[];
  status: ReviewStatus;
  chosenSuggestionId: string | null;
  saleOutcome?: SaleOutcome;
  createdAt: Date;
  updatedAt: Date;
}
