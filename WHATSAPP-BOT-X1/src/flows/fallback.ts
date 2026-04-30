import { BotResponse } from "../types/conversation";
import messages from "../templates/messages.json";

export function handleFallback(): BotResponse[] {
  return [
    { type: "text", content: messages.fallback.text },
  ];
}

export function handleHumanNeeded(): BotResponse[] {
  return [
    { type: "text", content: messages.human_needed.text },
  ];
}

export function handleUnknown(): BotResponse[] {
  return [
    { type: "text", content: messages.unknown.text },
  ];
}
