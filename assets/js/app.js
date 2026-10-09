(function () {
  "use strict";

  var state = {
    search: "",
    category: "all",
    status: "all",
    sort: "order",
  };

  var lastFocusedEl = null;
  var hasRendered = false; // a animação de entrada dos cards só roda na 1ª renderização
  var THEMES = ["constelacao", "clara", "asfalto", "contraste"];
  var THEME_KEY = "painelDpTheme";
  var searchTimer = null;

  function normalize(str) {
    return (str || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  function getCategories() {
    var seen = {};
    var list = [];
    TOOLS.forEach(function (t) {
      if (!seen[t.category]) {
        seen[t.category] = true;
        list.push(t.category);
      }
    });
    return list;
  }

  function matchesSearch(tool, term) {
    if (!term) return true;
    var haystack = normalize(
      [tool.name, tool.description, tool.category, (tool.tags || []).join(" ")].join(" ")
    );
    return haystack.indexOf(normalize(term)) !== -1;
  }

  function getFilteredSortedTools() {
    var list = TOOLS.filter(function (t) {
      if (state.category !== "all" && t.category !== state.category) return false;
      if (state.status !== "all" && t.status !== state.status) return false;
      if (!matchesSearch(t, state.search)) return false;
      return true;
    });

    list.sort(function (a, b) {
      if (state.sort === "name") return a.name.localeCompare(b.name, "pt-BR");
      if (state.sort === "category") {
        return a.category.localeCompare(b.category, "pt-BR") || a.order - b.order;
      }
      return a.order - b.order;
    });

    return list;
  }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // só aceita http(s); qualquer outra coisa (javascript:, data:...) vira "#"
  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u || "").trim()) ? esc(String(u).trim()) : "#";
  }

  function iconSvg(iconKey) {
    return '<svg aria-hidden="true"><use href="#icon-' + esc(iconKey) + '"></use></svg>';
  }

  function badgeInfo(tool) {
    if (tool.status === "hosted") {
      return { cls: "hosted", html: "Acesso direto" };
    }
    return { cls: "local", html: "Uso local" };
  }

  function badgeHtml(tool) {
    var b = badgeInfo(tool);
    return '<span class="card-badge ' + b.cls + '">' + b.html + "</span>";
  }

  function withHighlight(text, highlight) {
    text = String(text || "");
    if (!highlight) return esc(text);
    var idx = text.indexOf(highlight);
    if (idx === -1) return esc(text);
    return (
      esc(text.slice(0, idx)) + '<span class="hl">' + esc(highlight) + "</span>" + esc(text.slice(idx + highlight.length))
    );
  }

  var prefersFineHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function attachTilt(card) {
    if (!prefersFineHover) return;
    var maxTilt = 5;

    card.addEventListener("mousemove", function (e) {
      var rect = card.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width - 0.5;
      var py = (e.clientY - rect.top) / rect.height - 0.5;

      card.style.setProperty("--mx", ((px + 0.5) * 100).toFixed(1) + "%");
      card.style.setProperty("--my", ((py + 0.5) * 100).toFixed(1) + "%");

      if (prefersReducedMotion) return;
      card.style.transform =
        "perspective(800px) rotateX(" +
        (-py * maxTilt).toFixed(2) +
        "deg) rotateY(" +
        (px * maxTilt).toFixed(2) +
        "deg) translateY(-4px)";
    });

    card.addEventListener("mouseleave", function () {
      card.style.transform = "";
    });
  }

  function createCardElement(tool, index, animate) {
    var card = document.createElement("article");
    var cardSize = ["tiny", "compact", "small", "medium", "large"].indexOf(tool.cardSize) !== -1 ? tool.cardSize : "medium";
    card.className = "card card--" + cardSize + (animate ? " card--reveal" : "");
    card.style.setProperty("--i", index);

    var actionsHtml;
    if (tool.status === "hosted") {
      actionsHtml =
        '<a class="card-open" href="' +
        safeUrl(tool.hosted.url) +
        '" target="_blank" rel="noopener" aria-label="Abrir ' +
        esc(tool.name) +
        ' (nova aba)">Abrir' +
        iconSvg("external-link") +
        "</a>" +
        '<button type="button" class="card-details" data-action="details" aria-label="Ver detalhes de ' +
        esc(tool.name) +
        '">Detalhes</button>';
    } else {
      actionsHtml =
        '<button type="button" class="card-open" data-action="details" aria-label="Abrir ' +
        esc(tool.name) +
        ' (ver passo a passo)">Abrir' +
        iconSvg("external-link") +
        "</button>";
    }

    var metaBits = [];
    if (tool.version) metaBits.push("Versão " + esc(tool.version));
    if (tool.status === "hosted" && tool.hosted.authNote) metaBits.push(esc(tool.hosted.authNote));
    var authNoteHtml = metaBits.length ? '<div class="card-meta">' + metaBits.join(" · ") + "</div>" : "";

    card.innerHTML =
      '<div class="card-top">' +
      '<div class="card-icon">' +
      iconSvg(tool.icon) +
      "</div>" +
      badgeHtml(tool) +
      "</div>" +
      '<h3 class="card-title">' +
      esc(tool.name) +
      "</h3>" +
      '<p class="card-desc">' +
      withHighlight(tool.description, tool.highlight) +
      "</p>" +
      authNoteHtml +
      '<div class="card-actions">' +
      actionsHtml +
      "</div>";

    // botões de detalhes (acessíveis por teclado) e link "Abrir" não repassam o clique ao card
    card.querySelectorAll('[data-action="details"]').forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        openModal(tool, btn);
      });
    });
    var openLink = card.querySelector("a.card-open");
    if (openLink) {
      openLink.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }

    // clicar no resto do card (mouse/toque) também abre os detalhes
    card.addEventListener("click", function () {
      openModal(tool, card.querySelector('[data-action="details"]'));
    });

    attachTilt(card);

    return card;
  }

  // marca/desmarca um botão de filtro (visual + leitor de tela)
  function setPressed(btn, on) {
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function renderChips() {
    var container = document.getElementById("category-chips");
    var categories = getCategories();
    var html = '<button type="button" class="chip active" data-category="all" aria-pressed="true">Todas</button>';
    categories.forEach(function (c) {
      html += '<button type="button" class="chip" aria-pressed="false" data-category="' + esc(c) + '">' + esc(c) + "</button>";
    });
    container.innerHTML = html;

    container.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.category = chip.getAttribute("data-category");
        container.querySelectorAll(".chip").forEach(function (c) {
          setPressed(c, c === chip);
        });
        renderGrid();
      });
    });
  }

  function renderGrid() {
    var grid = document.getElementById("grid");
    var emptyState = document.getElementById("empty-state");
    var list = getFilteredSortedTools();

    var animate = !hasRendered;
    hasRendered = true;

    grid.innerHTML = "";
    if (list.length === 0) {
      emptyState.classList.add("visible");
    } else {
      emptyState.classList.remove("visible");
      list.forEach(function (tool, index) {
        grid.appendChild(createCardElement(tool, index, animate));
      });
    }

    var status = document.getElementById("results-status");
    if (status) {
      status.textContent =
        list.length === 0
          ? "Nenhuma ferramenta encontrada."
          : list.length + (list.length === 1 ? " ferramenta encontrada." : " ferramentas encontradas.");
    }
  }

  function updateToolCount() {
    var el = document.getElementById("tool-count");
    var n = TOOLS.length;
    el.textContent = n + (n === 1 ? " ferramenta" : " ferramentas");
  }

  /* ---------- modal: clicar em qualquer card abre este destaque ---------- */

  function modalActionArea(tool) {
    if (tool.status === "hosted") {
      var authNote = tool.hosted.authNote ? '<p class="note">' + esc(tool.hosted.authNote) + "</p>" : "";
      return (
        authNote +
        '<div class="modal-actions">' +
        '<a class="btn-outline" href="' +
        safeUrl(tool.hosted.url) +
        '" target="_blank" rel="noopener">Acessar' +
        iconSvg("external-link") +
        "</a>" +
        '<button type="button" class="btn-text-plain" data-action="close">Fechar</button>' +
        "</div>"
      );
    }

    var stepsHtml = tool.local.steps
      .map(function (s) {
        return "<li>" + esc(s) + "</li>";
      })
      .join("");

    var copyTarget = tool.local.command || tool.local.path;
    var copyLabel = tool.local.command ? "Copiar comando" : "Copiar caminho";

    var commandRow =
      '<div class="code-row">' +
      '<div class="code-block">' +
      esc(copyTarget) +
      "</div>" +
      '<button type="button" class="copy-btn" data-copy="' +
      esc(copyTarget) +
      '" aria-label="' +
      copyLabel +
      '">' +
      iconSvg("copy") +
      "</button>" +
      "</div>";

    return (
      '<p class="note">' +
      esc(tool.local.reason) +
      "</p>" +
      '<ol class="modal-steps">' +
      stepsHtml +
      "</ol>" +
      commandRow +
      '<div class="best-effort">' +
      "<p>Se já estiver rodando: " +
      '<a href="' +
      safeUrl(tool.local.bestEffortUrl) +
      '" target="_blank" rel="noopener">abrir agora</a></p>' +
      '<p class="note">Só funciona se o servidor já estiver aberto na sua máquina — se der erro de conexão, é só iniciar pelos passos acima.</p>' +
      "</div>"
    );
  }

  function modalContent(tool) {
    var b = badgeInfo(tool);
    var metaBits = [];
    if (tool.version) metaBits.push("Versão " + esc(tool.version));
    var metaHtml = metaBits.length ? '<span class="modal-meta">' + metaBits.join(" · ") + "</span>" : "";

    return (
      '<div class="modal-category">' +
      esc(tool.category) +
      "</div>" +
      '<h2 class="modal-title" id="modal-title">' +
      esc(tool.name) +
      "</h2>" +
      '<p class="modal-desc">' +
      withHighlight(tool.description, tool.highlight) +
      "</p>" +
      '<div class="modal-divider"></div>' +
      '<div class="modal-meta-row">' +
      metaHtml +
      '<span class="badge-pill ' +
      b.cls +
      '">' +
      b.html +
      "</span>" +
      "</div>" +
      modalActionArea(tool)
    );
  }

  // enquanto o modal está aberto, o resto da página fica "inerte" (sem foco/leitura)
  function setPageInert(on) {
    document.querySelectorAll(".site-header, .toolbar, main, .site-footer").forEach(function (el) {
      if (on) el.setAttribute("inert", "");
      else el.removeAttribute("inert");
    });
  }

  function openModal(tool, triggerEl) {
    lastFocusedEl = triggerEl || document.activeElement;

    var overlay = document.getElementById("modal-overlay");
    var iconEl = document.getElementById("modal-icon");
    var bodyEl = document.getElementById("modal-body");

    iconEl.innerHTML = iconSvg(tool.icon);
    bodyEl.innerHTML = modalContent(tool);

    bodyEl.querySelectorAll("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        copyToClipboard(btn.getAttribute("data-copy"), btn);
      });
    });

    var closeLink = bodyEl.querySelector('[data-action="close"]');
    if (closeLink) closeLink.addEventListener("click", closeModal);

    overlay.classList.add("visible");
    setPageInert(true);
    document.body.style.overflow = "hidden";
    document.getElementById("modal-close").focus();
  }

  function closeModal() {
    var overlay = document.getElementById("modal-overlay");
    if (!overlay.classList.contains("visible")) return;
    overlay.classList.remove("visible");
    setPageInert(false);
    document.body.style.overflow = "";
    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
      lastFocusedEl.focus();
    }
  }

  function fallbackCopy(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(textarea);
    return ok;
  }

  function copyToClipboard(text, buttonEl) {
    function flash(ok) {
      buttonEl.classList.add(ok ? "copied" : "failed");
      buttonEl.innerHTML = iconSvg(ok ? "check" : "x");
      buttonEl.setAttribute("title", ok ? "Copiado" : "Não foi possível copiar — selecione o texto e use Ctrl+C");
      setTimeout(function () {
        buttonEl.classList.remove("copied", "failed");
        buttonEl.innerHTML = iconSvg("copy");
        buttonEl.removeAttribute("title");
      }, 1800);
    }

    function viaFallback() {
      var ok = fallbackCopy(text);
      buttonEl.focus();
      flash(ok);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        flash(true);
      }, viaFallback);
    } else {
      viaFallback();
    }
  }

  function trapFocus(e) {
    var overlay = document.getElementById("modal-overlay");
    if (!overlay.classList.contains("visible")) return;

    if (e.key === "Escape") {
      closeModal();
      return;
    }

    if (e.key !== "Tab") return;

    var focusable = overlay.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function updateStatusIndicator() {
    var container = document.getElementById("status-toggle");
    var indicator = document.getElementById("status-indicator");
    var activeBtn = container.querySelector("button.active");
    if (!activeBtn) return;
    indicator.style.width = activeBtn.offsetWidth + "px";
    indicator.style.transform = "translateX(" + activeBtn.offsetLeft + "px)";
  }

  function clearFilters() {
    window.clearTimeout(searchTimer);
    state.search = "";
    state.category = "all";
    state.status = "all";

    document.getElementById("search-input").value = "";
    document.querySelectorAll("#category-chips .chip").forEach(function (c) {
      setPressed(c, c.getAttribute("data-category") === "all");
    });
    document.querySelectorAll("#status-toggle button").forEach(function (b) {
      setPressed(b, b.getAttribute("data-status") === "all");
    });
    updateStatusIndicator();

    renderGrid();
  }

  function initBackgroundSpotlight() {
    if (!prefersFineHover) return;
    var el = document.getElementById("bg-spotlight");
    if (!el) return;
    window.addEventListener("mousemove", function (e) {
      el.style.setProperty("--bx", e.clientX + "px");
      el.style.setProperty("--by", e.clientY + "px");
      el.classList.add("active");
    });
  }

  /* ---------- temas ---------- */

  function currentTheme() {
    var t = document.documentElement.getAttribute("data-theme");
    return THEMES.indexOf(t) !== -1 ? t : "constelacao";
  }

  function applyTheme(theme, persist) {
    if (THEMES.indexOf(theme) === -1) theme = "constelacao";
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-theme-choice") === theme ? "true" : "false");
    });
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (e) {
        /* armazenamento indisponível: o tema vale só nesta visita */
      }
    }
    // avisa o campo de estrelas (liga/desliga e muda a cor conforme o tema)
    window.dispatchEvent(new Event("painel-theme-change"));
  }

  function initThemePicker() {
    applyTheme(currentTheme(), false);
    document.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyTheme(btn.getAttribute("data-theme-choice"), true);
      });
    });
  }

  function init() {
    updateToolCount();
    renderChips();
    renderGrid();
    updateStatusIndicator();
    initBackgroundSpotlight();

    window.addEventListener("resize", updateStatusIndicator);
    // a fonte Inter pode chegar depois: remede o indicador quando ela carregar
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateStatusIndicator);
    initThemePicker();

    document.getElementById("search-input").addEventListener("input", function (e) {
      var value = e.target.value;
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        state.search = value;
        renderGrid();
      }, 150);
    });

    document.getElementById("status-toggle").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-status]");
      if (!btn) return;
      state.status = btn.getAttribute("data-status");
      this.querySelectorAll("button").forEach(function (b) {
        setPressed(b, b === btn);
      });
      updateStatusIndicator();
      renderGrid();
    });

    document.getElementById("sort-select").addEventListener("change", function (e) {
      state.sort = e.target.value;
      renderGrid();
    });

    document.getElementById("clear-filters").addEventListener("click", clearFilters);

    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-overlay").addEventListener("click", function (e) {
      if (e.target === this) closeModal();
    });
    document.addEventListener("keydown", trapFocus);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
