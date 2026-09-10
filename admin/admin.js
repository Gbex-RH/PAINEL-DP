// Admin do Painel DP. Só funciona no site publicado (depende da função
// serverless em netlify/functions/tools.js) — por isso pode usar JS
// moderno livremente, ao contrário de assets/js/app.js, que precisa
// funcionar também abrindo index.html por duplo clique (file://).
(function () {
  "use strict";

  const API_URL = "/.netlify/functions/tools";

  const state = {
    password: "",
    tools: [],
    sha: null, // sha do tools-data.js carregado — usado pra detectar edição concorrente
    editingId: null, // null = criando uma ferramenta nova
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
      throw new Error(data.error || `Erro ${res.status}`);
    }
    return data;
  }

  /* ---------- gate (login) ---------- */

  async function handleGateSubmit(e) {
    e.preventDefault();
    const pwd = $("gate-password").value;
    $("gate-error").hidden = true;

    try {
      state.password = pwd;
      const data = await api("GET");
      state.tools = data.tools;
      state.sha = data.sha;
      $("gate-screen").hidden = true;
      $("admin-app").hidden = false;
      renderToolsList();
      resetForm();
    } catch (err) {
      state.password = "";
      $("gate-error").textContent = err.message;
      $("gate-error").hidden = false;
    }
  }

  /* ---------- lista de ferramentas ---------- */

  function renderToolsList() {
    const container = $("tools-list");
    const sorted = [...state.tools].sort((a, b) => a.order - b.order);

    container.innerHTML = "";
    sorted.forEach((tool) => {
      const row = document.createElement("div");
      row.className = "tool-row" + (tool.id === state.editingId ? " active" : "");
      row.innerHTML =
        '<div class="tool-row-info">' +
        '<div class="tool-row-name"></div>' +
        '<div class="tool-row-meta"></div>' +
        "</div>" +
        '<div class="tool-row-actions">' +
        '<button type="button" class="btn-edit">Editar</button>' +
        '<button type="button" class="btn-remove">Excluir</button>' +
        "</div>";

      row.querySelector(".tool-row-name").textContent = tool.name;
      row.querySelector(".tool-row-meta").textContent =
        tool.category + " · " + (tool.status === "hosted" ? "Acesso direto" : "Uso local");

      row.querySelector(".btn-edit").addEventListener("click", () => loadToolIntoForm(tool));
      row.querySelector(".btn-remove").addEventListener("click", () => deleteTool(tool));

      container.appendChild(row);
    });

    renderCategoryOptions();
  }

  function renderCategoryOptions() {
    const list = $("category-options");
    const categories = [...new Set(state.tools.map((t) => t.category))];
    list.innerHTML = "";
    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      list.appendChild(opt);
    });
  }

  /* ---------- formulário ---------- */

  function toggleStatusFields() {
    const status = $("f-status").value;
    $("fieldset-hosted").hidden = status !== "hosted";
    $("fieldset-local").hidden = status !== "local";
  }

  function resetForm() {
    state.editingId = null;
    $("form-title").textContent = "Nova ferramenta";
    $("tool-form").reset();
    $("f-id").value = "(gerado ao salvar)";
    $("f-status").value = "hosted";
    $("f-icon").value = "layout-dashboard";
    const maxOrder = state.tools.reduce((max, t) => Math.max(max, t.order || 0), 0);
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
      name: $("f-name").value,
      category: $("f-category").value,
      icon: $("f-icon").value,
      description: $("f-description").value,
      tags: $("f-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
      highlight: $("f-highlight").value,
      version: $("f-version").value,
      order: $("f-order").value,
      status,
      hosted: {
        url: $("f-hosted-url").value,
        authNote: $("f-hosted-authnote").value,
      },
      local: {
        reason: $("f-local-reason").value,
        steps: $("f-local-steps").value.split("\n").map((s) => s.trim()).filter(Boolean),
        path: $("f-local-path").value,
        command: $("f-local-command").value,
        bestEffortUrl: $("f-local-besteffort").value,
      },
    };
  }

  // Se outra sessão salvou algo entre o carregamento desta página e este
  // envio, o backend recusa com 409 (sha desatualizado). Buscamos a lista
  // mais recente em silêncio pra próxima tentativa já ter o sha certo —
  // o formulário na tela não é descartado, só o "estoque" de fundo.
  async function resyncSilently() {
    try {
      const data = await api("GET");
      state.tools = data.tools;
      state.sha = data.sha;
      renderToolsList();
    } catch (_) {
      /* mantém o estado anterior se nem o resync funcionar */
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    $("form-error").hidden = true;
    $("form-success").hidden = true;

    const tool = collectFormTool();
    const action = state.editingId ? "update" : "create";

    try {
      const data = await api("POST", { action, id: state.editingId, tool, sha: state.sha });
      state.tools = data.tools;
      state.sha = data.sha;
      $("form-success").textContent = "Salvo! O Netlify publica a mudança em ~1 min.";
      $("form-success").hidden = false;
      if (action === "create") {
        const created = state.tools.find(
          (t) => t.id === slugify(tool.name) || t.name === tool.name
        );
        if (created) loadToolIntoForm(created);
      } else {
        renderToolsList();
      }
    } catch (err) {
      $("form-error").textContent = err.message;
      $("form-error").hidden = false;
      resyncSilently();
    }
  }

  async function deleteTool(tool) {
    if (!confirm(`Remover "${tool.name}" do Painel DP? Essa ação não pode ser desfeita por aqui.`)) return;
    try {
      const data = await api("POST", { action: "delete", id: tool.id, sha: state.sha });
      state.tools = data.tools;
      state.sha = data.sha;
      if (state.editingId === tool.id) resetForm();
      else renderToolsList();
    } catch (err) {
      alert(err.message);
      resyncSilently();
    }
  }

  function init() {
    $("gate-form").addEventListener("submit", handleGateSubmit);
    $("btn-new-tool").addEventListener("click", resetForm);
    $("tool-form").addEventListener("submit", handleFormSubmit);
    $("btn-delete-tool").addEventListener("click", () => {
      const tool = state.tools.find((t) => t.id === state.editingId);
      if (tool) deleteTool(tool);
    });
    $("f-status").addEventListener("change", toggleStatusFields);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
