(function () {
  "use strict";

  var canvas = document.getElementById("starfield");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stars = [];
  var W = 0;
  var H = 0;
  var DPR = 1;
  var rafId = null;
  var resizeTimer = null;
  var enabled = true; // o tema atual usa estrelas? (variável CSS --starfield)
  var starRgb = "146, 197, 253";

  // lê do tema atual: se desenha estrelas e com qual cor
  function readTheme() {
    var cs = window.getComputedStyle(document.documentElement);
    enabled = cs.getPropertyValue("--starfield").trim() !== "0";
    starRgb = cs.getPropertyValue("--star-rgb").trim() || "146, 197, 253";
  }

  function seed() {
    var count = Math.round((W * H) / 9000);
    count = Math.max(40, Math.min(count, 160));
    stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.3 + 0.4,
        baseAlpha: Math.random() * 0.5 + 0.25,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.4 + 0.15,
        drift: Math.random() * 0.06 + 0.01,
      });
    }
  }

  function resize() {
    var newW = window.innerWidth;
    var newH = window.innerHeight;
    var widthChanged = Math.abs(newW - W) > 40;
    var oldH = H;

    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = newW;
    H = newH;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    if (!stars.length || widthChanged) {
      seed(); // só refaz as estrelas se a largura mudou de verdade
    } else if (oldH && oldH !== H) {
      // só a altura mudou (ex.: barra do navegador no celular): reaproveita as estrelas
      for (var i = 0; i < stars.length; i++) stars[i].y = (stars[i].y / oldH) * H;
    }

    // redimensionar limpa o canvas: redesenha já (essencial com movimento reduzido)
    if (enabled) drawFrame(performance.now());
  }

  function drawFrame(t) {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var twinkle = reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 0.001 * s.speed + s.phase);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + starRgb + ", " + (s.baseAlpha * twinkle).toFixed(3) + ")";
      ctx.fill();
      if (!reduced) {
        s.y -= s.drift;
        if (s.y < 0) s.y = H;
      }
    }
  }

  function loop(t) {
    rafId = null;
    if (!enabled || document.hidden) return;
    drawFrame(t);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (reduced || !enabled || document.hidden || rafId !== null) return;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // aplica o tema atual: liga/desliga o canvas e atualiza a cor
  function applyTheme() {
    readTheme();
    if (!enabled) {
      stop();
      ctx.clearRect(0, 0, W, H);
      canvas.style.display = "none";
      return;
    }
    canvas.style.display = "";
    resize();
    start();
  }

  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      if (enabled) resize();
    }, 150);
  });

  // economiza bateria/CPU: pausa a animação em aba escondida
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });

  window.addEventListener("painel-theme-change", applyTheme);

  applyTheme();
})();
