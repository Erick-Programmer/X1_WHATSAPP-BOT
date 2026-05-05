/**
 * Conhecimento real do produto — Planner Estudante Pro
 * Baseado na linha comercial: 10 estilos visuais + 10 índices de conteúdo + 3 ebooks
 */

export const productKnowledge = {
  name: "Planner Estudante Pro",
  tagline: "10 planners digitais + 3 ebooks bônus. Tudo em PDF.",
  delivery: "Digital em PDF — acesso por e-mail após a compra. Pode usar no celular, tablet, computador ou imprimir.",

  targetAudience: [
    "Estudantes do Ensino Fundamental II",
    "Estudantes do Ensino Médio",
    "Quem está se preparando para ENEM ou vestibular",
    "Pais que querem ajudar os filhos a se organizar",
  ],

  // Os 10 planners com nome comercial, estilo e foco
  planners: [
    { name: "Cyber Focus",       style: "Gamer Hi-Tech",            focus: "Alta performance, missões, metas e foco digital" },
    { name: "Deep Blue Tech",    style: "Minimal Tech escuro",       focus: "Foco total, sem distrações, execução direta" },
    { name: "Candy Dream",       style: "Soft Pastel",               focus: "Organização leve, cores que acalmam, ideal para Fundamental II" },
    { name: "Lavender Study",    style: "Studygram",                 focus: "Estética Studygram, rotina perfeita, calma e foco" },
    { name: "Street Vibes",      style: "Urban/Street",              focus: "Atitude e estilo, para quem não gosta do óbvio" },
    { name: "Graffiti Art",      style: "Arte Urbana",               focus: "Expressão criativa, artes, projetos e repertório" },
    { name: "Green Balance",     style: "Eco/Nature",                focus: "Bem-estar, saúde mental, hábitos e conexão com a natureza" },
    { name: "Earth Tone",        style: "Minimalismo orgânico",      focus: "Mente organizada, exploração, idiomas e memórias" },
    { name: "Black & Gold Elite",style: "High Contrast premium",     focus: "Elegante e unissex, disciplina atlética e alta performance" },
    { name: "Neo Zebra",         style: "Alto contraste dinâmico",   focus: "Objetivo, rápido, eficiente — ideal para ENEM e vestibular" },
  ],

  // Conteúdo base presente em todos os planners
  universalContent: [
    "Calendário mensal — visão macro de provas, trabalhos e compromissos",
    "Planejamento semanal — organização dia a dia com prioridades",
    "Lista de metas acadêmicas e pessoais",
    "Controle de tarefas e entregas",
    "Registro de hábitos diários",
    "Espaço de reflexão e autoconhecimento",
    "Controle de provas e simulados",
  ],

  // Os 4 módulos estruturais de cada planner
  modules: [
    { name: "Identidade e Visão",    description: "Autoconhecimento, dados pessoais, roda da vida, mural e futuro" },
    { name: "Planejamento Mestre",   description: "Calendário anual, horário de aulas, calendário mensal e semanal" },
    { name: "Execução e Notas",      description: "Avaliações, revisões, leituras, filmes e faltas" },
    { name: "Financeiro e Extra",    description: "Mesada, economias, páginas livres, mapas mentais e criatividade" },
  ],

  // Os 3 ebooks bônus
  ebooks: [
    { name: "Organização Escolar",          description: "Como montar uma rotina de estudos que realmente funciona" },
    { name: "Estudos e Provas",             description: "Técnicas de estudo, revisão e preparação para provas e ENEM" },
    { name: "Projetos, Metas e Futuro",     description: "Como definir metas, planejar projetos e pensar no futuro" },
  ],

  // Frases humanas prontas por situação — usadas no replySuggestions
  humanPhrases: {
    whatIsIt: [
      "É um pacote com 10 planners digitais diferentes e 3 ebooks bônus, tudo em PDF.",
      "São 10 estilos de planner para estudante — cada um com visual e foco diferente — mais 3 ebooks de bônus.",
      "Um pacote completo de organização: 10 planners pra escolher o que mais combina com você, e ainda 3 ebooks.",
    ],
    contentHighlight: [
      "Todos têm calendário mensal, planejamento semanal, controle de provas, metas e hábitos.",
      "O conteúdo vai de autoconhecimento até controle financeiro — cobre a rotina inteira do estudante.",
      "Além dos planners, os ebooks ensinam como estudar melhor, se organizar e planejar o futuro.",
    ],
    styleHighlight: [
      "Tem estilo gamer (Cyber Focus), Studygram (Lavender), minimalista (Deep Blue), natureza (Green Balance), premium (Black & Gold) e mais 5.",
      "São 10 visuais: tech, pastel, urbano, natureza, alto contraste. Você vai achar um que parece feito pra você.",
      "Do mais colorido ao mais sóbrio — Candy Dream, Lavender, Earth Tone, Neo Zebra, Black & Gold. Tem opção pra todo perfil.",
    ],
    ebookHighlight: [
      "Os 3 ebooks ensinam organização escolar, técnicas de estudo para provas e como planejar metas e o futuro.",
      "Os bônus são: Organização Escolar, Estudos e Provas, e Projetos e Metas — conteúdo prático pra usar junto com o planner.",
      "Além dos planners, você recebe 3 guias em PDF: um sobre organização, um sobre estudo e provas, e um sobre metas e futuro.",
    ],
    confirmationResponse: [
      "Vou te mostrar o pacote completo agora.",
      "Deixa eu te apresentar os planners e os bônus.",
      "Perfeito, vou te mostrar tudo que vem.",
    ],
  },
};

// Compatibilidade com código legado que importa productConfig
export const productConfig = {
  name: productKnowledge.name,
  delivery: productKnowledge.delivery,
  includes: [
    `${productKnowledge.planners.length} planners completos`,
    `${productKnowledge.ebooks.length} ebooks bônus exclusivos`,
  ],
  usage: ["Impressão em casa ou gráfica", "Uso digital em tablet, celular ou computador"],
  targetAudience: productKnowledge.targetAudience,
  benefits: productKnowledge.universalContent,
  features: productKnowledge.planners.map(p => ({ name: p.name, description: p.focus })),
  price: null,
  paymentLink: null,
};

export interface ProductFeature {
  name: string;
  description: string;
}

export interface ProductConfig {
  name: string;
  delivery: string;
  includes: string[];
  usage: string[];
  targetAudience: string[];
  benefits: string[];
  features: ProductFeature[];
  price: string | null;
  paymentLink: string | null;
}