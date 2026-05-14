import { Intent } from "../types/intent";
import { ReplySuggestion, SuggestionType } from "../types/copilot";
import { commercialConfig } from "../config/commercial";
import { productKnowledge } from "../config/product";
import { validateResponse } from "./qaValidator";
import { generateSuggestionsDeepSeek } from "./deepseekSuggestions";
import { commercialSettings } from "./commercialSettings";
import { DEFAULT_PRODUCT_ID, normalizeProductId } from "./productContext";
import { getProductProfile } from "./productProfile";

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

  const plannerExamples = "Cyber Focus, Lavender Study, Black & Gold Elite, Neo Zebra, Candy Dream";
  const ebookNames = pk.ebooks.map(e => e.name).join(", ");

  switch (intent) {

    case Intent.AskPrice:
      if (type === "direct") return pickByRound(round, [
        `Fica ${price} o pacote completo. São 10 planners e 3 ebooks bônus.`,
        `O pacote sai por ${price}. 10 planners em PDF e mais 3 ebooks de bônus.`,
        `${price} pelo conjunto todo: 10 planners e 3 ebooks.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `O valor é ${price} pelo Planner Estudante Pro completo: 10 planners digitais (${plannerExamples} e mais) e 3 ebooks bônus em PDF. Tudo digital, acesso por e-mail.`,
        `Por ${price} você recebe 10 planners com estilos bem diferentes, do gamer ao minimalista, mais os ebooks ${ebookNames}. Tudo em PDF.`,
        `O investimento é ${price}. São 10 planners pra escolher o que mais combina com você, mais 3 ebooks de organização, estudos e metas.`,
      ]);
      return pickByRound(round, [
        `O pacote completo sai por ${price}. São 10 planners digitais diferentes e mais 3 ebooks de bônus, tudo em PDF pra usar como quiser.`,
        `${price} e você leva 10 planners (tem de todos os estilos: gamer, pastel, premium, minimalista...) mais 3 ebooks. Dá pra usar o ano todo.`,
        `Fica ${price}. Vem bastante coisa: 10 planners com visuais diferentes e 3 ebooks bônus. Dá pra usar no celular, tablet ou imprimir.`,
      ]);

    case Intent.AskContent:
      if (type === "direct") return pickByRound(round, [
        `São 10 planners digitais e 3 ebooks bônus, tudo em PDF.`,
        `10 planners com estilos diferentes e mais 3 ebooks: ${ebookNames}.`,
        `Vêm 10 planners e os ebooks ${ebookNames}.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `Cada planner tem calendário mensal, planejamento semanal, controle de provas, metas, hábitos e mais. Os 10 planners têm estilos diferentes: ${plannerExamples}. Os 3 ebooks ensinam organização, técnicas de estudo e planejamento de futuro.`,
        `O conteúdo cobre a rotina inteira do estudante: de autoconhecimento até controle financeiro. São 4 módulos por planner: Identidade e Visão, Planejamento Mestre, Execução e Notas, e Financeiro e Extra.`,
        `Os planners têm calendário mensal, semana planejada, registro de hábitos, metas e controle de provas. Os ebooks são ${ebookNames}, conteúdo prático pra usar junto.`,
      ]);
      return pickByRound(round, [
        `Vem bem completo. São 10 planners com estilos diferentes: tem o gamer (Cyber Focus), o Studygram (Lavender Study), o premium (Black & Gold Elite) e mais. E ainda 3 ebooks de bônus.`,
        `São 10 planners em PDF, cada um com visual e foco diferente. Mais 3 ebooks: ${ebookNames}. Tudo pra organizar a rotina de estudos.`,
        `Tem bastante coisa: 10 planners com calendário, semana, metas, hábitos e provas, mais os ebooks de bônus sobre organização, estudos e planejamento.`,
      ]);

    case Intent.PositiveConfirmation:
      if (type === "direct") return pickByRound(round, [
        `Deixa eu te mostrar o pacote completo.`,
        `Vou te apresentar os planners e os bônus.`,
        `Boa! Vou te mostrar tudo que vem.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `O Planner Estudante Pro tem 10 planners digitais com estilos diferentes, do gamer ao minimalista, e 3 ebooks bônus. Tudo em PDF pra organizar estudos, rotina, metas e provas.`,
        `São 10 planners em PDF (${plannerExamples} e mais) com calendário mensal, semana planejada, metas e hábitos. Mais 3 ebooks: ${ebookNames}.`,
        `O pacote reúne 10 planners com visuais únicos e conteúdo completo, mais 3 ebooks práticos. Um planner pra cada perfil de estudante.`,
      ]);
      return pickByRound(round, [
        `Boa! São 10 planners com estilos bem diferentes: tem gamer, pastel, Studygram, premium, minimalista... mais 3 ebooks de bônus. Deixa eu te mostrar.`,
        `Cada planner tem visual próprio e conteúdo completo: calendário, semana, metas, hábitos e provas. Mais os ebooks de bônus.`,
        `10 planners em PDF pra você escolher o que mais combina, mais 3 ebooks práticos. Vou te mostrar.`,
      ]);

    case Intent.AskDelivery:
      if (type === "direct") return pickByRound(round, [
        `É digital em PDF. Depois da compra, você recebe por e-mail com acesso aos arquivos.`,
        `Tudo em PDF. Acesso por e-mail logo após a compra.`,
        `Digital em PDF, chega no e-mail depois da compra.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `Os 10 planners e os 3 ebooks são todos em PDF. Você pode usar no celular, tablet, computador ou imprimir. O acesso chega por e-mail após a compra.`,
        `A entrega é digital: você recebe por e-mail um link com os arquivos em PDF. Dá pra abrir em qualquer dispositivo ou imprimir.`,
        `É 100% digital. Comprou, chega no e-mail com acesso aos PDFs. Pode usar no celular, imprimir ou abrir no tablet.`,
      ]);
      return pickByRound(round, [
        `É tudo digital. Comprou, chega no e-mail com os PDFs: os 10 planners e os 3 ebooks. Pode usar no celular, tablet ou imprimir.`,
        `Digital mesmo. Acesso por e-mail logo depois da compra. Dá pra usar em qualquer dispositivo ou imprimir.`,
        `Você recebe por e-mail, tudo em PDF. Dá pra imprimir ou usar no celular ou tablet.`,
      ]);

    case Intent.AskTargetAudience:
      if (type === "direct") return pickByRound(round, [
        `É pra estudantes do Fundamental II, Ensino Médio e quem tá se preparando pro ENEM ou vestibular.`,
        `Atende do Fundamental II até ENEM e vestibular. Pais também usam pra ajudar os filhos.`,
        `Pra estudantes em geral, do Fundamental II ao pré-vestibular.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `O Planner Estudante Pro foi feito pra estudantes do Fundamental II, Ensino Médio e quem prepara o ENEM ou vestibular. Tem 10 estilos diferentes justamente pra atender perfis variados.`,
        `Tem planner pra cada perfil: o Candy Dream é mais leve (Fundamental II), o Neo Zebra é focado em ENEM, o Lavender Study é estilo Studygram, o Cyber Focus é gamer.`,
        `Qualquer estudante que queira se organizar melhor. E pais que querem ajudar os filhos também compram muito.`,
      ]);
      return pickByRound(round, [
        `Atende desde o Fundamental II até quem tá estudando pro ENEM ou vestibular. Tem estilos pra todo perfil: mais calmo, mais tech, mais premium.`,
        `É pra estudante de qualquer fase. Tem planner mais lúdico pro Fundamental II e planner mais direto pro ENEM.`,
        `Pra quem estuda, do Fundamental II ao vestibular. E se for pai ou mãe querendo ajudar o filho a se organizar, funciona muito bem também.`,
      ]);

    case Intent.ObjectionExpensive:
      if (type === "direct") return pickByRound(round, [
        `Entendo, faz sentido pensar. São ${price} por 10 planners e 3 ebooks pra usar o ano inteiro.`,
        `Faz sentido. É ${price} pelo pacote completo com 10 planners em PDF e 3 ebooks bônus.`,
        `Entendo. O valor é ${price} pelo conjunto todo: 10 planners com estilos diferentes e mais 3 ebooks.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `O pacote foi montado pra entregar bastante conteúdo: 10 planners com visuais e focos diferentes, mais os ebooks ${ebookNames}. Tudo em PDF pra usar o ano inteiro.`,
        `São ${price} por 10 planners e 3 ebooks. Cada planner tem calendário, semana, metas, hábitos e controle de provas. É um material pra usar durante todo o ano letivo.`,
        `O investimento é ${price} e você recebe 13 arquivos PDF no total: 10 planners e 3 ebooks de organização, estudos e metas.`,
      ]);
      return pickByRound(round, [
        `Entendo. Se quiser, posso te mostrar o que vem no pacote pra você avaliar se faz sentido. São 10 planners diferentes e mais 3 ebooks.`,
        `Faz sentido. É ${price} pelo pacote completo com 10 planners e 3 ebooks. Posso te mostrar mais detalhes antes de decidir.`,
        `Entendo. É um pacote com bastante conteúdo pra usar o ano todo: 10 planners e 3 ebooks de bônus. Quer que eu te mostre o que vem?`,
      ]);

    case Intent.ObjectionThink:
      if (type === "direct") return pickByRound(round, [
        `Sem pressa! Se quiser ver mais do conteúdo antes de decidir, é só falar.`,
        `Fique à vontade. Se surgir dúvida sobre o que vem no pacote, pode perguntar.`,
        `Tranquilo. Quando quiser saber mais, é só me chamar.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `Entendo, sem problema. O pacote tem 10 planners digitais com estilos diferentes e 3 ebooks bônus. Se quiser ver mais detalhes do conteúdo antes de decidir, é só pedir.`,
        `Claro, fique à vontade. Posso te mostrar mais sobre os planners (${plannerExamples}) ou sobre os ebooks de bônus.`,
        `Sem pressa. Se tiver qualquer dúvida sobre o conteúdo, os estilos ou como funciona o acesso, pode perguntar.`,
      ]);
      return pickByRound(round, [
        `Claro, sem problema. Se quiser saber mais sobre os planners ou os ebooks antes de decidir, é só falar.`,
        `Tranquilo, pensa com calma. Se quiser ver o que vem no pacote ou tirar alguma dúvida, é só me chamar.`,
        `Sem pressa. Quando quiser, posso te mostrar mais detalhes dos 10 planners e dos ebooks bônus.`,
      ]);

    case Intent.BuyIntent:
      if (type === "direct") return pickByRound(round, [
        hasCheckout
          ? `O valor é ${price} pelo ${platform}. Quer o link?`
          : `O valor é ${price}. Me avisa que eu passo as informações de acesso.`,
        hasCheckout
          ? `Fica ${price} pelo ${platform}. Te envio o link agora.`
          : `O pacote sai por ${price}. Me fala que eu te passo o próximo passo.`,
        hasCheckout
          ? `${price} pelo ${platform}. Mando o link.`
          : `${price} pelo pacote completo. Me avisa que eu explico como acessar.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        hasCheckout
          ? `O pagamento é pelo ${platform}, no valor de ${price}. Depois da compra, você recebe por e-mail os 10 planners e os 3 ebooks em PDF. Quer o link?`
          : `O valor é ${price} pelo pacote completo: 10 planners e 3 ebooks em PDF. A entrega é por e-mail após a compra. Me avisa que eu passo os detalhes.`,
        hasCheckout
          ? `A compra é pelo ${platform}, fica ${price}. Você recebe tudo por e-mail: os 10 planners e os 3 ebooks bônus em PDF.`
          : `${price} pelo pacote completo. Depois do pagamento, você recebe por e-mail o acesso aos 10 planners e 3 ebooks em PDF.`,
        hasCheckout
          ? `${price} pelo ${platform} e você recebe tudo por e-mail. São 10 planners e 3 ebooks em PDF.`
          : `O pacote sai por ${price}. É entrega digital por e-mail: 10 planners e 3 ebooks em PDF.`,
      ]);
      return pickByRound(round, [
        hasCheckout
          ? `O valor é ${price} pelo ${platform}. Te envio o link e você recebe os 10 planners e os 3 ebooks no e-mail na hora.`
          : `O valor é ${price}. Me avisa que te passo os dados de acesso: são 10 planners e 3 ebooks em PDF.`,
        hasCheckout
          ? `${price} pelo ${platform}. Mando o link agora. Você recebe tudo por e-mail, os planners e os ebooks.`
          : `${price} pelo pacote. Me fala que eu te explico como receber os arquivos.`,
        hasCheckout
          ? `${price} e você garante os 10 planners e 3 ebooks. Mando o link do ${platform}.`
          : `Me avisa que passo o acesso. ${price} pelo pacote completo em PDF.`,
      ]);

    case Intent.StopContact:
      return `Sem problemas. Se mudar de ideia, é só me chamar. Bons estudos!`;

    case Intent.HumanNeeded:
      return `Vou verificar isso com calma e já te respondo.`;

    case Intent.Unknown:
    default:
      if (type === "direct") return pickByRound(round, [
        `Pode perguntar! Sobre preço, conteúdo ou como receber, é só falar.`,
        `Me fala sua dúvida que eu explico.`,
        `Pode tirar sua dúvida sobre o planner, o preço ou como funciona.`,
      ]);
      if (type === "explanatory") return pickByRound(round, [
        `O Planner Estudante Pro é um pacote com 10 planners digitais em PDF e 3 ebooks bônus. Cada planner tem estilo e foco diferentes, do gamer ao minimalista. Posso te explicar preço, conteúdo ou como receber.`,
        `É um pacote digital com 10 planners (${plannerExamples} e mais) e 3 ebooks: ${ebookNames}. Se tiver dúvida sobre o que vem, o valor ou a entrega, pode perguntar.`,
        `O pacote tem 10 planners em PDF com estilos diferentes e 3 ebooks bônus de organização e estudos. Qual é a sua dúvida?`,
      ]);
      return pickByRound(round, [
        `Se for sobre o Planner Estudante Pro, pode perguntar! São 10 planners digitais e 3 ebooks bônus, tudo em PDF.`,
        `Me fala o que quer saber: sobre os planners, os ebooks, o preço ou como receber. Explico rapidinho.`,
        `Posso te ajudar com preço, conteúdo ou acesso. É um pacote com 10 planners e 3 ebooks em PDF.`,
      ]);
  }
}

function buildGenericProductSuggestion(
  intent: Intent,
  type: SuggestionType,
  round: number = 1,
  productId: string = DEFAULT_PRODUCT_ID
): string {
  const profile = getProductProfile(productId);
  const name = profile.name;
  const price = profile.price;
  const includes = profile.includes.join(", ");
  const delivery = profile.delivery;

  switch (intent) {
    case Intent.AskPrice:
      if (type === "direct") return `O valor fica ${price}.`;
      if (type === "explanatory") return `O valor fica ${price}. Voce recebe ${includes}.`;
      return `Fica ${price}. Se fizer sentido pra voce, posso te mandar o link.`;

    case Intent.AskContent:
      if (type === "direct") return `O ${name} vem com ${includes}.`;
      if (type === "explanatory") return `O ${name} inclui ${includes}. A entrega funciona assim: ${delivery}.`;
      return `Ele vem com ${includes}. Posso te explicar rapidinho como funciona.`;

    case Intent.AskDelivery:
      if (type === "direct") return `A entrega e: ${delivery}.`;
      if (type === "explanatory") return `Depois da compra, voce recebe o acesso conforme combinado: ${delivery}.`;
      return `E bem simples: depois da compra, voce recebe tudo por ${delivery}.`;

    case Intent.PositiveConfirmation:
      if (type === "direct") return `Perfeito, vou te mostrar o ${name} rapidinho.`;
      if (type === "explanatory") return `Perfeito. O ${name} e um produto pensado para ajudar com: ${profile.description}`;
      return `Boa! Vou te explicar rapidinho o que vem e como funciona.`;

    case Intent.BuyIntent:
      if (type === "direct") return `Perfeito. O valor e ${price}. Quer que eu mande o link?`;
      if (type === "explanatory") return `Perfeito. O ${name} fica ${price} e a entrega e ${delivery}. Quer que eu te mande o link?`;
      return `Fechado. Posso te mandar o link agora pra voce ver certinho.`;

    case Intent.StopContact:
      return `Sem problemas. Obrigado por avisar.`;

    default:
      if (type === "direct") return `Pode me perguntar sobre valor, entrega ou como funciona.`;
      if (type === "explanatory") return `O ${name} funciona assim: ${profile.description}. Se quiser, explico valor, entrega ou acesso.`;
      return `Me fala sua duvida que eu te explico direitinho.`;
  }
}

export async function generateSuggestions(
  intent: Intent,
  round: number = 1,
  history: string[] = [],
  productId: string = DEFAULT_PRODUCT_ID
): Promise<ReplySuggestion[]> {
  // Tenta DeepSeek primeiro
  const aiSuggestions = await generateSuggestionsDeepSeek(intent, history, round, productId);
  if (aiSuggestions && aiSuggestions.length === 3) {
    return aiSuggestions;
  }

  // Fallback: sugestões estáticas
  const types: SuggestionType[] = ["direct", "explanatory", "human"];
  return types.map((type) => {
    const text = normalizeProductId(productId) === DEFAULT_PRODUCT_ID
      ? buildSuggestion(intent, type, round)
      : buildGenericProductSuggestion(intent, type, round, productId);
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

export function generateRecoverySuggestions(round: number = 1): ReplySuggestion[] {
  const config = commercialSettings.getRecoveryConfig();
  if (!config.isCheckoutConfigured) {
    throw new Error("Checkout de recuperacao ainda nao esta aprovado.");
  }

  const price = config.price;
  const checkoutUrl = config.checkoutUrl;
  const texts = [
    [
      `Consigo liberar uma condicao menor para voce finalizar agora: ${price}.\n\nPode finalizar por aqui: ${checkoutUrl}`,
      `Se ainda fizer sentido para voce, deixei uma opcao especial por ${price} para acessar o pacote completo.\n\nLink: ${checkoutUrl}`,
      `Para facilitar sua decisao, consigo deixar o Planner Estudante Pro por ${price} nessa condicao especial.\n\nPode finalizar por aqui: ${checkoutUrl}`,
    ],
    [
      `Consegui uma condicao especial para voce: o pacote completo fica ${price}.\n\nAqui esta o link para finalizar: ${checkoutUrl}`,
      `Se o valor normal pesou um pouco, posso liberar esta opcao por ${price}.\n\nLink de acesso: ${checkoutUrl}`,
      `Pra te ajudar a decidir, deixei o acesso ao Planner Estudante Pro por ${price}.\n\nFinaliza por aqui: ${checkoutUrl}`,
    ],
    [
      `Posso te passar uma condicao menor agora: ${price} pelo pacote completo.\n\nLink: ${checkoutUrl}`,
      `Deixei uma alternativa mais leve para voce finalizar: ${price}.\n\nPode acessar por aqui: ${checkoutUrl}`,
      `Se quiser aproveitar, consigo liberar o Planner Estudante Pro por ${price} nesta condicao.\n\nCheckout: ${checkoutUrl}`,
    ],
  ];

  const selected = texts[(Math.max(round, 1) - 1) % texts.length];
  const types: SuggestionType[] = ["direct", "explanatory", "human"];

  return selected.map((text, index) => {
    const response = [{ type: "text" as const, content: text }];
    const validation = validateResponse(response);
    return {
      id: crypto.randomUUID(),
      type: types[index],
      text,
      validated: validation.approved,
      createdAt: new Date(),
    };
  });
}

function generateGenericFlowContinuationSuggestions(
  stage: string = "followup",
  round: number = 1,
  productId: string = DEFAULT_PRODUCT_ID
): ReplySuggestion[] {
  const profile = getProductProfile(productId);
  const price = profile.price;
  const checkout = profile.checkoutUrl;
  const name = profile.name;
  const description = profile.description;
  const delivery = profile.delivery;
  const includes = profile.includes.join(", ");

  const templates: Record<string, string[][]> = {
    presentation: [
      [
        `Posso te mostrar rapidinho como funciona o ${name}?`,
        `O ${name} foi pensado para ajudar com isso: ${description}. Quer que eu te mostre?`,
        `Se quiser, te explico em poucas mensagens o que vem e como funciona o acesso.`,
      ],
    ],
    product: [
      [
        `O ${name} inclui ${includes}.`,
        `Ele funciona assim: ${description}. A entrega e ${delivery}.`,
        `Voce recebe ${includes}. Posso te explicar melhor se quiser.`,
      ],
    ],
    price: [
      [
        checkout
          ? `O valor fica ${price}. Se quiser finalizar, pode acessar por aqui: ${checkout}`
          : `O valor fica ${price}. Se quiser, te explico o proximo passo.`,
        checkout
          ? `O ${name} fica ${price}. Aqui esta o link para finalizar: ${checkout}`
          : `O ${name} fica ${price}. Posso te passar o proximo passo.`,
        checkout
          ? `Fica ${price}. Se fizer sentido para voce, pode finalizar por aqui: ${checkout}`
          : `Fica ${price}. Se fizer sentido para voce, me fala que te explico como acessar.`,
      ],
    ],
    followup: [
      [
        `Conseguiu ver direitinho? Se tiver alguma duvida sobre o ${name}, pode perguntar.`,
        `Passando so para saber se ficou alguma duvida sobre como funciona ou como recebe.`,
        `Fiquei por aqui caso queira tirar alguma duvida antes de decidir.`,
      ],
    ],
    close: [
      [
        checkout
          ? `Quer que eu te mande o link para finalizar agora? O valor fica ${price}.`
          : `Quer que eu te passe o proximo passo para acessar? O valor fica ${price}.`,
        checkout
          ? `Se fizer sentido para voce, posso te mandar o checkout agora. Fica ${price}.`
          : `Se fizer sentido para voce, te explico como acessar. Fica ${price}.`,
        checkout
          ? `Quer garantir o acesso? Posso te passar o link agora.`
          : `Quer garantir o acesso? Posso te passar as informacoes agora.`,
      ],
    ],
    recovery: [
      [
        `Se ainda fizer sentido para voce, posso te explicar de novo como funciona o ${name}.`,
        `Pra facilitar sua decisao, posso tirar qualquer duvida sobre entrega, acesso ou valor.`,
        `Se ainda tiver interesse, me fala que eu te ajudo com o proximo passo.`,
      ],
    ],
  };

  const normalizedStage = templates[stage] ? stage : "followup";
  const selected = templates[normalizedStage][(Math.max(round, 1) - 1) % templates[normalizedStage].length];
  const types: SuggestionType[] = ["direct", "explanatory", "human"];

  return selected.map((text, index) => {
    const response = [{ type: "text" as const, content: text }];
    const validation = validateResponse(response);
    return {
      id: crypto.randomUUID(),
      type: types[index],
      text,
      validated: validation.approved,
      createdAt: new Date(),
    };
  });
}

export function generateFlowContinuationSuggestions(
  stage: string = "auto",
  round: number = 1,
  productId: string = DEFAULT_PRODUCT_ID
): ReplySuggestion[] {
  const config = commercialSettings.getEffectiveConfig();
  const recoveryConfig = commercialSettings.getRecoveryConfig();
  if (normalizeProductId(productId) !== DEFAULT_PRODUCT_ID) {
    return generateGenericFlowContinuationSuggestions(stage, round, productId);
  }
  const price = config.price;
  const checkout = config.isCheckoutConfigured ? config.checkoutUrl : "";
  const recoveryPrice = recoveryConfig.price;
  const recoveryCheckout = recoveryConfig.isCheckoutConfigured ? recoveryConfig.checkoutUrl : "";
  const templates: Record<string, string[][]> = {
    presentation: [
      [
        "Posso te mostrar rapidinho o que vem dentro do Planner Estudante Pro?",
        "O Planner Estudante Pro foi feito para organizar estudos, provas, rotina e metas. Quer que eu te mostre o pacote?",
        "Se quiser, te mostro em poucas mensagens o que vem no material e como funciona o acesso.",
      ],
    ],
    product: [
      [
        "O pacote vem com 10 planners digitais em PDF e 3 ebooks bonus. Ele ajuda a organizar rotina, provas, tarefas e metas.",
        "Dentro do pacote tem planners com estilos diferentes e ebooks para organizacao, estudos e projetos. Tudo em PDF.",
        "Ele foi pensado para estudante escolher o estilo que combina mais e usar para rotina de estudos, provas e metas.",
      ],
    ],
    price: [
      [
        checkout
          ? `O pacote completo fica ${price}. Se quiser finalizar, pode acessar por aqui: ${checkout}`
          : `O pacote completo fica ${price}. Se quiser, te passo o acesso por aqui.`,
        checkout
          ? `O valor do Planner Estudante Pro e ${price}. Aqui esta o link para finalizar: ${checkout}`
          : `O valor do Planner Estudante Pro e ${price}. Posso te passar o proximo passo.`,
        checkout
          ? `Fica ${price} pelo pacote com 10 planners e 3 ebooks. Pode finalizar por aqui: ${checkout}`
          : `Fica ${price} pelo pacote com 10 planners e 3 ebooks. Me avisa que te passo o acesso.`,
      ],
    ],
    followup: [
      [
        "Passando so para saber se ficou alguma duvida sobre o Planner Estudante Pro.",
        "Conseguiu ver direitinho? Se tiver alguma duvida sobre o acesso ou o que vem no pacote, pode me chamar.",
        "Fiquei por aqui caso queira tirar alguma duvida antes de decidir.",
      ],
    ],
    close: [
      [
        checkout
          ? `Quer que eu te envie o link para finalizar agora? O pacote completo fica ${price}.`
          : `Quer que eu te passe o proximo passo para acessar o pacote? O valor fica ${price}.`,
        checkout
          ? `Se fizer sentido para voce, posso te mandar o checkout agora. Fica ${price}.`
          : `Se fizer sentido para voce, te explico como acessar. Fica ${price}.`,
        checkout
          ? `Quer garantir o acesso ao pacote completo? Posso te passar o link agora.`
          : `Quer garantir o acesso ao pacote completo? Posso te passar as informacoes agora.`,
      ],
    ],
    recovery: [
      [
        recoveryCheckout
          ? `Se o valor normal ficou pesado, consigo liberar uma condicao menor por ${recoveryPrice}. Quer que eu te mande esse link?`
          : `Se o valor normal ficou pesado, posso ver uma condicao menor para voce. Quer que eu te explique?`,
        recoveryCheckout
          ? `Pra facilitar sua decisao, deixei uma opcao especial por ${recoveryPrice}. Se fizer sentido, te mando o link.`
          : `Pra facilitar sua decisao, consigo te passar uma opcao mais leve. Se fizer sentido, me fala.`,
        recoveryCheckout
          ? `Se ainda tiver interesse, consigo te mandar o acesso com uma condicao de ${recoveryPrice}. Quer ver?`
          : `Se ainda tiver interesse, posso te passar uma condicao melhor para acessar o kit.`,
      ],
    ],
  };

  const normalizedStage = templates[stage] ? stage : "followup";
  const selected = templates[normalizedStage][(Math.max(round, 1) - 1) % templates[normalizedStage].length];
  const types: SuggestionType[] = ["direct", "explanatory", "human"];

  return selected.map((text, index) => {
    const response = [{ type: "text" as const, content: text }];
    const validation = validateResponse(response);
    return {
      id: crypto.randomUUID(),
      type: types[index],
      text,
      validated: validation.approved,
      createdAt: new Date(),
    };
  });
}

export async function generateFlowContinuationSuggestionsSmart(
  stage: string = "followup",
  history: string[] = [],
  round: number = 1,
  productId: string = DEFAULT_PRODUCT_ID
): Promise<ReplySuggestion[]> {
  const profile = getProductProfile(productId);
  const recoveryConfig = commercialSettings.getRecoveryConfig();

  const productName = profile.name;
  const productDescription = profile.description;
  const productPrice = profile.price;
  const productDelivery = profile.delivery;
  const productIncludes = profile.includes.join(", ");
  const isDefaultProduct = normalizeProductId(productId) === DEFAULT_PRODUCT_ID;

  const stagePromptMap: Record<string, string> = {
    presentation: `Continue a venda apresentando o produto atual de forma natural e curta: ${productName}.`,
    product: `Continue a venda mostrando o que vem no produto atual. Use apenas estas informacoes: ${productDescription}. Inclui: ${productIncludes}. Entrega: ${productDelivery}.`,
    price: `Continue a venda falando o valor do produto atual com suavidade. Valor: ${productPrice}. Nao invente desconto.`,
    close: `Continue a venda pedindo fechamento de forma leve, humana e objetiva para o produto atual: ${productName}.`,
    followup: `Continue a conversa com um follow-up natural para tirar duvida e retomar interesse sobre o produto atual: ${productName}.`,
    recovery: isDefaultProduct
      ? "Continue a venda com uma recuperacao suave. Se o cliente ja recebeu valor e sumiu, ofereca a condicao de recuperacao configurada sem parecer pressao."
      : `Continue a venda com uma recuperacao suave sobre o produto atual: ${productName}. Nao invente desconto. Retome valor, beneficio e tire duvidas.`,
  };

  const stagePrompt = stagePromptMap[stage] || stagePromptMap.followup;

  const recoveryLine =
    stage === "recovery" && isDefaultProduct && recoveryConfig.isCheckoutConfigured
      ? `Condicao de recuperacao configurada: ${recoveryConfig.price}. Link: ${recoveryConfig.checkoutUrl}`
      : "";

  const aiHistory = [
    ...history.slice(-6),
    `Produto atual: ${productName}`,
    `Descricao do produto atual: ${productDescription}`,
    `Valor do produto atual: ${productPrice}`,
    `Entrega do produto atual: ${productDelivery}`,
    `Tarefa do vendedor: ${stagePrompt}`,
    recoveryLine,
    stage === "recovery" && isDefaultProduct && recoveryConfig.isCheckoutConfigured
      ? "Gere 3 opcoes curtas, humanas e prontas para WhatsApp. Use apenas a condicao de recuperacao configurada, sem inventar outros descontos. Nao fale em equipe ou suporte."
      : "Gere 3 opcoes curtas, humanas e prontas para WhatsApp. Use somente informacoes do produto atual. Nao invente desconto. Nao fale em equipe ou suporte.",
  ].filter(Boolean);

  const aiSuggestions = await generateSuggestionsDeepSeek(Intent.Unknown, aiHistory, round, productId);
  if (aiSuggestions && aiSuggestions.length === 3) {
    return aiSuggestions;
  }

  return generateFlowContinuationSuggestions(stage, round, productId);
}

