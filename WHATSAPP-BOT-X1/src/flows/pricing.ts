import { BotResponse } from "../types/conversation";
import { productConfig } from "../config/product";
import { commercialConfig, CommercialConfig } from "../config/commercial";
import { commercialSettings } from "../services/commercialSettings";

export function handlePricing(config?: CommercialConfig): BotResponse[] {
  const effectiveConfig = config ?? commercialSettings.getEffectiveConfig();
  if (!effectiveConfig.isCheckoutConfigured) {
    return [
      { type: "text", content: `O valor do Planner Estudante Pro é ${effectiveConfig.price}.` },
      { type: "text", content: "O link de pagamento será enviado em seguida." },
    ];
  }

  return [
    { type: "text", content: `O valor do Planner Estudante Pro é ${effectiveConfig.price}.` },
    { type: "text", content: `Você pode finalizar por aqui: ${effectiveConfig.checkoutUrl}` },
  ];
}
