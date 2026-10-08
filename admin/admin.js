// Admin do Painel DP. Só funciona no site publicado (depende da função
// serverless em netlify/functions/tools.js) — por isso pode usar JS
// moderno livremente, ao contrário de assets/js/app.js, que precisa
// funcionar também abrindo index.html por duplo clique (file://).
//
// As edições NÃO são gravadas uma a uma: o formulário só "aplica" a
// mudança num rascunho local (state.draft). O botão "Salvar tudo" envia
// todas as alterações pendentes de uma vez, num único commit.
(function () {
  "use strict";

  const API_URL = "/.netlify/functions/tools";

  const state = {
    password: "",
    server: [], // lista como está no GitHub
    draft: [], // lista com as alterações aplicadas e ainda não salvas
    pending: new Map(), // id -> "new" | "edited" | "deleted"
    sha: null, // sha do tools-data.js carregado — usado pra detectar edição concorrente
    editingId: null, // null = criando uma ferramenta nova
    saving: false,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function slugify(str) {
    return (str || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));

  async function api(method, body) {
    const res = await fetch(API_URL, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": state.password,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Erro ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function loadFromServer(data) {
    state.server = data.tools;
    state.draft = clone(data.tools);
    state.sha = data.sha;
    state.pending.clear();
  }

  /* ---------- gate (login) ---------- */

  async function handleGateSubmit(e) {
    e.preventDefault();
    const pwd = $("gate-password").value;
    $("gate-error").hidden = true;

    try {
      state.password = pwd;
      loadFromServer(await api("GET"));
      $("gate-screen").hidden = true;
      $("admin-app").hidden = false;
      resetForm();
    } catch (err) {
      state.password = "";
      $("gate-error").textContent = err.message;
      $("gate-error").hidden = false;
    }
  }

  /* ---------- barra de alterações pendentes ---------- */

  function renderPendingBar() {
    const n = state.pending.size;
    $("pending-bar").hidden = n === 0;
    $("pending-count").textContent =
      n === 1 ? "1 alteração não salva" : `${n} alterações não salvas`;
    $("btn-save-all").disabled = state.saving || n === 0;
    $("btn-save-all").textContent = state.saving ? "Salvando..." : "Salvar tudo";
    $("btn-discard-all").disabled = state.saving;
  }

  function showSaveError(message, canReload) {
    $("pending-error").textContent = message;
    $("btn-reload-keep").hidden = !canReload;
    $("pending-error-box").hidden = false;
  }

  function hideSaveError() {
    $("pending-error-box").hidden = true;
  }

  function buildChanges() {
    const changes = [];
    state.pending.forEach((kind, id) => {
      if (kind === "deleted") {
        changes.push({ op: "delete", id });
      } else {
        const tool = state.draft.find((t) => t.id === id);
        if (tool) changes.push({ op: kind === "new" ? "create" : "update", id, tool });
      }
    });
    return changes;
  }

  async function saveAll() {
    if (state.pending.size === 0 || state.saving) return;
    hideSaveError();
    state.saving = true;
    renderPendingBar();
    try {
      loadFromServer(await api("POST", { action: "batch", changes: buildChanges(), sha: state.sha }));
      const editing = state.editingId && state.draft.find((t) => t.id === state.editingId);
      if (editing) loadToolIntoForm(editing);
      else resetForm();
      showFormMsg("success", "Tudo salvo! O Netlify publica as mudanças em ~1 min.");
    } catch (err) {
      showSaveError(err.message, err.status === 409);
    } finally {
      state.saving = false;
      renderPendingBar();
    }
  }

  // Depois de um 409 (alguém salvou nesse meio-tempo): recarrega a lista do
  // servidor e reaplica por cima as alterações pendentes desta tela.
  async function reloadKeepingChanges() {
    const changes = buildChanges();
    try {
      loadFromServer(await api("GET"));
    } catch (err) {
      showSaveError(err.message, false);
      return;
    }
    changes.forEach((ch) => {
      const idx = state.draft.findIndex((t) => t.id === ch.id);
      if (ch.op === "delete") {
        if (idx !== -1) state.pending.set(ch.id, "deleted");
      } else if (ch.op === "update" && idx !== -1) {
        state.draft[idx] = ch.tool;
        state.pending.set(ch.id, "edited");
      } else {
        if (idx === -1) state.draft.push(ch.tool);
        state.pending.set(ch.id, idx === -1 ? "new" : "edited");
      }
    });
    hideSaveError();
    resetForm();
    showFormMsg("success", "Lista recarregada e suas alterações reaplicadas. Revise e clique em Salvar tudo.");
  }

  function discardAll() {
    if (!confirm("Descartar todas as alterações não salvas?")) return;
    state.draft = clone(state.server);
    state.pending.clear();
    hideSaveError();
    resetForm();
  }

  /* ---------- lista de ferramentas ---------- */

  const PENDING_LABEL = { new: "novo", edited: "editado", deleted: "excluído" };

  function renderToolsList() {
    const container = $("tools-list");
    const sorted = [...state.draft].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    container.innerHTML = "";
    sorted.forEach((tool) => {
      const kind = state.pending.get(tool.id);
      const row = document.createElement("div");
      row.className =
        "tool-row" +
        (tool.id === state.editingId ? " active" : "") +
        (kind ? " pending pending--" + kind : "");
      row.innerHTML =
        '<div class="tool-row-info">' +
        '<div class="tool-row-name"></div>' +
        '<div class="tool-row-meta"></div>' +
        "</div>" +
        '<div class="tool-row-actions">' +
        (kind === "deleted"
          ? '<button type="button" class="btn-undo">Desfazer</button>'
          : '<button type="button" class="btn-edit">Editar</button>' +
            '<button type="button" class="btn-remove">Excluir</button>') +
        "</div>";

      row.querySelector(".tool-row-name").textContent = tool.name;
      if (kind) {
        const tag = document.createElement("span");
        tag.className = "pending-tag";
        tag.textContent = PENDING_LABEL[kind];
        row.querySelector(".tool-row-name").appendChild(tag);
      }
      row.querySelector(".tool-row-meta").textContent =
        tool.category + " · " + (tool.status === "hosted" ? "Acesso direto" : "Uso local");

      if (kind === "deleted") {
        row.querySelector(".btn-undo").addEventListener("click", () => undoDelete(tool));
      } else {
        row.querySelector(".btn-edit").addEventListener("click", () => loadToolIntoForm(tool));
        row.querySelector(".btn-remove").addEventListener("click", () => deleteTool(tool));
      }

      container.appendChild(row);
    });

    renderCategoryOptions();
    renderPendingBar();
  }

  function renderCategoryOptions() {
    const list = $("category-options");
    const categories = [...new Set(state.draft.map((t) => t.category))];
    list.innerHTML = "";
    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      list.appendChild(opt);
    });
  }

  /* ---------- formulário ---------- */

  function showFormMsg(type, text) {
    $("form-error").hidden = true;
    $("form-success").hidden = true;
    const el = $(type === "error" ? "form-error" : "form-success");
    el.textContent = text;
    el.hidden = false;
  }

  function toggleStatusFields() {
    const status = $("f-status").value;
    $("fieldset-hosted").hidden = status !== "hosted";
    $("fieldset-local").hidden = status !== "local";
  }

  function resetForm() {
    state.editingId = null;
    $("form-title").textContent = "Nova ferramenta";
    $("tool-form").reset();
    $("f-id").value = "(gerado a partir do nome)";
    $("f-status").value = "hosted";
    $("f-icon").value = "layout-dashboard";
    $("f-card-size").value = "medium";
    const maxOrder = state.draft.reduce((max, t) => Math.max(max, Number(t.order) || 0), 0);
    $("f-order").value = maxOrder + 10;
    $("btn-delete-tool").hidden = true;
    $("form-error").hidden = true;
    $("form-success").hidden = true;
    toggleStatusFields();
    renderToolsList();
  }

  function loadToolIntoForm(tool) {
    state.editingId = tool.id;
    $("form-title").textContent = "Editar: " + tool.name;
    $("form-error").hidden = true;
    $("form-success").hidden = true;

    $("f-name").value = tool.name;
    $("f-id").value = tool.id;
    $("f-category").value = tool.category;
    $("f-icon").value = tool.icon;
    $("f-description").value = tool.description;
    $("f-tags").value = (tool.tags || []).join(", ");
    $("f-highlight").value = tool.highlight || "";
    $("f-version").value = tool.version || "";
    $("f-card-size").value = tool.cardSize || "medium";
    $("f-order").value = tool.order;
    $("f-status").value = tool.status;

    $("f-hosted-url").value = tool.hosted ? tool.hosted.url || "" : "";
    $("f-hosted-authnote").value = tool.hosted ? tool.hosted.authNote || "" : "";

    $("f-local-reason").value = tool.local ? tool.local.reason || "" : "";
    $("f-local-steps").value = tool.local ? (tool.local.steps || []).join("\n") : "";
    $("f-local-path").value = tool.local ? tool.local.path || "" : "";
    $("f-local-command").value = tool.local ? tool.local.command || "" : "";
    $("f-local-besteffort").value = tool.local ? tool.local.bestEffortUrl || "" : "";

    $("btn-delete-tool").hidden = false;
    toggleStatusFields();
    renderToolsList();
  }

  function collectFormTool() {
    const status = $("f-status").value;
    return {
      name: $("f-name").value.trim(),
      category: $("f-category").value.trim(),
      icon: $("f-icon").value,
      description: $("f-description").value.trim(),
      tags: $("f-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
      highlight: $("f-highlight").value.trim() || null,
      version: $("f-version").value.trim() || null,
      cardSize: $("f-card-size").value,
      order: Number($("f-order").value) || 999,
      status,
      hosted:
        status === "hosted"
          ? { url: $("f-hosted-url").value.trim(), authNote: $("f-hosted-authnote").value.trim() || null }
          : null,
      local:
        status === "local"
          ? {
              reason: $("f-local-reason").value.trim(),
              steps: $("f-local-steps").value.split("\n").map((s) => s.trim()).filter(Boolean),
              path: $("f-local-path").value.trim(),
              command: $("f-local-command").value.trim() || null,
              bestEffortUrl: $("f-local-besteffort").value.trim() || null,
            }
          : null,
    };
  }

  // Mesmas regras do servidor (validateTool), pra avisar já ao aplicar —
  // o servidor valida de novo no "Salvar tudo".
  function validateLocally(tool) {
    const errors = [];
    const isHttp = (u) => {
      try {
        const p = new URL(u).protocol;
        return p === "http:" || p === "https:";
      } catch {
        return false;
      }
    };
    if (/[<>]/.test(JSON.stringify(tool))) errors.push("Os campos não podem conter < ou >.");
    if (tool.status === "hosted" && !isHttp(tool.hosted.url)) {
      errors.push("A URL deve começar com http(s)://.");
    }
    if (tool.status === "local") {
      if (!tool.local.reason) errors.push("Motivo de uso local é obrigatório.");
      if (tool.local.steps.length === 0) errors.push("Informe pelo menos um passo.");
      if (!tool.local.path) errors.push("Caminho é obrigatório.");
      if (tool.local.bestEffortUrl && !isHttp(tool.local.bestEffortUrl)) {
        errors.push("O endereço 'se já estiver rodando' deve começar com http(s)://.");
      }
    }
    return errors;
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const tool = collectFormTool();
    const errors = validateLocally(tool);
    if (errors.length) return showFormMsg("error", errors.join(" "));

    if (state.editingId) {
      const idx = state.draft.findIndex((t) => t.id === state.editingId);
      tool.id = state.editingId;
      state.draft[idx] = tool;
      if (state.pending.get(tool.id) !== "new") state.pending.set(tool.id, "edited");
      loadToolIntoForm(tool);
    } else {
      tool.id = slugify(tool.name);
      if (!tool.id) return showFormMsg("error", "Não foi possível gerar um id a partir do nome.");
      if (state.draft.some((t) => t.id === tool.id)) {
        return showFormMsg("error", `Já existe uma ferramenta com o id "${tool.id}".`);
      }
      state.draft.push(tool);
      state.pending.set(tool.id, "new");
      loadToolIntoForm(tool);
    }
    showFormMsg("success", "Alteração aplicada. Clique em \"Salvar tudo\" (no topo) para publicar.");
  }

  function deleteTool(tool) {
    if (state.pending.get(tool.id) === "new") {
      // nunca foi salvo: basta tirar do rascunho
      state.draft = state.draft.filter((t) => t.id !== tool.id);
      state.pending.delete(tool.id);
    } else {
      state.pending.set(tool.id, "deleted");
    }
    if (state.editingId === tool.id) resetForm();
    else renderToolsList();
  }

  function undoDelete(tool) {
    const original = state.server.find((t) => t.id === tool.id);
    const idx = state.draft.findIndex((t) => t.id === tool.id);
    const changed = original && JSON.stringify(original) !== JSON.stringify(state.draft[idx]);
    if (changed) state.pending.set(tool.id, "edited");
    else state.pending.delete(tool.id);
    renderToolsList();
  }

  function init() {
    $("gate-form").addEventListener("submit", handleGateSubmit);
    $("btn-new-tool").addEventListener("click", resetForm);
    $("tool-form").addEventListener("submit", handleFormSubmit);
    $("btn-delete-tool").addEventListener("click", () => {
      const tool = state.draft.find((t) => t.id === state.editingId);
      if (tool) deleteTool(tool);
    });
    $("f-status").addEventListener("change", toggleStatusFields);
    $("btn-save-all").addEventListener("click", saveAll);
    $("btn-discard-all").addEventListener("click", discardAll);
    $("btn-reload-keep").addEventListener("click", reloadKeepingChanges);
    window.addEventListener("beforeunload", (e) => {
      if (state.pending.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
