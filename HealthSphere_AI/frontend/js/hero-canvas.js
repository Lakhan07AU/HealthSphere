/* ---------- Living health-graph canvas (nodes + links, mouse-reactive) ---------- */
(function () {
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init(canvas) {
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx || reduced) { canvas.style.display = 'none'; return; }

    let W = 0, H = 0, nodes = [], raf = null, mouse = null, running = true;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth || canvas.parentElement?.clientWidth || 300;
      H = canvas.clientHeight || canvas.parentElement?.clientHeight || 200;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      const n = Math.max(16, Math.min(46, Math.round(W * H / 15000)));
      nodes = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - .5) * .24,
        vy: (Math.random() - .5) * .24,
        r: Math.random() * 1.7 + 1.1
      }));
    }

    function step() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      const LINK = Math.min(135, Math.max(90, W / 9));

      for (const p of nodes) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -12) p.x = W + 12; else if (p.x > W + 12) p.x = -12;
        if (p.y < -12) p.y = H + 12; else if (p.y > H + 12) p.y = -12;
        if (mouse) {
          const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
          if (d < 130 && d > 0.001) { p.x += (dx / d) * .3; p.y += (dy / d) * .3; }
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(125,219,204,${((1 - d / LINK) * .34).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const p of nodes) {
        ctx.fillStyle = 'rgba(163,233,220,.85)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      }
      raf = requestAnimationFrame(step);
    }

    const host = canvas.parentElement || canvas;
    canvas.__onMove = e => {
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.__onLeave = () => { mouse = null; };
    canvas.__onVis = () => {
      running = !document.hidden && !reduced;
      if (running) step(); else cancelAnimationFrame(raf);
    };

    host.addEventListener('pointermove', canvas.__onMove);
    host.addEventListener('pointerleave', canvas.__onLeave);
    document.addEventListener('visibilitychange', canvas.__onVis);
    window.addEventListener('resize', resize);

    resize(); step();
  }

  window.HealthGraph = {
    mount(root) {
      (root || document).querySelectorAll('canvas[data-graph]').forEach(c => {
        if (!c.__mounted) { c.__mounted = true; init(c); }
      });
    }
  };
})();
