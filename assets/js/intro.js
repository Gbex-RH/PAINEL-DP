(function () {
  "use strict";

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function alreadyShownToday() {
    try {
      return localStorage.getItem("painelDpIntroDate") === todayKey();
    } catch (e) {
      return true;
    }
  }

  function markShownToday() {
    try {
      localStorage.setItem("painelDpIntroDate", todayKey());
    } catch (e) {
      /* armazenamento indisponível: só não repete a lógica, sem quebrar nada */
    }
  }

  function removeOverlay(overlay) {
    setPageInert(false);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // enquanto a abertura cobre a tela, o conteúdo por trás não recebe foco nem leitura
  function setPageInert(on) {
    var els = document.querySelectorAll(".site-header, .toolbar, main, .site-footer");
    for (var i = 0; i < els.length; i++) {
      if (on) els[i].setAttribute("inert", "");
      else els[i].removeAttribute("inert");
    }
  }

  // espera a logo carregar (com limite de tempo) para medir tamanhos corretos
  function whenImageReady(img, timeoutMs, cb) {
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      cb();
    }
    if (!img || (img.complete && img.naturalWidth > 0)) {
      finish();
      return;
    }
    img.addEventListener("load", finish);
    img.addEventListener("error", finish);
    window.setTimeout(finish, timeoutMs);
  }

  function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
  }

  function runIntro(overlay, mover, tilt, stage) {
    var moverRect = mover.getBoundingClientRect();
    var stageRect = stage.getBoundingClientRect();

    if (!stageRect.width || !moverRect.width) {
      // sem medidas válidas: não anima e NÃO marca o dia (tenta de novo na próxima visita)
      removeOverlay(overlay);
      return;
    }

    var scale = stageRect.width / moverRect.width;
    var dx = stageRect.left + stageRect.width / 2 - (moverRect.left + moverRect.width / 2);
    var dy = stageRect.top + stageRect.height / 2 - (moverRect.top + moverRect.height / 2);

    mover.style.position = "fixed";
    mover.style.left = moverRect.left + "px";
    mover.style.top = moverRect.top + "px";
    mover.style.width = moverRect.width + "px";
    mover.style.height = moverRect.height + "px";
    mover.style.margin = "0";
    mover.style.zIndex = "9999";
    mover.style.transformOrigin = "50% 50%";
    mover.style.transform = "translate(" + dx + "px," + dy + "px) scale(" + scale + ")";
    mover.classList.add("intro-mover-active");

    var settled = false;

    function toResting() {
      if (settled) return;
      settled = true;

      overlay.classList.add("intro-fading");
      mover.style.transition = "transform 0.7s cubic-bezier(0.65,0,0.35,1)";
      mover.style.transform = "translate(0,0) scale(1)";

      window.setTimeout(cleanup, 780);
    }

    function cleanup() {
      mover.style.position = "";
      mover.style.left = "";
      mover.style.top = "";
      mover.style.width = "";
      mover.style.height = "";
      mover.style.margin = "";
      mover.style.zIndex = "";
      mover.style.transform = "";
      mover.style.transition = "";
      mover.classList.remove("intro-mover-active", "intro-logo-visible");

      document.removeEventListener("keydown", onKeyDown);
      removeOverlay(overlay);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        toResting();
      } else if ((e.key === "Enter" || e.key === " ") && !isTypingTarget(e.target)) {
        toResting();
      }
    }

    overlay.addEventListener("click", toResting);
    document.addEventListener("keydown", onKeyDown);

    var skipBtn = document.getElementById("intro-skip");
    if (skipBtn) skipBtn.addEventListener("click", toResting);

    requestAnimationFrame(function () {
      mover.classList.add("intro-logo-visible");
      overlay.classList.add("intro-drawn");
      markShownToday(); // só marca o dia quando a animação realmente começou
    });

    window.setTimeout(toResting, 1500);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var overlay = document.getElementById("intro-overlay");
    if (!overlay) return;

    if (prefersReducedMotion() || alreadyShownToday()) {
      removeOverlay(overlay);
      return;
    }

    var mover = document.getElementById("nav-logo-mover");
    var tilt = document.getElementById("nav-logo-tilt");
    var stage = document.getElementById("intro-logo-stage");

    if (!mover || !tilt || !stage) {
      removeOverlay(overlay);
      return;
    }

    var img = mover.querySelector("img");
    setPageInert(true);
    whenImageReady(img, 2500, function () {
      runIntro(overlay, mover, tilt, stage);
    });
  });
})();
