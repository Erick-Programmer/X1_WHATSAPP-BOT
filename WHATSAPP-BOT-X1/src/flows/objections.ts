import { BotResponse } from "../types/conversation";
import { Intent } from "../types/intent";
import messages from "../templates/messages.json";

export function handleObjection(intent: Intent): BotResponse[] {
  switch (intent) {
    case Intent.ObjectionThink:
      return [
        { type: "text", content: messages.objection_think.text },
      ];

    case Intent.ObjectionExpensive:
      return [
        { type: "text", content: messages.objection_expensive.text },
        { type: "text", content: "Quer dar uma olhada no conteúdo para ver se atende?" },
      ];

    default:
      return [
        { type: "text", content: messages.fallback.text },
      ];
  }
}
