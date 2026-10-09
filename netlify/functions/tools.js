/**
 * Backend do Painel DP: permite criar, editar e remover ferramentas do
 * /admin sem precisar editar arquivo nenhum à mão. Cada chamada lê o
 * arquivo assets/js/tools-data.js direto do GitHub, aplica a mudança e
 * grava de volta via commit — o Netlify então publica sozinho (~1 min),
 * do mesmo jeito que já acontece com um `git push` manual.
 *
 * Variáveis de ambiente exigidas (configurar em Netlify → Site settings →
 * Environment variables — veja README.md para o passo a passo):
 *   GITHUB_TOKEN    token do GitHub "fine-grained", com acesso restrito
 *                   SÓ a este repositório e permissão Contents: Read/write
 *                   (nunca um token clássico com escopo "repo" completo —
 *                   quem descobrir a senha do /admin herda o alcance
 *                   deste token, então quanto mais restrito, melhor)
 *   ADMIN_PASSWORD  senha compartilhada exigida para usar o /admin
 *   GITHUB_REPO     opcional, default "Gbex-RH/PAINEL-DP"
 *   GITHUB_BRANCH   opcional, default "main"
 */

const crypto = require("crypto");

const TOOLS_PATH = "assets/js/tools-data.js";
const START_MARKER = "/*__TOOLS_JSON_START__*/";
const END_MARKER = "/*__TOOLS_JSON_END__*/";

const ALLOWED_ICONS = [
  "shield-check",
  "layout-dashboard",
  "clock",
  "file-spreadsheet",
  "search",
  "terminal",
  "globe",
  "folder-open",
];

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function getEnv() {
  const token = process.env.GITHUB_TOKEN;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const repo = process.env.GITHUB_REPO || "Gbex-RH/PAINEL-DP";
  const branch = process.env.GITHUB_BRANCH || "main";
  return { token, adminPassword, repo, branch };
}

function checkAuth(event, adminPassword) {
  if (!adminPassword) {
    return "ADMIN_PASSWORD não está configurado no Netlify (Site settings → Environment variables).";
  }
  const headers = event.headers || {};
  const sent = headers["x-admin-password"] || headers["X-Admin-Password"];
  if (!sent || !safeEqual(String(sent), adminPassword)) {
    return "unauthorized";
  }
  return null;
}

// Comparação em tempo constante: compara os hashes SHA-256 (sempre do mesmo
// tamanho) para que o tempo de resposta não revele quantas letras acertaram.
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Limite de tentativas de senha por IP: 5 erros em 15 min bloqueiam o IP até
// a janela acabar. ATENÇÃO: este Map vive na memória de UMA instância da
// função (cada instância serverless tem o seu e some quando ela é
// reciclada), então é uma proteção "melhor esforço". A proteção de verdade
// virá depois, com login via Firebase.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const FAIL_DELAY_MS = 1000;
const attempts = new Map(); // ip -> { count, first }

function getClientIp(event) {
  const h = event.headers || {};
  const direct = h["x-nf-client-connection-ip"];
  if (direct) return String(direct).trim();
  const fwd = h["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return "unknown";
}

// Retorna minutos restantes de bloqueio, ou 0 se pode tentar.
function blockedMinutes(ip, now) {
  const a = attempts.get(ip);
  if (!a) return 0;
  if (now - a.first >= WINDOW_MS) {
    attempts.delete(ip);
    return 0;
  }
  if (a.count >= MAX_FAILURES) return Math.max(1, Math.ceil((a.first + WINDOW_MS - now) / 60000));
  return 0;
}

function registerFailure(ip, now) {
  const a = attempts.get(ip);
  if (!a || now - a.first >= WINDOW_MS) attempts.set(ip, { count: 1, first: now });
  else a.count += 1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function githubGetFile(repo, branch, token) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${TOOLS_PATH}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "painel-dp-admin",
      },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    console.error("GitHub GET falhou:", res.status, text);
    throw new Error(`GitHub GET ${res.status}`);
  }
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { content, sha: data.sha };
}

async function githubPutFile(repo, branch, token, newContent, sha, message) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${TOOLS_PATH}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "painel-dp-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(newContent, "utf8").toString("base64"),
      sha,
      branch,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("GitHub PUT falhou:", res.status, text);
    throw new Error(`GitHub PUT ${res.status}`);
  }
  const data = await res.json();
  return data.content.sha;
}

// Usa lastIndexOf para o marcador de fechamento: se o texto de alguma
// ferramenta contiver essa string literalmente (bloqueado por
// validateTool, mas defesa em profundidade), a ocorrência real — a que
// fecha o array — é sempre a última do arquivo, nunca uma anterior.
function parseTools(fileContent) {
  const start = fileContent.indexOf(START_MARKER);
  const end = fileContent.lastIndexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Marcadores JSON não encontrados em tools-data.js — arquivo foi editado de um jeito incompatível.");
  }
  const jsonText = fileContent.slice(start + START_MARKER.length, end);
  return JSON.parse(jsonText);
}

function serializeTools(fileContent, tools) {
  const start = fileContent.indexOf(START_MARKER);
  const end = fileContent.lastIndexOf(END_MARKER);
  const before = fileContent.slice(0, start + START_MARKER.length);
  const after = fileContent.slice(end);
  return before + JSON.stringify(tools, null, 2) + after;
}

function slugify(str) {
  return (str || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const FORBIDDEN_SUBSTRINGS = ["__TOOLS_JSON_START__", "__TOOLS_JSON_END__"];

function isHttpUrl(value) {
  try {
    const u = new URL(String(value || "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validateTool(tool) {
  const errors = [];
  if (FORBIDDEN_SUBSTRINGS.some((s) => JSON.stringify(tool).includes(s))) {
    errors.push("Nenhum campo pode conter o texto __TOOLS_JSON_START__ ou __TOOLS_JSON_END__ (reservado para o arquivo de dados).");
  }
  if (!tool.name || !tool.name.trim()) errors.push("Nome é obrigatório.");
  if (!tool.description || !tool.description.trim()) errors.push("Descrição é obrigatória.");
  if (!tool.category || !tool.category.trim()) errors.push("Categoria é obrigatória.");
  if (!ALLOWED_ICONS.includes(tool.icon)) errors.push("Ícone inválido.");
  if (!["tiny", "compact", "small", "medium", "large"].includes(tool.cardSize)) errors.push("Tamanho de card inválido.");
  if (tool.status !== "hosted" && tool.status !== "local") errors.push("Status deve ser 'hosted' ou 'local'.");

  if (/[<>]/.test(JSON.stringify(tool))) errors.push("Os campos não podem conter os caracteres < ou >.");

  if (tool.status === "hosted") {
    if (!tool.hosted || !isHttpUrl(tool.hosted.url)) {
      errors.push("URL da ferramenta hospedada é obrigatória e deve começar com http(s)://.");
    }
  }
  if (tool.status === "local" && tool.local && tool.local.bestEffortUrl && !isHttpUrl(tool.local.bestEffortUrl)) {
    errors.push("O endereço 'se já estiver rodando' deve começar com http(s)://.");
  }

  if (tool.status === "local") {
    if (!tool.local || !tool.local.reason || !tool.local.reason.trim()) {
      errors.push("Motivo de uso local é obrigatório.");
    }
    if (!tool.local || !Array.isArray(tool.local.steps) || tool.local.steps.length === 0) {
      errors.push("Pelo menos um passo é obrigatório para ferramentas locais.");
    }
    if (!tool.local || !tool.local.path || !tool.local.path.trim()) {
      errors.push("Caminho é obrigatório para ferramentas locais.");
    }
  }

  return errors;
}

function buildToolRecord(input, existing) {
  const status = input.status === "local" ? "local" : "hosted";
  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => t.trim()).filter(Boolean)
    : [];

  const record = {
    id: existing ? existing.id : slugify(input.name),
    name: (input.name || "").trim(),
    description: (input.description || "").trim(),
    category: (input.category || "").trim(),
    tags,
    icon: input.icon,
    highlight: input.highlight ? input.highlight.trim() : null,
    version: input.version ? input.version.trim() : null,
    cardSize: ["tiny", "compact", "small", "medium", "large"].includes(input.cardSize) ? input.cardSize : "medium",
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : 999,
    status,
    hosted: null,
    local: null,
  };

  if (status === "hosted") {
    record.hosted = {
      url: (input.hosted && input.hosted.url ? input.hosted.url.trim() : ""),
      authNote: input.hosted && input.hosted.authNote ? input.hosted.authNote.trim() : null,
    };
  } else {
    var steps = (input.local && Array.isArray(input.local.steps)) ? input.local.steps : [];
    record.local = {
      reason: (input.local && input.local.reason ? input.local.reason.trim() : ""),
      steps: steps.map((s) => s.trim()).filter(Boolean),
      path: (input.local && input.local.path ? input.local.path.trim() : ""),
      command: input.local && input.local.command ? input.local.command.trim() : null,
      bestEffortUrl: input.local && input.local.bestEffortUrl ? input.local.bestEffortUrl.trim() : null,
    };
  }

  return record;
}

async function handleList(env) {
  const { content, sha } = await githubGetFile(env.repo, env.branch, env.token);
  const tools = parseTools(content);
  return respond(200, { tools, sha });
}

// payload.sha é o sha que o cliente tinha na tela quando começou a editar.
// Se alguém mais salvou uma mudança nesse meio-tempo, o sha atual já não
// bate mais — recusamos em vez de sobrescrever silenciosamente a edição
// alheia (o cliente recarrega a lista e tenta de novo).
async function handleMutate(env, payload) {
  const action = payload.action;
  if (action === "batch") return handleBatch(env, payload);
  if (!["create", "update", "delete"].includes(action)) {
    return respond(400, { error: "Ação inválida." });
  }

  const { content, sha } = await githubGetFile(env.repo, env.branch, env.token);

  if (payload.sha && payload.sha !== sha) {
    return respond(409, {
      error: "A lista de ferramentas mudou desde que esta página foi carregada. Recarregue e tente novamente.",
    });
  }

  const tools = parseTools(content);

  if (action === "create") {
    const record = buildToolRecord(payload.tool, null);
    const errors = validateTool(record);
    if (!record.id) errors.push("Não foi possível gerar um id a partir do nome.");
    if (tools.some((t) => t.id === record.id)) errors.push(`Já existe uma ferramenta com o id "${record.id}".`);
    if (errors.length) return respond(400, { error: errors.join(" ") });

    tools.push(record);
    const newContent = serializeTools(content, tools);
    const newSha = await githubPutFile(env.repo, env.branch, env.token, newContent, sha, `admin: adiciona ferramenta "${record.name}"`);
    return respond(200, { tools, sha: newSha });
  }

  if (action === "update") {
    const idx = tools.findIndex((t) => t.id === payload.id);
    if (idx === -1) return respond(404, { error: `Ferramenta "${payload.id}" não encontrada.` });

    const record = buildToolRecord(payload.tool, tools[idx]);
    const errors = validateTool(record);
    if (errors.length) return respond(400, { error: errors.join(" ") });

    tools[idx] = record;
    const newContent = serializeTools(content, tools);
    const newSha = await githubPutFile(env.repo, env.branch, env.token, newContent, sha, `admin: atualiza ferramenta "${record.name}"`);
    return respond(200, { tools, sha: newSha });
  }

  // delete
  const idx = tools.findIndex((t) => t.id === payload.id);
  if (idx === -1) return respond(404, { error: `Ferramenta "${payload.id}" não encontrada.` });
  const removed = tools[idx];
  tools.splice(idx, 1);
  const newContent = serializeTools(content, tools);
  const newSha = await githubPutFile(env.repo, env.branch, env.token, newContent, sha, `admin: remove ferramenta "${removed.name}"`);
  return respond(200, { tools, sha: newSha });
}

// Várias alterações de uma vez (o admin acumula e envia tudo no "Salvar
// tudo"): aplica em ordem, valida todas e só então faz UM commit. Se
// qualquer item for inválido, nada é gravado.
async function handleBatch(env, payload) {
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  if (changes.length === 0) return respond(400, { error: "Nenhuma alteração para salvar." });
  if (changes.length > 200) return respond(400, { error: "Alterações demais num envio só." });
  if (!payload.sha) return respond(400, { error: "Versão da lista ausente. Recarregue a página." });

  const { content, sha } = await githubGetFile(env.repo, env.branch, env.token);
  if (payload.sha !== sha) {
    return respond(409, {
      error: "A lista de ferramentas mudou desde que esta página foi carregada (outra pessoa salvou). Suas alterações continuam na tela: recarregue a lista e aplique de novo.",
    });
  }

  const tools = parseTools(content);
  const errors = [];
  const resumo = { create: [], update: [], delete: [] };

  changes.forEach((ch, i) => {
    const prefixo = `Item ${i + 1}`;
    if (ch.op === "create") {
      const record = buildToolRecord(ch.tool || {}, null);
      const errs = validateTool(record);
      if (!record.id) errs.push("Não foi possível gerar um id a partir do nome.");
      if (tools.some((t) => t.id === record.id)) errs.push(`Já existe uma ferramenta com o id "${record.id}".`);
      if (errs.length) return errors.push(`${prefixo} (${record.name || "nova"}): ${errs.join(" ")}`);
      tools.push(record);
      resumo.create.push(record.name);
    } else if (ch.op === "update") {
      const idx = tools.findIndex((t) => t.id === ch.id);
      if (idx === -1) return errors.push(`${prefixo}: ferramenta "${ch.id}" não encontrada.`);
      const record = buildToolRecord(ch.tool || {}, tools[idx]);
      const errs = validateTool(record);
      if (errs.length) return errors.push(`${prefixo} (${record.name}): ${errs.join(" ")}`);
      tools[idx] = record;
      resumo.update.push(record.name);
    } else if (ch.op === "delete") {
      const idx = tools.findIndex((t) => t.id === ch.id);
      if (idx === -1) return errors.push(`${prefixo}: ferramenta "${ch.id}" não encontrada.`);
      resumo.delete.push(tools[idx].name);
      tools.splice(idx, 1);
    } else {
      errors.push(`${prefixo}: operação inválida.`);
    }
  });

  if (errors.length) return respond(400, { error: "Nada foi salvo. " + errors.join(" | ") });

  const partes = [];
  if (resumo.create.length) partes.push(`adiciona ${resumo.create.join(", ")}`);
  if (resumo.update.length) partes.push(`atualiza ${resumo.update.join(", ")}`);
  if (resumo.delete.length) partes.push(`remove ${resumo.delete.join(", ")}`);
  let message = `admin: ${changes.length} alteração(ões) — ${partes.join("; ")}`;
  if (message.length > 200) message = message.slice(0, 197) + "...";

  const newContent = serializeTools(content, tools);
  const newSha = await githubPutFile(env.repo, env.branch, env.token, newContent, sha, message);
  return respond(200, { tools, sha: newSha });
}

exports.handler = async function (event) {
  const env = getEnv();

  const ip = getClientIp(event);
  const wait = blockedMinutes(ip, Date.now());
  if (wait > 0) {
    return respond(429, { error: `Muitas tentativas. Aguarde ${wait} minuto${wait === 1 ? "" : "s"}.` });
  }

  const authError = checkAuth(event, env.adminPassword);
  if (authError === "unauthorized") {
    registerFailure(ip, Date.now());
    await sleep(FAIL_DELAY_MS);
    return respond(401, { error: "Senha incorreta." });
  }
  if (authError) {
    console.error("Configuração ausente:", authError);
    return respond(500, { error: "Servidor sem configuração de senha. Avise o responsável." });
  }
  attempts.delete(ip);

  if (!env.token) {
    return respond(500, { error: "GITHUB_TOKEN não está configurado no Netlify (Site settings → Environment variables)." });
  }

  try {
    if (event.httpMethod === "GET") {
      return await handleList(env);
    }
    if (event.httpMethod === "POST") {
      let payload;
      try {
        payload = JSON.parse(event.body || "{}");
      } catch {
        return respond(400, { error: "Requisição inválida (JSON malformado)." });
      }
      if (!payload || typeof payload !== "object") return respond(400, { error: "Requisição inválida." });
      return await handleMutate(env, payload);
    }
    return respond(405, { error: "Método não permitido." });
  } catch (err) {
    // Detalhes (inclusive respostas do GitHub) ficam só no log do servidor.
    console.error("Erro em tools:", err);
    return respond(500, { error: "Erro ao falar com o GitHub ou processar a lista. Tente novamente em instantes." });
  }
};
