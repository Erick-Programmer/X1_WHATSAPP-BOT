import { Intent } from "../types/intent";
import { ReplySuggestion, SuggestionType } from "../types/copilot";
import { commercialConfig } from "../config/commercial";
import { productKnowledge } from "../config/product";
import { validateResponse } from "./qaValidator";

function pick(arr: string[], index: number = 0): string {
  return arr[index % arr.length];
}

function pickByRound(round: number, options: string[]): string {
  return options[(Math.max(round, 1) - 1) % options.length];
}

function buildSuggestion(intent: Intent, type: SuggestionType, round: number = 1): string {
  const price = commercialConfig.price;
  const hasCheckout = commercialConfig.isCheckoutConfigured;
  const platform = commercialConfig.checkoutPlatform;
  const pk = productKnowledge;

  // Exemplos de planners para citar nas respostas
  const plannerExamples = "Cyber Focus, Lavender Study, Black & Gold Elite, Neo Zebra, Candy Dream";
  const ebookNames = pk.ebooks.map(e => e.name).join(", ");

  switch (intent) {

    case Intent.AskPrice:
      if (type === "direct") return pickByRound(round, [
        `Fica ${price} o pacote completo. São 10 planners + 3 ebooks bônus.`,
        `O pacote sai por ${price}. 10 planners em PDF e mais 3 ebooks de bônus.`,
        `${price} pelo conjunto completo: 10 planners e 3 ebooks.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `O valor é ${price} pelo Planner Estudante Pro completo: 10 planners digitais (${plannerExamples} e mais) e 3 ebooks bônus em PDF. Tudo digital, acesso por e-mail.`,
        `Por ${price} você recebe 10 planners com estilos diferentes — do gamer ao minimalista — mais os ebooks ${ebookNames}. Tudo em PDF.`,
        `O investimento é ${price}. São 10 planners para escolher o que mais combina com você, mais 3 ebooks de organização, estudos e metas.`,
      ]);
      return pickByRound(round, [
        `O pacote completo sai por ${price}. São 10 planners digitais diferentes e mais 3 ebooks de bônus — tudo em PDF pra usar como quiser.`,
        `${price} e você leva 10 planners (tem de todos os estilos: gamer, pastel, premium, minimalista...) mais 3 ebooks. Vale muito.`,
        `Fica ${price}. Vem bastante coisa: 10 planners com visuais diferentes e 3 ebooks bônus. Dá pra usar no celular, tablet ou imprimir.`,
      ]);

    case Intent.AskContent:
      if (type === "direct") return pickByRound(round, [
        `São 10 planners digitais e 3 ebooks bônus, tudo em PDF.`,
        `10 planners com estilos diferentes + 3 ebooks: ${ebookNames}.`,
        `Vêm 10 planners e os ebooks ${ebookNames}.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `Cada planner tem calendário mensal, planejamento semanal, controle de provas, metas, hábitos e mais. Os 10 planners têm estilos diferentes: ${plannerExamples}. Os 3 ebooks ensinam organização, técnicas de estudo e planejamento de futuro.`,
        `O conteúdo cobre a rotina inteira do estudante: de autoconhecimento até controle financeiro. São 4 módulos por planner — Identidade e Visão, Planejamento Mestre, Execução e Notas, e Financeiro e Extra.`,
        `Os planners têm calendário mensal, semana planejada, registro de hábitos, metas e controle de provas. Os ebooks são ${ebookNames} — conteúdo prático pra usar junto.`,
      ]);
      return pickByRound(round, [
        `Vem bem completo! São 10 planners com estilos diferentes — tem o gamer (Cyber Focus), o Studygram (Lavender Study), o premium (Black & Gold Elite) e mais. E ainda 3 ebooks de bônus.`,
        `São 10 planners em PDF, cada um com visual e foco diferente. Mais 3 ebooks: ${ebookNames}. Tudo pra organizar a rotina de estudos.`,
        `Tem bastante coisa: 10 planners com calendário, semana, metas, hábitos e provas — mais os ebooks de bônus sobre organização, estudos e planejamento.`,
      ]);

    case Intent.PositiveConfirmation:
      if (type === "direct") return pickByRound(round, [
        `Vou te mostrar o pacote completo.`,
        `Deixa eu te apresentar os planners e os bônus.`,
        `Perfeito, vou te mostrar tudo que vem.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `O Planner Estudante Pro tem 10 planners digitais com estilos diferentes — do gamer ao minimalista — e 3 ebooks bônus. Tudo em PDF pra organizar estudos, rotina, metas e provas.`,
        `São 10 planners em PDF (${plannerExamples} e mais) com calendário mensal, semana planejada, metas e hábitos. Mais 3 ebooks: ${ebookNames}.`,
        `O pacote reúne 10 planners com visuais únicos e conteúdo completo — mais 3 ebooks práticos. Um planner pra cada perfil de estudante.`,
      ]);
      return pickByRound(round, [
        `Boa! São 10 planners com estilos bem diferentes — tem gamer, pastel, Studygram, premium, minimalista... — mais 3 ebooks de bônus. Vou te mostrar.`,
        `Fechado! Cada planner tem visual próprio e conteúdo completo: calendário, semana, metas, hábitos e provas. Mais os ebooks de bônus.`,
        `Show! 10 planners em PDF pra você escolher o que mais combina, mais 3 ebooks práticos. Deixa eu te mostrar.`,
      ]);

    case Intent.AskDelivery:
      if (type === "direct") return pickByRound(round, [
        `É digital em PDF. Após a compra, você recebe por e-mail com acesso aos arquivos.`,
        `Tudo em PDF. Acesso por e-mail logo após a compra.`,
        `Digital em PDF — chega no e-mail depois da compra.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `Os 10 planners e os 3 ebooks são todos em PDF. Você pode usar no celular, tablet, computador ou imprimir. O acesso chega por e-mail após a compra.`,
        `A entrega é digital: você recebe por e-mail um link com os arquivos em PDF. Dá pra abrir onde quiser ou imprimir na gráfica.`,
        `É 100% digital. Comprou, chega no e-mail com acesso aos PDFs. Pode usar no celular, imprimir ou abrir no tablet.`,
      ]);
      return pickByRound(round, [
        `É tudo digital, viu? Comprou, chega no e-mail com os PDFs — os 10 planners e os 3 ebooks. Pode usar no celular, tablet ou imprimir.`,
        `Digital mesmo. Acesso por e-mail logo depois da compra. Dá pra usar em qualquer dispositivo ou imprimir.`,
        `Você recebe por e-mail, tudo em PDF. Dá pra imprimir ou usar digital no celular ou tablet.`,
      ]);

    case Intent.AskTargetAudience:
      if (type === "direct") return pickByRound(round, [
        `É para estudantes do Fundamental II, Ensino Médio e quem está se preparando para o ENEM ou vestibular.`,
        `Atende do Fundamental II até ENEM e vestibular. Pais também usam para ajudar os filhos.`,
        `Para estudantes em geral — do Fundamental II ao pré-vestibular.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `O Planner Estudante Pro foi feito para estudantes do Ensino Fundamental II, Ensino Médio e quem prepara o ENEM ou vestibular. Tem 10 estilos diferentes justamente pra atender perfis variados de estudante.`,
        `Atende estudantes de diferentes perfis: tem o Candy Dream (mais leve, para Fundamental II), o Neo Zebra (foco em ENEM), o Lavender Study (Studygram), o Cyber Focus (gamer) e mais.`,
        `Qualquer estudante que queira se organizar melhor. E pais que querem ajudar os filhos também usam muito.`,
      ]);
      return pickByRound(round, [
        `Atende desde o Fundamental II até quem tá estudando pra ENEM ou vestibular. Tem estilos pra todo perfil — mais calmo, mais tech, mais premium.`,
        `É pra estudante de qualquer fase. Tem planner mais lúdico pro Fundamental II e planner mais direto pro ENEM.`,
        `Pra quem estuda — do Fundamental II ao vestibular. E se for pai ou mãe querendo ajudar o filho a se organizar, serve super bem também.`,
      ]);

    case Intent.ObjectionExpensive:
      if (type === "direct") return pickByRound(round, [
        `Entendo. São ${price} por 10 planners e 3 ebooks — dá pra usar o ano inteiro.`,
        `Faz sentido pensar. É ${price} pelo pacote completo com 10 planners em PDF e 3 ebooks bônus.`,
        `Eu entendo. O valor é ${price} pelo conjunto todo — 10 planners com estilos diferentes e mais 3 ebooks.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `O pacote foi montado para entregar muito conteúdo: 10 planners com visuais e focos diferentes, mais os ebooks ${ebookNames}. Tudo em PDF pra usar o ano inteiro.`,
        `São ${price} por 10 planners + 3 ebooks. Cada planner tem calendário, semana, metas, hábitos e controle de provas. É um material pra usar durante todo o ano letivo.`,
        `O investimento é ${price} e você recebe 13 arquivos PDF no total — 10 planners e 3 ebooks de organização, estudos e metas.`,
      ]);
      return pickByRound(round, [
        `Super entendo. Se quiser, posso te mostrar o que vem no pacote pra você avaliar se faz sentido. São 10 planners diferentes e mais 3 ebooks.`,
        `Tranquilo. É ${price} pelo pacote completo — 10 planners com estilos bem diferentes e 3 ebooks. Posso te mostrar mais detalhes antes de decidir.`,
        `Sem problema. É um pacote com bastante conteúdo: 10 planners pra usar o ano inteiro e 3 ebooks de bônus. Posso te explicar melhor o que vem.`,
      ]);

    case Intent.ObjectionThink:
      if (type === "direct") return pickByRound(round, [
        `Sem pressa! Se quiser ver mais do conteúdo antes de decidir, é só falar.`,
        `Fique à vontade. Se surgir dúvida sobre o que vem no pacote, pode perguntar.`,
        `Tranquilo! Quando quiser saber mais, é só me chamar.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `Entendo, sem problema. O pacote tem 10 planners digitais com estilos diferentes e 3 ebooks bônus. Se quiser ver mais detalhes do conteúdo antes de decidir, é só pedir.`,
        `Claro, fique à vontade. Posso te mostrar mais sobre os planners — ${plannerExamples} — ou sobre os ebooks de bônus.`,
        `Sem pressa. Se tiver qualquer dúvida sobre o conteúdo, os estilos ou como funciona o acesso, pode perguntar.`,
      ]);
      return pickByRound(round, [
        `Claro, sem problema nenhum! Se quiser saber mais sobre os planners ou os ebooks antes de decidir, é só falar.`,
        `Tranquilo! Pensa com calma. Se quiser ver o que vem no pacote ou tirar alguma dúvida, é só me chamar.`,
        `Sem pressa. Quando quiser, posso te mostrar mais detalhes dos 10 planners e dos ebooks bônus.`,
      ]);

    case Intent.BuyIntent:
      if (type === "direct") return pickByRound(round, [
        hasCheckout
          ? `Fechado! O valor é ${price} pelo ${platform}. Quer o link?`
          : `O valor é ${price}. Me avisa que eu passo as informações de acesso.`,
        hasCheckout
          ? `Perfeito. Fica ${price} pelo ${platform}. Te envio o link agora.`
          : `O pacote sai por ${price}. Me fala que eu te passo o próximo passo.`,
        hasCheckout
          ? `Pode sim! ${price} pelo ${platform}. Mando o link.`
          : `${price} pelo pacote completo. Me avisa que eu explico como acessar.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        hasCheckout
          ? `Para adquirir, o pagamento é pelo ${platform} no valor de ${price}. Depois da compra, você recebe por e-mail os 10 planners e os 3 ebooks em PDF. Quer o link?`
          : `O valor é ${price} pelo pacote completo: 10 planners + 3 ebooks em PDF. A entrega é por e-mail após a compra. Me avisa que eu passo os detalhes.`,
        hasCheckout
          ? `A compra é pelo ${platform}, fica ${price}. Você recebe tudo por e-mail — os 10 planners e os 3 ebooks bônus em PDF.`
          : `${price} pelo pacote completo. Depois do pagamento, você recebe por e-mail o acesso aos 10 planners e 3 ebooks em PDF.`,
        hasCheckout
          ? `Simples: ${price} pelo ${platform} e você recebe tudo por e-mail. São 10 planners + 3 ebooks em PDF.`
          : `O pacote sai por ${price}. É entrega digital por e-mail — 10 planners e 3 ebooks em PDF.`,
      ]);
      return pickByRound(round, [
        hasCheckout
          ? `Fechou! O valor é ${price} pelo ${platform}. Te envio o link e você recebe os 10 planners e os 3 ebooks no e-mail na hora.`
          : `O valor é ${price}. Me avisa que te passo os dados de acesso direitinho — são 10 planners e 3 ebooks em PDF.`,
        hasCheckout
          ? `Boa! ${price} pelo ${platform}. Mando o link agora. Você recebe tudo por e-mail — os planners e os ebooks.`
          : `Combinado! ${price} pelo pacote. Me fala que eu te explico como receber os arquivos.`,
        hasCheckout
          ? `Perfeito! ${price} e você garante os 10 planners e 3 ebooks. Mando o link do ${platform}.`
          : `Fechado. Me avisa que passo o acesso — ${price} pelo pacote completo em PDF.`,
      ]);

    case Intent.StopContact:
      return `Sem problemas. Se mudar de ideia, é só me chamar. Bons estudos!`;

    case Intent.HumanNeeded:
      return `Vou verificar isso com calma e já te respondo por aqui.`;

    case Intent.Unknown:
    default:
      if (type === "direct") return pickByRound(round, [
        `Pode perguntar! Sobre preço, conteúdo ou como receber — é só falar.`,
        `Me fala o que quer saber que eu explico.`,
        `Pode tirar sua dúvida — sobre o planner, o preço ou como funciona.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `O Planner Estudante Pro é um pacote com 10 planners digitais em PDF e 3 ebooks bônus. Cada planner tem estilo e foco diferentes — do gamer ao minimalista. Posso te explicar preço, conteúdo ou como receber.`,
        `É um pacote digital com 10 planners (${plannerExamples} e mais) e 3 ebooks: ${ebookNames}. Se tiver dúvida sobre o que vem, o valor ou a entrega, pode perguntar.`,
        `O pacote tem 10 planners em PDF com estilos diferentes e 3 ebooks bônus de organização e estudos. Qual é a sua dúvida?`,
      ]);
      return pickByRound(round, [
        `Se for sobre o Planner Estudante Pro, pode perguntar! São 10 planners digitais + 3 ebooks bônus, tudo em PDF.`,
        `Me fala o que quer saber — sobre os planners, os ebooks, o preço ou como receber. Explico rapidinho.`,
        `Posso te ajudar com preço, conteúdo ou acesso. É um pacote com 10 planners e 3 ebooks em PDF.`,
      ]);
  }
}

/**
 * Gera 3 sugestões de resposta (direct, explanatory, human) para a intenção detectada.
 * Round 1: frases padrão. Round 2+: variações alternativas.
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