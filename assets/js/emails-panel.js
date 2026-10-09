/* Login do admin (Firebase Auth) + painel lateral "E-mails do DP" (Firestore).
   Tudo que vem do e-mail é inserido com textContent (conteúdo não confiável). */
(function () {
  "use strict";

  if (typeof PAINEL_FIREBASE_CONFIG === "undefined") return;

  var SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  var CATS = [
    { id: "desligamentos", label: "Desligamentos" },
    { id: "vale-transporte", label: "Vale Transporte" }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var adminLink = $("admin-link");
  var auth = null;
  var db = null;
  var unsubscribe = null;
  var sdkReady = false;
  var lastFocused = null;
  var panel = null; // referências da UI do painel
  var state = { cat: "desligamentos", query: "", items: [], loaded: false, error: "" };

  /* ---------- carga do SDK (depois do load, sem travar a pintura) ---------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("falha ao carregar " + src)); };
      document.head.appendChild(s);
    });
  }

  function loadSdk() {
    return loadScript(SDK + "firebase-app-compat.js").then(function () {
      return Promise.all([
        loadScript(SDK + "firebase-auth-compat.js"),
        loadScript(SDK + "firebase-firestore-compat.js")
      ]);
    });
  }

  function start() {
    loadSdk().then(initFirebase).catch(function () {
      /* offline / file://: o botão Admin continua sendo um link normal */
    });
  }
  if (document.readyState === "complete") setTimeout(start, 0);
  else window.addEventListener("load", function () { setTimeout(start, 0); });

  function initFirebase() {
    if (!window.firebase) return;
    firebase.initializeApp(PAINEL_FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    sdkReady = true;
    adminLink.setAttribute("href", "#");
    adminLink.setAttribute("role", "button");
    adminLink.setAttribute("aria-haspopup", "dialog");
    adminLink.addEventListener("click", function (e) {
      e.preventDefault();
      openLogin(adminLink);
    });
    $("admin-logout").addEventListener("click", function () { auth.signOut(); });
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .catch(function () {})
      .then(function () { auth.onAuthStateChanged(onAuth); });
  }

  /* ---------- cabeçalho conforme o estado de login ---------- */
  function onAuth(user) {
    var logged = !!user;
    adminLink.hidden = logged;
    $("admin-manage").hidden = !logged;
    $("admin-logout").hidden = !logged;
    var u = $("admin-user");
    u.hidden = !logged;
    if (logged) {
      u.textContent = user.email || "";
      u.title = user.email || "";
    }
    if (logged && user.email === PAINEL_ADMIN_EMAIL) {
      closeLogin(true);
      showPanel();
    } else {
      hidePanel();
      if (logged) closeLogin(true);
    }
  }

  /* ---------- modal de login ---------- */
  var overlay = $("login-overlay");
  var form = $("login-form");
  var errEl = $("login-error");

  function setInert(on) {
    var sel = ".site-header, .toolbar, main, .site-footer, #emails-panel, #emails-toggle, #modal-overlay";
    document.querySelectorAll(sel).forEach(function (el) {
      if (on) el.setAttribute("inert", "");
      else el.removeAttribute("inert");
    });
  }

  function openLogin(trigger) {
    lastFocused = trigger || document.activeElement;
    errEl.textContent = "";
    overlay.classList.add("visible");
    setInert(true);
    document.body.style.overflow = "hidden";
    $("login-email").focus();
  }

  function closeLogin(silent) {
    if (!overlay.classList.contains("visible")) return;
    overlay.classList.remove("visible");
    setInert(false);
    document.body.style.overflow = "";
    form.reset();
    errEl.textContent = "";
    if (!silent && lastFocused && lastFocused.focus && !lastFocused.hidden) lastFocused.focus();
  }

  $("login-close").addEventListener("click", function () { closeLogin(); });
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeLogin(); });
  document.addEventListener("keydown", function (e) {
    if (!overlay.classList.contains("visible")) return;
    if (e.key === "Escape") { closeLogin(); return; }
    if (e.key !== "Tab") return;
    var f = overlay.querySelectorAll("button:not([disabled]), input");
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function loginMessage(err) {
    switch (err && err.code) {
      case "auth/wrong-password":
      case "auth/invalid-credential":
      case "auth/user-not-found":
        return "E-mail ou senha incorretos.";
      case "auth/invalid-email":
        return "Informe um e-mail válido.";
      case "auth/too-many-requests":
        return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
      case "auth/network-request-failed":
        return "Sem conexão. Verifique a internet e tente de novo.";
      case "auth/unauthorized-domain":
        return "Este endereço não está autorizado no Firebase (Domínios autorizados).";
      case "auth/user-disabled":
        return "Esta conta está desativada.";
      default:
        return "Não foi possível entrar. Tente novamente.";
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!sdkReady) return;
    var email = $("login-email").value.trim();
    var pass = $("login-password").value;
    if (!email || !pass) {
      errEl.textContent = "Preencha e-mail e senha.";
      return;
    }
    var btn = $("login-submit");
    btn.disabled = true;
    errEl.textContent = "";
    auth.signInWithEmailAndPassword(email, pass).then(function () {
      btn.disabled = false;
    }, function (err) {
      btn.disabled = false;
      errEl.textContent = loginMessage(err);
      $("login-password").focus();
    });
  });

  /* ---------- painel lateral ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildPanel() {
    if (panel) return;
    var aside = el("aside", "emails-panel");
    aside.id = "emails-panel";
    aside.setAttribute("aria-label", "E-mails do DP");
    aside.hidden = true;

    var head = el("div", "emails-head");
    head.appendChild(el("h2", "emails-title", "E-mails do DP"));
    var closeBtn = el("button", "modal-close emails-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Recolher painel de e-mails");
    closeBtn.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
    head.appendChild(closeBtn);

    var tabs = el("div", "emails-tabs");
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Categoria de e-mails");
    var tabBtns = {};
    CATS.forEach(function (c) {
      var b = el("button", "chip");
      b.type = "button";
      b.setAttribute("aria-pressed", String(c.id === state.cat));
      if (c.id === state.cat) b.classList.add("active");
      var lab = el("span", null, c.label);
      var cnt = el("span", "emails-count", "0");
      b.appendChild(lab);
      b.appendChild(cnt);
      b.addEventListener("click", function () {
        state.cat = c.id;
        render();
      });
      tabs.appendChild(b);
      tabBtns[c.id] = { btn: b, count: cnt, label: c.label };
    });

    var search = el("input", "emails-search");
    search.type = "search";
    search.placeholder = "Buscar nos e-mails…";
    search.setAttribute("aria-label", "Buscar nos e-mails");
    search.addEventListener("input", function () {
      state.query = search.value;
      render();
    });

    var status = el("p", "emails-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    var list = el("ul", "emails-list");
    list.id = "emails-list";

    aside.appendChild(head);
    aside.appendChild(tabs);
    aside.appendChild(search);
    aside.appendChild(status);
    aside.appendChild(list);
    document.body.appendChild(aside);

    var toggle = el("button", "emails-toggle", "E-mails");
    toggle.id = "emails-toggle";
    toggle.type = "button";
    toggle.hidden = true;
    toggle.setAttribute("aria-controls", "emails-panel");
    toggle.setAttribute("aria-expanded", "false");
    document.body.appendChild(toggle);

    toggle.addEventListener("click", function () { setOpen(true, true); });
    closeBtn.addEventListener("click", function () { setOpen(false, true); });

    panel = { aside: aside, toggle: toggle, tabs: tabBtns, list: list, status: status, search: search };
  }

  function setOpen(open, moveFocus) {
    panel.aside.hidden = !open;
    panel.toggle.hidden = open;
    panel.toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("emails-open", open);
    try { localStorage.setItem("painelDpEmailsOpen", open ? "1" : "0"); } catch (e) {}
    if (moveFocus) (open ? panel.search : panel.toggle).focus();
  }

  function showPanel() {
    buildPanel();
    var open = true;
    try {
      var saved = localStorage.getItem("painelDpEmailsOpen");
      if (saved === "0" || (saved === null && window.innerWidth < 900)) open = false;
    } catch (e) {}
    setOpen(open, false);
    startListening();
  }

  function hidePanel() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    state.items = [];
    state.loaded = false;
    state.error = "";
    if (!panel) return;
    panel.aside.hidden = true;
    panel.toggle.hidden = true;
    document.body.classList.remove("emails-open");
  }

  function startListening() {
    if (unsubscribe) unsubscribe();
    state.loaded = false;
    state.error = "";
    render();
    unsubscribe = db.collection("emails").orderBy("data", "desc").limit(200).onSnapshot(
      function (snap) {
        state.items = snap.docs.map(function (d) { return d.data(); });
        state.loaded = true;
        state.error = "";
        render();
      },
      function (err) {
        state.loaded = true;
        state.error = err && err.code === "permission-denied"
          ? "Sem permissão. Confirme se as regras do Firestore foram publicadas."
          : "Não foi possível carregar os e-mails. Verifique a conexão e tente de novo.";
        render();
      }
    );
  }

  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function fmtDate(ts) {
    var d = ts && typeof ts.toDate === "function" ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d || isNaN(d)) return "";
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase();
  }

  function render() {
    if (!panel) return;
    CATS.forEach(function (c) {
      var n = state.items.filter(function (i) { return i.categoria === c.id; }).length;
      var t = panel.tabs[c.id];
      t.count.textContent = String(n);
      var on = c.id === state.cat;
      t.btn.classList.toggle("active", on);
      t.btn.setAttribute("aria-pressed", String(on));
    });

    var q = norm(state.query).trim();
    var items = state.items.filter(function (i) {
      if (i.categoria !== state.cat) return false;
      if (!q) return true;
      return [i.assunto, i.de, i.para, i.trecho, (i.anexos || []).join(" ")]
        .some(function (v) { return norm(v).indexOf(q) !== -1; });
    });

    var list = panel.list;
    list.textContent = "";

    if (state.error) { panel.status.textContent = state.error; panel.status.className = "emails-status is-error"; return; }
    panel.status.className = "emails-status";
    if (!state.loaded) { panel.status.textContent = "Carregando e-mails…"; return; }
    if (!items.length) {
      panel.status.textContent = q ? "Nenhum e-mail encontrado para a busca." : "Nenhum e-mail nesta categoria ainda.";
      return;
    }
    panel.status.textContent = items.length + (items.length === 1 ? " e-mail" : " e-mails");

    items.forEach(function (it, idx) {
      var li = el("li", "email-item");
      var bodyId = "email-body-" + idx;
      var b = el("button", "email-head");
      b.type = "button";
      b.setAttribute("aria-expanded", "false");
      b.setAttribute("aria-controls", bodyId);
      b.appendChild(el("span", "email-date", fmtDate(it.data)));
      b.appendChild(el("strong", "email-subject", it.assunto || "(sem assunto)"));
      b.appendChild(el("span", "email-from", it.de || ""));

      var body = el("div", "email-body");
      body.id = bodyId;
      body.hidden = true;
      if (it.para) body.appendChild(el("p", "email-meta", "Para: " + it.para));
      if (it.pasta) body.appendChild(el("p", "email-meta", "Pasta: " + it.pasta));
      body.appendChild(el("div", "email-snippet", it.trecho || "(sem prévia)"));
      if (it.anexos && it.anexos.length) {
        body.appendChild(el("p", "email-meta", "Anexos:"));
        var ul = el("ul", "email-attach");
        it.anexos.forEach(function (a) { ul.appendChild(el("li", null, String(a))); });
        body.appendChild(ul);
      }
      b.addEventListener("click", function () {
        var open = b.getAttribute("aria-expanded") === "true";
        b.setAttribute("aria-expanded", String(!open));
        body.hidden = open;
      });
      li.appendChild(b);
      li.appendChild(body);
      list.appendChild(li);
    });
  }

  /* gancho de teste local (só em localhost; não toca em dados reais) */
  var h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1") {
    window.__painelEmailsDebugRender = function (docs) {
      buildPanel();
      state.items = docs || [];
      state.loaded = true;
      state.error = "";
      setOpen(true, false);
      render();
    };
    window.__painelEmailsDebugError = function (msg) {
      buildPanel();
      state.loaded = true;
      state.error = msg || "Sem permissão. Confirme se as regras do Firestore foram publicadas.";
      setOpen(true, false);
      render();
    };
  }
})();
