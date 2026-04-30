import { Conversation, BotResponse } from "../types/conversation";
import { Intent } from "../types/intent";
import { handleEntry } from "../flows/entry";
import { handleQualification } from "../flows/qualification";
import { handleProductPresentation } from "../flows/productPresentation";
import { handlePricing } from "../flows/pricing";
import { handleObjection } from "../flows/objections";
import { handleClosing, handleStopContact } from "../flows/closing";
import { handleFallback, handleHumanNeeded, handleUnknown } from "../flows/fallback";

export function generateResponse(conversation: Conversation): BotResponse[] {
  const intent = conversation.currentIntent;

  if (!intent) {
    return handleEntry(conversation);
  }

  switch (intent) {
    case Intent.PositiveConfirmation:
      return handleProductPresentation();

    case Intent.AskPrice:
      return handlePricing();

    case Intent.AskDelivery:
    case Intent.AskContent:
    case Intent.AskTargetAudience:
      return handleQualification(conversation);

    case Intent.ObjectionExpensive:
    case Intent.ObjectionThink:
      return handleObjection(intent);

    case Intent.BuyIntent:
      return handleClosing();

    case Intent.StopContact:
      return handleStopContact();

    case Intent.HumanNeeded:
      return handleHumanNeeded();

    case Intent.Unknown:
    default:
      return handleUnknown();
  }
}
