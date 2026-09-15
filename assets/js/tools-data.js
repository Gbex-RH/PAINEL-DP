/**
 * Cada ferramenta do Painel DP é um objeto neste array.
 *
 * Formas de adicionar uma nova ferramenta (nenhum outro arquivo precisa
 * mudar — categorias, filtros e contagem são gerados a partir destes dados):
 *
 *   1. Pelo painel /admin (recomendado): abra /admin no site publicado,
 *      entre com a senha de administrador e use o formulário. Ele grava
 *      este arquivo direto no GitHub e o Netlify publica sozinho.
 *   2. Editando este arquivo à mão e dando `git push` (veja README.md).
 *
 * IMPORTANTE: o conteúdo entre os marcadores __TOOLS_JSON_START__ e
 * __TOOLS_JSON_END__ é JSON puro (chaves entre aspas, sem comentários,
 * sem vírgula sobrando) — é isso que permite a função do backend
 * (netlify/functions/tools.js) ler e regravar este arquivo automaticamente.
 * Se editar à mão, mantenha essa área como JSON válido.
 *
 * Campos:
 *   id          slug estável (kebab-case) — usado em ids do DOM e no modal
 *   name        nome exibido no card
 *   description descrição curta (2-3 linhas no card, completa no modal)
 *   category    texto livre — vira automaticamente um chip de filtro
 *   tags        palavras extras usadas só na busca (opcional)
 *   icon        chave de um <symbol id="icon-...">  já definido em index.html
 *   highlight   trecho literal de "description" a destacar com a cor de marca (opcional)
 *   version     rótulo de versão opcional, mostrado como legenda
 *   order       peso de ordenação manual ("Padrão")
 *   status      "hosted" (tem URL fixa) ou "local" (precisa ser iniciada na máquina)
 *   hosted      { url, authNote? } — obrigatório quando status === "hosted"
 *   local       { reason, steps[], path, command, bestEffortUrl } — obrigatório quando status === "local"
 */
const TOOLS = /*__TOOLS_JSON_START__*/[
  {
    "id": "dashboard-rh",
    "name": "Dashboard RH Guanabara Express",
    "description": "Painel completo de RH: headcount, salários, licenças, faltas, horas extras, comissões, turnover, CCT e custo de motoristas — GBEX e GBLOG.",
    "category": "Dashboard Gerencial",
    "tags": [
      "rh",
      "headcount",
      "turnover",
      "cct",
      "salarios"
    ],
    "icon": "layout-dashboard",
    "highlight": "Painel completo de RH",
    "version": "v75",
    "order": 10,
    "status": "hosted",
    "hosted": {
      "url": "https://rh-guanabara.netlify.app",
      "authNote": "Requer login (Firebase)"
    },
    "local": null
  },
  {
    "id": "controle-ponto",
    "name": "Controle de Ponto",
    "description": "Gestão de pendências de ponto em 4 abas: Pendências, Meus Lançamentos, Auditoria e Validação.",
    "category": "Ponto Eletrônico",
    "tags": [
      "ponto",
      "batidas",
      "afdt",
      "fortes"
    ],
    "icon": "clock",
    "highlight": "4 abas",
    "version": "v70",
    "order": 20,
    "status": "hosted",
    "hosted": {
      "url": "https://ponto-rh.netlify.app",
      "authNote": null
    },
    "local": null
  },
  {
    "id": "auditor-folha",
    "name": "Auditor de Folha",
    "description": "Audita a folha de pagamento mensal (Fortes Pessoal) por filial, cruzando com o mês anterior e a CCT vigente. Roda 100% no navegador — nenhum dado sai da máquina.",
    "category": "Folha de Pagamento",
    "tags": [
      "folha",
      "auditoria",
      "inss",
      "fgts",
      "irrf",
      "offline"
    ],
    "icon": "shield-check",
    "highlight": "100% no navegador",
    "version": null,
    "order": 30,
    "status": "hosted",
    "hosted": {
      "url": "https://auditor-de-folha.netlify.app",
      "authNote": null
    },
    "local": null
  },
  {
    "id": "conversor-folha",
    "name": "Conversor de Folha",
    "description": "Converte o relatório de folha de pagamento (PDF, Fortes) em Markdown ou CSV, conferindo a aritmética do documento durante a conversão.",
    "category": "Folha de Pagamento",
    "tags": [
      "folha",
      "pdf",
      "markdown",
      "csv",
      "conversor"
    ],
    "icon": "file-spreadsheet",
    "highlight": "conferindo a aritmética",
    "version": null,
    "order": 40,
    "status": "local",
    "hosted": null,
    "local": {
      "reason": "Servidor local próprio: o PDF é lido inteiramente no navegador, sem enviar dados a lugar nenhum.",
      "steps": [
        "Abra a pasta “PROJETO MD\\files(4)\\conversor-folha”.",
        "Dê duplo clique em “iniciar.bat”.",
        "O navegador abre sozinho em http://127.0.0.1:7327."
      ],
      "path": "PROJETO MD\\files(4)\\conversor-folha\\iniciar.bat",
      "command": null,
      "bestEffortUrl": "http://127.0.0.1:7327"
    }
  },
  {
    "id": "assinador-de-documentos",
    "name": "Assinador de Documentos",
    "description": "Essa ferramenta assina documentos utilizando o certificado digital da empresa, disponibiliza-os aos funcionários para coleta de assinatura e, em seguida, os arquiva digitalmente após assinados.",
    "category": "Ferramenta",
    "tags": [
      "assina",
      "assinatura",
      "assinador",
      "documentos",
      "contratos",
      "certificado",
      "asina"
    ],
    "icon": "file-spreadsheet",
    "highlight": null,
    "version": null,
    "order": 50,
    "status": "hosted",
    "hosted": {
      "url": "https://assinador-rh.netlify.app/",
      "authNote": null
    },
    "local": null
  },
  {
    "id": "trello",
    "name": "Trello",
    "description": "O quadro do Trello é o nosso controle centralizado de admissões. Nele vocês acompanham o status de cada candidato, desde o início do processo até a efetivação, e identificam rapidamente onde cada admissão está parada ou o que falta para concluir.",
    "category": "Dashboard Gerencial",
    "tags": [
      "trelo",
      "trello",
      "quadro",
      "admitido",
      "empregado",
      "empregados"
    ],
    "icon": "folder-open",
    "highlight": null,
    "version": null,
    "order": 10,
    "status": "hosted",
    "hosted": {
      "url": "https://trello.com/b/PEWiotWR/admissao",
      "authNote": null
    },
    "local": null
  }
]/*__TOOLS_JSON_END__*/;
