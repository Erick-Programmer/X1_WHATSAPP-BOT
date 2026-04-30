import { BotResponse } from "../types/conversation";
import messages from "../templates/messages.json";
import media from "../templates/media.json";

export function handleProductPresentation(): BotResponse[] {
  return [
    { type: "text", content: messages.product_main.text },
    {
      type: "image",
      content: media.product_planners.file,
      caption: media.product_planners.caption,
    },
    { type: "text", content: "Quer saber o valor e como ter acesso ao pacote completo?" },
  ];
}
