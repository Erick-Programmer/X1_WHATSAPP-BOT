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

export const productConfig: ProductConfig = {
  name: "Planner Estudante Pro",
  delivery: "Digital (PDF)",
  includes: [
    "10 planners completos",
    "3 ebooks bônus exclusivos",
  ],
  usage: [
    "Impressão em casa ou gráfica",
    "Uso digital em tablet, celular ou computador",
  ],
  targetAudience: [
    "Estudantes do Ensino Fundamental II",
    "Estudantes do Ensino Médio",
    "Vestibulandos (ENEM e vestibulares)",
    "Pais e responsáveis que buscam organização escolar",
  ],
  benefits: [
    "Organização escolar completa",
    "Rotina de estudos estruturada",
    "Calendário mensal para acompanhamento",
    "Planejamento semanal de tarefas",
    "Metas de estudo diárias e semanais",
    "Simulados e acompanhamento de desempenho",
    "Foco e produtividade nos estudos",
  ],
  features: [
    {
      name: "Planner Mensal",
      description: "Visão geral do mês para acompanhar prazos, provas e compromissos.",
    },
    {
      name: "Planner Semanal",
      description: "Organização semana a semana com prioridades e tarefas.",
    },
    {
      name: "Planner de Estudos",
      description: "Cronograma de estudos com divisão por matéria e horário.",
    },
    {
      name: "Planner de Metas",
      description: "Definição e acompanhamento de metas acadêmicas.",
    },
    {
      name: "Planner de Simulados",
      description: "Registro de resultados de simulados e evolução.",
    },
    {
      name: "Planner de Provas",
      description: "Calendário de provas com datas e matérias.",
    },
    {
      name: "Planner de Leitura",
      description: "Registro de livros lidos e fichamento.",
    },
    {
      name: "Planner de Finanças",
      description: "Controle de gastos relacionados aos estudos.",
    },
    {
      name: "Planner de Hábitos",
      description: "Acompanhamento de hábitos diários e semanais.",
    },
    {
      name: "Planner de Férias",
      description: "Planejamento de recesso sem perder o ritmo.",
    },
  ],
  price: null,
  paymentLink: null,
};
