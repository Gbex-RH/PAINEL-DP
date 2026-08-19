/**
 * Cada ferramenta do Painel DP é um objeto neste array.
 * Para adicionar uma nova ferramenta, basta acrescentar um objeto aqui —
 * nada em app.js, styles.css ou index.html precisa mudar (categorias e
 * filtros são gerados a partir destes dados).
 *
 * Campos:
 *   id          slug estável (kebab-case) — usado em ids do DOM e no modal
 *   name        nome exibido no card
 *   description descrição curta (2-3 linhas no card, completa no modal)
 *   category    texto livre — vira automaticamente um chip de filtro
 *   tags        palavras extras usadas só na busca (opcional)
 *   icon        chave de um <symbol id="icon-KEY"> em assets/icons/icons.svg
 *   highlight   trecho literal de "description" a destacar com a cor de marca (opcional)
 *   version     rótulo de versão opcional, mostrado como legenda
 *   order       peso de ordenação manual ("Padrão")
 *   status      "hosted" (tem URL fixa) ou "local" (precisa ser iniciada na máquina)
 *   hosted      { url, authNote? } — obrigatório quando status === "hosted"
 *   local       { reason, steps[], path, command, bestEffortUrl } — obrigatório quando status === "local"
 */
const TOOLS = [
  {
    id: "dashboard-rh",
    name: "Dashboard RH Guanabara Express",
    description:
      "Painel completo de RH: headcount, salários, licenças, faltas, horas extras, comissões, turnover, CCT e custo de motoristas — GBEX e GBLOG.",
    category: "Dashboard Gerencial",
    tags: ["rh", "headcount", "turnover", "cct", "salarios"],
    icon: "layout-dashboard",
    highlight: "Painel completo de RH",
    version: "v75",
    order: 10,
    status: "hosted",
    hosted: {
      url: "https://rh-guanabara.netlify.app",
      authNote: "Requer login (Firebase)",
    },
    local: null,
  },
  {
    id: "controle-ponto",
    name: "Controle de Ponto",
    description:
      "Gestão de pendências de ponto em 4 abas: Pendências, Meus Lançamentos, Auditoria e Validação.",
    category: "Ponto Eletrônico",
    tags: ["ponto", "batidas", "afdt", "fortes"],
    icon: "clock",
    highlight: "4 abas",
    version: "v70",
    order: 20,
    status: "hosted",
    hosted: {
      url: "https://ponto-rh.netlify.app",
      authNote: null,
    },
    local: null,
  },
  {
    id: "auditor-folha",
    name: "Auditor de Folha",
    description:
      "Audita a folha de pagamento mensal (Fortes Pessoal) por filial, cruzando com o mês anterior e a CCT vigente. Roda 100% no navegador — nenhum dado sai da máquina.",
    category: "Folha de Pagamento",
    tags: ["folha", "auditoria", "inss", "fgts", "irrf", "offline"],
    icon: "shield-check",
    highlight: "100% no navegador",
    version: null,
    order: 30,
    status: "hosted",
    hosted: {
      url: "https://auditor-de-folha.netlify.app",
      authNote: null,
    },
    local: null,
  },
  {
    id: "conversor-folha",
    name: "Conversor de Folha",
    description:
      "Converte o relatório de folha de pagamento (PDF, Fortes) em Markdown ou CSV, conferindo a aritmética do documento durante a conversão.",
    category: "Folha de Pagamento",
    tags: ["folha", "pdf", "markdown", "csv", "conversor"],
    icon: "file-spreadsheet",
    highlight: "conferindo a aritmética",
    version: null,
    order: 40,
    status: "local",
    hosted: null,
    local: {
      reason: "Servidor local próprio: o PDF é lido inteiramente no navegador, sem enviar dados a lugar nenhum.",
      steps: [
        "Abra a pasta “PROJETO MD\\files(4)\\conversor-folha”.",
        "Dê duplo clique em “iniciar.bat”.",
        "O navegador abre sozinho em http://127.0.0.1:7327.",
      ],
      path: "PROJETO MD\\files(4)\\conversor-folha\\iniciar.bat",
      command: null,
      bestEffortUrl: "http://127.0.0.1:7327",
    },
  },
];
