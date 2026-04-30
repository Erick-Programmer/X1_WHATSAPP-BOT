import { Conversation, BotResponse } from "../types/conversation";
import { Intent } from "../types/intent";
import messages from "../templates/messages.json";

export function handleQualification(conversation: Conversation): BotResponse[] {
  const intent = conversation.currentIntent;

  switch (intent) {
    case Intent.AskTargetAudience:
      return [
        { type: "text", content: messages.target_audience.text },
        { type: "text", content: "Você é estudante ou está buscando para alguém?" },
      ];

    case Intent.AskContent:
      return [
        { type: "text", content: "O pacote inclui 10 planners diferentes: mensal, semanal, estudos, metas, simulados, provas, leitura, finanças, hábitos e férias. Além de 3 ebooks bônus." },
        { type: "text", content: "Quer que eu mostre como é o material?" },
      ];

    case Intent.AskDelivery:
      return [
        { type: "text", content: messages.delivery_info.text },
      ];

    default:
      return [
        { type: "text", content: "Para qual nível de estudo você está buscando organização? Fundamental, Médio ou cursinho/vestibular?" },
      ];
  }
}
