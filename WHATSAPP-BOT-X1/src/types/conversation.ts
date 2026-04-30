import { Intent } from "./intent";

export interface Contact {
  phone: string;
  name: string;
  firstInteractionAt: Date;
  lastInteractionAt: Date;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  text: string;
  timestamp: Date;
  type: "text" | "image" | "document";
}

export interface Conversation {
  contact: Contact;
  messages: Message[];
  currentIntent: Intent | null;
  step: string;
  isActive: boolean;
  needsHuman: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BotResponse {
  type: "text" | "image" | "document";
  content: string;
  caption?: string;
}
