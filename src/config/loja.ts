/**
 * Dados reais do negócio, usados em todo o site público. Nenhum componente
 * deve ter dado da loja hardcoded — sempre importar deste arquivo.
 *
 * PENDÊNCIA: os campos marcados "// TODO: preencher" abaixo estão com
 * placeholder porque ainda não foram informados. Troque pelos valores reais
 * (ou pelas env vars correspondentes) antes de publicar o site.
 */

export interface HorarioDia {
  dia: string;
  abertura: string; // "HH:mm"
  fechamento: string; // "HH:mm"
}

export const loja = {
  nome: "Farmácia Preço Bom",

  endereco: {
    logradouro: "Rua Nossa Senhora do Carmo, 100",
    bairro: "",
    cidade: "Salvador",
    estado: "BA",
    cep: "",
    curto: "Rua Nossa Senhora do Carmo, 100 — Salvador/BA",
    // usado no JSON-LD (geo) — TODO: preencher com a lat/lng real da loja
    geo: { latitude: -12.9777, longitude: -38.5016 },
  },

  horarios: [
    { dia: "Segunda", abertura: "07:00", fechamento: "21:00" },
    { dia: "Terça", abertura: "07:00", fechamento: "21:00" },
    { dia: "Quarta", abertura: "07:00", fechamento: "21:00" },
    { dia: "Quinta", abertura: "07:00", fechamento: "21:00" },
    { dia: "Sexta", abertura: "07:00", fechamento: "21:00" },
    { dia: "Sábado", abertura: "07:00", fechamento: "21:00" },
    { dia: "Domingo", abertura: "07:00", fechamento: "13:00" },
  ] satisfies HorarioDia[],

  horarioResumo: "Segunda a sábado, 7h às 21h · domingo, 7h às 13h",

  entrega: {
    descricao: "Entrega para toda Salvador",
  },

  pagamento: {
    formas: ["PIX", "Dinheiro", "Débito (até 10% de desconto)", "Crédito"],
    parcelamento: [
      "Acima de R$ 50 em até 2x sem juros",
      "Acima de R$ 100 em até 3x sem juros",
    ],
  },

  servicos: [
    { nome: "Aferição de pressão", somenteDinheiro: false },
    { nome: "Aferição de glicemia", somenteDinheiro: false },
    { nome: "Aplicação de injetáveis", somenteDinheiro: false },
    { nome: "Recarga de celular", somenteDinheiro: true },
    { nome: "Recarga de cartão de passagem", somenteDinheiro: true },
  ],

  // TODO: preencher — número real em formato internacional, ex: 5571991234567
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMERO || "5571999999999",

  // TODO: preencher
  instagram: "@farmaciaprecobom",
  instagramUrl: "https://instagram.com/farmaciaprecobom",

  // TODO: preencher — link da loja no iFood
  ifoodUrl: process.env.NEXT_PUBLIC_IFOOD_URL || "https://www.ifood.com.br",

  // TODO: preencher — domínio definitivo do site
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://precobom.com.br",

  // TODO: preencher — CNPJ da farmácia
  cnpj: "00.000.000/0001-00",

  // TODO: preencher — nome do(a) farmacêutico(a) responsável e nº do CRF-BA
  farmaceuticoResponsavel: "Farmacêutico(a) Responsável — CRF-BA nº 0000",

  avisoSanitario:
    "Medicamentos sujeitos a receita só são dispensados mediante apresentação e retenção da receita, conforme a legislação vigente.",
} as const;

export type Loja = typeof loja;
