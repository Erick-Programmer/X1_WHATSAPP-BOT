import { BotResponse } from "../types/conversation";
import { commercialConfig, CommercialConfig } from "../config/commercial";
import { commercialSettings } from "../services/commercialSettings";

export function handleClosing(config?: CommercialConfig): BotResponse[] {
  const effectiveConfig = config ?? commercialSettings.getEffectiveConfig();
  if (!effectiveConfig.isCheckoutConfigured) {
    return [
      { type: "text", content: "Posso te mandar o link de pagamento em seguida." },
    ];
  }

  return [
    { type: "text", content: `Finalize sua compra por aqui: ${effectiveConfig.checkoutUrl}` },
  ];
}

export function handleStopContact(): BotResponse[] {
  return [
    { type: "text", content: "Tudo bem. Se mudar de ideia, é só chamar." },
  ];
}
