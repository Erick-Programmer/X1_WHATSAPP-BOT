import { Intent } from "../types/intent";
import { ReplySuggestion, SuggestionType } from "../types/copilot";
import { commercialConfig } from "../config/commercial";
import { validateResponse } from "./qaValidator";
import messages from "../templates/messages.json";

/**
 * Generate a single suggestion for a given intent, suggestion type, and round.
 * Round 1: standard phrases.
 * Round 2: alternative phrases (different wording, same rules).
 * Never hardcodes price, link, discount, urgency, or guarantee.
 */
function buildSuggestion(intent: Intent, type: SuggestionType, round: number = 1): string {
  const price = commercialConfig.price;
  const hasCheckout = commercialConfig.isCheckoutConfigured;
  const platform = commercialConfig.checkoutPlatform;

  switch (intent) {
    case Intent.AskPrice: {
      if (round === 2) {
        if (type === "direct") {
          return `O valor do pacote é ${price}. Quer que eu te mostre como acessar?`;
        }
        if (type === "explanatory") {
          return `O Planner Estudante Pro custa ${price} e vem com 10 planners + 3 ebooks. Tudo em PDF. Posso te mandar as informações de acesso?`;
        }
        return `O preço é ${price} pelo pacote completo com 10 planners e 3 ebooks. Quer que eu te explique o que vem no pacote?`;
      }
      // round 1
      if (type === "direct") {
        return `O pacote completo sai por ${price}. Quer garantir o seu?`;
      }
      if (type === "explanatory") {
        const checkoutNote = hasCheckout
          ? ` O pagamento é pelo ${platform}.`
          : "";
        return `O Planner Estudante Pro tem 10 planners em PDF para organizar seus estudos. O investimento é de ${price}.${checkoutNote} Posso te passar mais detalhes?`;
      }
      // human
      const checkoutNote = hasCheckout
        ? ` Pelo ${platform} é rapidinho.`
        : "";
      return `Olha, o pacote com 10 planners e 3 ebooks de bônus sai por ${price}.${checkoutNote} Se quiser, posso te explicar melhor o que vem!`;
    }

    case Intent.AskDelivery: {
      if (round === 2) {
        if (type === "direct") {
          return `O material é digital. Depois da compra, você recebe por e-mail com acesso ao Google Drive.`;
        }
        if (type === "explanatory") {
          return `Tudo em PDF. Depois da compra, você recebe por e-mail com acesso ao Google Drive. Dá pra usar no celular, tablet ou computador.`;
        }
        return `É 100% digital. Depois da compra, você recebe por e-mail com acesso ao Google Drive.`;
      }
      if (type === "direct") {
        return `A entrega é digital em PDF. Depois da compra, você recebe por e-mail com acesso ao Google Drive.`;
      }
      if (type === "explanatory") {
        return `O material é 100% digital em PDF. Você pode imprimir ou usar no tablet, celular ou computador. Depois da compra, você recebe por e-mail com acesso ao Google Drive.`;
      }
      return `É tudo digital, viu? Depois da compra, você recebe por e-mail com acesso ao Google Drive. Pode usar onde quiser — tablet, celular, computador, ou imprimir.`;
    }

    case Intent.AskContent: {
      if (round === 2) {
        if (type === "direct") {
          return `10 planners + 3 ebooks bônus. Tudo em PDF pra organizar seus estudos.`;
        }
        if (type === "explanatory") {
          return `O pacote tem 10 planners (mensal, semanal, simulados, metas) e 3 ebooks com técnicas de estudo. Tudo em PDF.`;
        }
        return `10 planners diferentes e 3 ebooks de bônus. PDF pra usar como quiser!`;
      }
      if (type === "direct") {
        return `São 10 planners completos + 3 ebooks bônus. Tudo em PDF para organizar seus estudos.`;
      }
      if (type === "explanatory") {
        return `O pacote inclui 10 planners para organizar desde o planejamento mensal até simulados, mais 3 ebooks com técnicas de estudo, organização escolar e foco. Tudo em PDF.`;
      }
      return `Vem bastante coisa! São 10 planners diferentes e ainda 3 ebooks de bônus com dicas de estudo. Tudo em PDF pra você usar como preferir.`;
    }

    case Intent.AskTargetAudience: {
      if (round === 2) {
        if (type === "direct") {
          return `É pra estudantes do Fundamental II, Ensino Médio e quem estuda pra ENEM ou vestibular.`;
        }
        if (type === "explanatory") {
          return `O Planner foi criado pra estudantes do Fundamental II, Ensino Médio e pré-vestibular. Também atende pais que querem ajudar os filhos.`;
        }
        return `Atende do Fundamental II até ENEM e vestibular. Pais também usam pra ajudar os filhos.`;
      }
      if (type === "direct") {
        return `É para estudantes do Fundamental II, Ensino Médio e quem está se preparando para ENEM ou vestibular.`;
      }
      if (type === "explanatory") {
        return `O Planner Estudante Pro foi feito para estudantes do Ensino Fundamental II, Ensino Médio e quem está se preparando para ENEM ou vestibular. Também atende pais que querem ajudar os filhos na organização escolar.`;
      }
      return `Atende desde o Fundamental II até quem tá estudando pra ENEM ou vestibular. E se for pai ou mãe querendo ajudar o filho, também serve super bem!`;
    }

    case Intent.ObjectionExpensive: {
      if (round === 2) {
        if (type === "direct") {
          return `São ${price} por 10 planners + 3 ebooks. A ideia é facilitar a organização da rotina de estudos.`;
        }
        if (type === "explanatory") {
          return `O valor é ${price} pelo pacote completo com 10 planners e 3 ebooks. É um material que ajuda na organização dos estudos.`;
        }
        return `Entendo. O pacote completo sai por ${price} com 10 planners e 3 ebooks. A ideia é facilitar a organização da rotina de estudos.`;
      }
      if (type === "direct") {
        return `O investimento é de ${price} por 10 planners + 3 ebooks. A ideia é facilitar a organização da rotina de estudos.`;
      }
      if (type === "explanatory") {
        return `O Planner Estudante Pro custa ${price} e acompanha o ano todo com 10 planners e 3 ebooks. É um material que ajuda na organização dos estudos.`;
      }
      return `Eu entendo. São ${price} por 10 planners e mais 3 ebooks de bônus. A ideia é facilitar a organização da rotina de estudos.`;
    }

    case Intent.ObjectionThink: {
      if (round === 2) {
        if (type === "direct") {
          return `Fique à vontade! Se quiser ver mais detalhes do conteúdo, é só falar.`;
        }
        if (type === "explanatory") {
          return `Sem pressa. Se surgir alguma dúvida sobre o conteúdo ou funcionamento, pode me perguntar.`;
        }
        return `Tranquilo! Quando quiser saber mais sobre o pacote, é só me chamar.`;
      }
      if (type === "direct") {
        return `Sem pressa! Se quiser, posso te mostrar mais detalhes do conteúdo para ajudar na decisão.`;
      }
      if (type === "explanatory") {
        return `Entendo, fique à vontade. Se tiver qualquer dúvida sobre o conteúdo ou funcionamento, pode perguntar. Posso te mostrar mais detalhes se quiser.`;
      }
      return `Claro, sem problema nenhum! Se quiser saber mais sobre o que vem no pacote ou como funciona, é só falar.`;
    }

    case Intent.BuyIntent: {
      if (round === 2) {
        if (type === "direct") {
          if (hasCheckout) {
            return `Pode fechar pelo ${platform} por ${price}. Quer o link de pagamento?`;
          }
          return `O valor é ${price}. Me avisa que eu passo as informações de acesso.`;
        }
        if (type === "explanatory") {
          if (hasCheckout) {
            return `Pra adquirir, o pagamento é pelo ${platform} no valor de ${price}. Depois da compra, você recebe por e-mail com acesso ao Google Drive. Quer o link?`;
          }
          return `O valor é ${price}. Depois da compra, você recebe por e-mail com acesso ao Google Drive. Me avisa que eu passo os dados.`;
        }
        if (hasCheckout) {
          return `Beleza! O valor é ${price} pelo ${platform}. Te envio o link e você recebe na hora.`;
        }
        return `O valor é ${price}. Me avisa que eu te passo os dados de acesso.`;
      }
      if (type === "direct") {
        if (hasCheckout) {
          return `Pode fechar pelo ${platform}. O valor é ${price}. Quer o link?`;
        }
        return `O valor é ${price}. Me avise que eu passo as informações de acesso para você.`;
      }
      if (type === "explanatory") {
        if (hasCheckout) {
          return `Para adquirir, o pagamento é pelo ${platform} no valor de ${price}. Depois da compra, você recebe por e-mail com acesso ao Google Drive. Quer o link?`;
        }
        return `O valor é ${price} com entrega digital por e-mail. Me avise que eu passo as informações de acesso para você.`;
      }
      if (hasCheckout) {
        return `Fechou! O valor é ${price} pelo ${platform}. Te envio o link para pagamento e você recebe na hora.`;
      }
      return `O valor é ${price}. Me avisa que eu te passo os dados de acesso direitinho.`;
    }

    case Intent.PositiveConfirmation: {
      if (round === 2) {
        if (type === "direct") {
          return `Legal! Vou te mostrar o conteúdo do pacote.`;
        }
        if (type === "explanatory") {
          return `Show! Deixa eu te apresentar o Planner Estudante Pro. São 10 planners completos.`;
        }
        return `Bacana! Vou te mostrar o que vem no pacote.`;
      }
      if (type === "direct") {
        return `Que bom! Vou te mostrar o que vem no pacote.`;
      }
      if (type === "explanatory") {
        return `Legal! Deixa eu te mostrar o Planner Estudante Pro. São 10 planners completos para organizar seus estudos.`;
      }
      return `Que ótimo! Vou te mostrar tudinho o que vem no pacote.`;
    }

    case Intent.StopContact: {
      return `Sem problemas. Se mudar de ideia depois, é só me chamar. Tenha um ótimo dia!`;
    }

    case Intent.HumanNeeded: {
      return `Vou verificar isso com calma e já te respondo por aqui.`;
    }

    case Intent.Unknown:
    default: {
      return `Obrigado pela mensagem! Se tiver dúvidas sobre o Planner Estudante Pro, pode perguntar. É um pacote digital com 10 planners e 3 ebooks para organizar seus estudos.`;
    }
  }
}

/**
 * Generate 3 reply suggestions (direct, explanatory, human) for a given intent.
 * @param round - 1 for standard phrases, 2+ for alternative phrases.
 * Each suggestion is validated by qaValidator.
 * If validation fails, the suggestion is still included but marked as not validated.
 */
export function generateSuggestions(intent: Intent, round: number = 1): ReplySuggestion[] {
  const types: SuggestionType[] = ["direct", "explanatory", "human"];

  return types.map((type) => {
    const text = buildSuggestion(intent, type, round);
    const response = [{ type: "text" as const, content: text }];
    const validation = validateResponse(response);

    return {
      id: crypto.randomUUID(),
      type,
      text,
      validated: validation.approved,
      createdAt: new Date(),
    };
  });
}
