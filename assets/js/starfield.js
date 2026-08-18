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
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seed();
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var twinkle = reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 0.001 * s.speed + s.phase);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(146, 197, 253, " + (s.baseAlpha * twinkle).toFixed(3) + ")";
      ctx.fill();
      if (!reduced) {
        s.y -= s.drift;
        if (s.y < 0) s.y = H;
      }
    }
    if (!reduced) rafId = requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  resize();

  if (reduced) {
    draw(0);
  } else {
    rafId = requestAnimationFrame(draw);
  }
})();
