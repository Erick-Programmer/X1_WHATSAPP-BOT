import { Intent } from "../types/intent";
import { ReplySuggestion, SuggestionType } from "../types/copilot";
import { commercialConfig } from "../config/commercial";
import { validateResponse } from "./qaValidator";
import messages from "../templates/messages.json";

function pickByRound(round: number, options: string[]): string {
  return options[(Math.max(round, 3) - 3) % options.length];
}

function buildExtendedSuggestion(
  intent: Intent,
  type: SuggestionType,
  round: number,
  price: string,
  hasCheckout: boolean,
  platform: string
): string {
  switch (intent) {
    case Intent.AskPrice:
      if (type === "direct") {
        return pickByRound(round, [
          `Fica ${price} o pacote completo. Quer que eu te mande o acesso?`,
          `O pacote está ${price}. Posso te passar o próximo passo?`,
          `Sai por ${price}, com os 10 planners e os 3 ebooks juntos.`,
        ]);
      }
      if (type === "explanatory") {
        return pickByRound(round, [
          `O valor é ${price} pelo Planner Estudante Pro completo: 10 planners digitais e 3 ebooks bônus em PDF.`,
          `Por ${price}, você recebe o pacote completo em PDF para organizar rotina, estudos, tarefas e provas.`,
          `O investimento é ${price}. É um pacote digital com planners e ebooks para ajudar na organização dos estudos.`,
        ]);
      }
      return pickByRound(round, [
        `Isso, o pacote completo fica ${price}. Se quiser, eu te mostro rapidinho como acessar.`,
        `Fica ${price}. Vem tudo junto: planners, ebooks e os arquivos em PDF.`,
        `O valor é ${price}. É bem direto: comprou, recebe o acesso aos arquivos digitais.`,
      ]);

    case Intent.BuyIntent:
      if (type === "direct") {
        return hasCheckout
          ? pickByRound(round, [
              `Fechado. Posso te mandar o link do ${platform} para finalizar por ${price}.`,
              `Perfeito. O pagamento é pelo ${platform} e fica ${price}. Quer que eu envie o link?`,
              `Pode sim. O pacote sai por ${price}; te passo o link de pagamento.`,
            ])
          : pickByRound(round, [
              `Fechado. O valor é ${price}; eu te passo as informações para acessar.`,
              `Pode sim. O pacote sai por ${price}; já te explico o próximo passo.`,
              `Perfeito. Fica ${price}; vou te passar como finalizar.`,
            ]);
      }
      if (type === "explanatory") {
        return pickByRound(round, [
          `Para finalizar, o pacote fica ${price}. Depois da compra, você recebe o acesso por e-mail com os arquivos digitais.`,
          `A compra é simples: o valor é ${price} e o material é entregue digitalmente em PDF.`,
          `Você finaliza a compra por ${price} e recebe o link de acesso aos planners e ebooks no e-mail.`,
        ]);
      }
      return pickByRound(round, [
        `Bora. O pacote completo fica ${price}; eu te mando o caminho para finalizar.`,
        `Show, dá para finalizar agora. O valor é ${price} e o acesso chega por e-mail.`,
        `Combinado. Fica ${price}; te passo o link certinho para concluir.`,
      ]);

    case Intent.PositiveConfirmation:
      if (type === "direct") {
        return pickByRound(round, [
          `Perfeito, vou te mostrar o pacote completo.`,
          `Claro. Vou te mandar uma visão geral do que vem.`,
          `Sim, vou te apresentar os planners e os bônus.`,
        ]);
      }
      if (type === "explanatory") {
        return pickByRound(round, [
          `O Planner Estudante Pro reúne 10 planners digitais em PDF e 3 ebooks bônus para organizar estudos, tarefas e metas.`,
          `Ele foi pensado para rotina de estudante: planejamento, tarefas, revisão, provas e acompanhamento dos estudos.`,
          `Vou te mostrar a imagem geral do produto para você ver os 10 planners e os 3 ebooks bônus juntos.`,
        ]);
      }
      return pickByRound(round, [
        `Boa! Vou te mostrar de um jeito simples o que vem no pacote.`,
        `Fechado, vou te mandar a visão geral pra você entender rapidinho.`,
        `Ótimo, vou te mostrar o conteúdo principal e os bônus.`,
      ]);

    case Intent.AskDelivery:
      if (type === "direct") {
        return pickByRound(round, [
          `É digital em PDF. Depois da compra, você recebe o acesso por e-mail.`,
          `Você recebe por e-mail o link de acesso aos arquivos digitais.`,
          `É tudo online: os arquivos ficam disponíveis por link depois da compra.`,
        ]);
      }
      if (type === "explanatory") {
        return pickByRound(round, [
          `Os planners e ebooks são em PDF. Você pode usar no celular, tablet, computador ou imprimir.`,
          `A entrega é digital: após a compra, chega no e-mail o link para acessar os arquivos.`,
          `Você não recebe produto físico; é um pacote digital em PDF para baixar e usar.`,
        ]);
      }
      return pickByRound(round, [
        `É digital mesmo. Comprou, recebe o acesso no e-mail e usa como preferir.`,
        `Vem por link no e-mail, tudo em PDF.`,
        `Dá para usar digital ou imprimir, porque os arquivos são em PDF.`,
      ]);

    case Intent.AskContent:
      if (type === "direct") {
        return pickByRound(round, [
          `Vêm 10 planners digitais e 3 ebooks bônus.`,
          `O pacote tem planners de organização, estudo, tarefas, provas e metas.`,
          `Inclui os 10 planners em PDF mais os 3 guias bônus.`,
        ]);
      }
      if (type === "explanatory") {
        return pickByRound(round, [
          `O conteúdo cobre organização escolar, rotina, tarefas, estudos, provas, projetos e metas.`,
          `Além dos 10 planners, os ebooks ajudam com organização, estudo ativo e planejamento de futuro.`,
          `A ideia é dar ferramentas práticas para o estudante organizar a semana, revisar e acompanhar tarefas.`,
        ]);
      }
      return pickByRound(round, [
        `Vem bem completo: planners para usar no dia a dia e ebooks para orientar melhor a rotina.`,
        `Tem bastante coisa prática para preencher e acompanhar os estudos.`,
        `São arquivos para organizar estudo, prova, tarefa e planejamento.`,
      ]);

    case Intent.ObjectionExpensive:
      if (type === "direct") {
        return pickByRound(round, [
          `Entendo. O valor é pelo pacote completo com 10 planners e 3 ebooks.`,
          `Eu entendo. A ideia é reunir várias ferramentas em um pacote só.`,
          `Faz sentido pensar. São ${price} pelo conjunto completo em PDF.`,
        ]);
      }
      if (type === "explanatory") {
        return pickByRound(round, [
          `O pacote foi montado para ajudar na organização da rotina, sem prometer resultado mágico.`,
          `Além dos planners, os ebooks explicam como usar melhor o material na rotina de estudo.`,
          `É um material de apoio para organizar tarefas, provas, revisões e metas ao longo do ano.`,
        ]);
      }
      return pickByRound(round, [
        `Super entendo. Se quiser, posso te mostrar exatamente o que vem antes de decidir.`,
        `Tranquilo. Posso te explicar o conteúdo para você ver se faz sentido.`,
        `Sem problema. É bom olhar o que vem no pacote e decidir com calma.`,
      ]);

    default:
      if (type === "direct") {
        return pickByRound(round, [
          `Entendi. Sobre o Planner Estudante Pro, posso te ajudar com preço, conteúdo ou acesso.`,
          `Certo. Se sua dúvida for sobre o planner, posso te explicar de forma simples.`,
          `Beleza. Quer saber sobre o conteúdo, valor ou como receber?`,
        ]);
      }
      if (type === "explanatory") {
        return pickByRound(round, [
          `O Planner Estudante Pro é um pacote digital com 10 planners em PDF e 3 ebooks bônus para organização dos estudos.`,
          `Posso te explicar o que vem no pacote, para quem serve, valor e como funciona o acesso.`,
          `O foco do material é ajudar na organização escolar e na rotina de estudos com páginas práticas em PDF.`,
        ]);
      }
      return pickByRound(round, [
        `Me fala o que você quer saber que eu te explico direitinho.`,
        `Posso te ajudar por partes: conteúdo, preço ou como receber.`,
        `Se for sobre o Planner Estudante Pro, eu te explico rapidinho.`,
      ]);
  }
}

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

  if (round > 2) {
    return buildExtendedSuggestion(intent, type, round, price, hasCheckout, platform);
  }

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
