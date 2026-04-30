import { Conversation, BotResponse } from "../types/conversation";
import { Intent } from "../types/intent";
import messages from "../templates/messages.json";

export function handleEntry(conversation: Conversation): BotResponse[] {
  const intent = conversation.currentIntent;

  switch (intent) {
    case Intent.PositiveConfirmation:
      return [
        { type: "text", content: messages.positive_confirmation.text },
      ];

    case Intent.AskPrice:
      return [
        { type: "text", content: messages.ask_price.text },
      ];

    case Intent.AskDelivery:
      return [
        { type: "text", content: messages.delivery_info.text },
      ];

    case Intent.AskTargetAudience:
      return [
        { type: "text", content: messages.target_audience.text },
      ];

    case Intent.StopContact:
      return [
        { type: "text", content: messages.stop_contact.text },
      ];

    case Intent.HumanNeeded:
      return [
        { type: "text", content: messages.human_needed.text },
      ];

    case Intent.Unknown:
    default:
      return [
        { type: "text", content: messages.entry.text },
      ];
  }
}
