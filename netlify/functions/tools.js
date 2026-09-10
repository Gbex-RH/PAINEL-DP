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
  const sent = event.headers["x-admin-password"] || event.headers["X-Admin-Password"];
  if (!sent || sent !== adminPassword) {
    return "unauthorized";
  }
  return null;
}

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
    throw new Error(`Não foi possível ler o arquivo no GitHub (${res.status}): ${text}`);
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
    throw new Error(`Não foi possível salvar no GitHub (${res.status}): ${text}`);
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

function validateTool(tool) {
  const errors = [];
  if (FORBIDDEN_SUBSTRINGS.some((s) => JSON.stringify(tool).includes(s))) {
    errors.push("Nenhum campo pode conter o texto __TOOLS_JSON_START__ ou __TOOLS_JSON_END__ (reservado para o arquivo de dados).");
  }
  if (!tool.name || !tool.name.trim()) errors.push("Nome é obrigatório.");
  if (!tool.description || !tool.description.trim()) errors.push("Descrição é obrigatória.");
  if (!tool.category || !tool.category.trim()) errors.push("Categoria é obrigatória.");
  if (!ALLOWED_ICONS.includes(tool.icon)) errors.push("Ícone inválido.");
  if (tool.status !== "hosted" && tool.status !== "local") errors.push("Status deve ser 'hosted' ou 'local'.");

  if (tool.status === "hosted") {
    if (!tool.hosted || !tool.hosted.url || !/^https?:\/\//.test(tool.hosted.url)) {
      errors.push("URL da ferramenta hospedada é obrigatória e deve começar com http(s)://.");
    }
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

exports.handler = async function (event) {
  const env = getEnv();

  const authError = checkAuth(event, env.adminPassword);
  if (authError === "unauthorized") return respond(401, { error: "Senha incorreta." });
  if (authError) return respond(500, { error: authError });

  if (!env.token) {
    return respond(500, { error: "GITHUB_TOKEN não está configurado no Netlify (Site settings → Environment variables)." });
  }

  try {
    if (event.httpMethod === "GET") {
      return await handleList(env);
    }
    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      return await handleMutate(env, payload);
    }
    return respond(405, { error: "Método não permitido." });
  } catch (err) {
    return respond(500, { error: err.message || "Erro interno." });
  }
};
