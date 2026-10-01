/* ---------- UI helpers, charts, modal, toast ---------- */

window.VIEWS = window.VIEWS || {};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'err' ? ' err' : '');
  t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

function openModal(html, opts = {}) {
  const root = document.getElementById('modal-root');
  const prevFocus = document.activeElement;
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(opts.label || 'Dialog')}" style="${opts.wide ? 'max-width:860px' : ''}">${html}</div>`;
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const box = back.querySelector('.modal');
    const focusables = [...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.getClientRects().length);
    if (!focusables.length) { e.preventDefault(); return; }
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  back.addEventListener('click', e => { if (e.target === back && !opts.sticky) close(); });
  back.addEventListener('keydown', onKey);
  root.appendChild(back);
  function close() {
    back.remove();
    if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch { /* noop */ } }
  }
  setTimeout(() => {
    const box = back.querySelector('.modal');
    const target = box.querySelector('input, textarea, select, button');
    if (target) target.focus();
  }, 30);
  return { el: back, close };
}

function confirmDlg(title, msg, confirmLabel = 'Confirm') {
  return new Promise(resolve => {
    const m = openModal(`
      <h2>${esc(title)}</h2>
      <p class="page-sub">${esc(msg)}</p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn secondary" id="cd-no">Cancel</button>
        <button class="btn danger" id="cd-yes">${esc(confirmLabel)}</button>
      </div>`);
    m.el.querySelector('#cd-no').onclick = () => { m.close(); resolve(false); };
    m.el.querySelector('#cd-yes').onclick = () => { m.close(); resolve(true); };
  });
}

/* ---- SVG line chart with reference band ---- */
function lineChart({ points, unit = '', refLow = null, refHigh = null, height = 190, width = 560 }) {
  if (!points || points.length === 0) return '<div class="empty">No data yet</div>';
  const W = width, H = height, padL = 46, padR = 14, padT = 16, padB = 30;
  const xs = points.map(p => new Date(p.date + 'T00:00:00Z').getTime());
  const ys = points.map(p => p.value);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (refLow != null) lo = Math.min(lo, refLow);
  if (refHigh != null) hi = Math.max(hi, refHigh);
  const spanY = (hi - lo) || Math.abs(hi) * 0.2 || 1;
  lo -= spanY * 0.15; hi += spanY * 0.15;
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const x = t => xMax === xMin ? W / 2 : padL + (t - xMin) / (xMax - xMin) * (W - padL - padR);
  const y = v => padT + (hi - v) / (hi - lo) * (H - padT - padB);

  let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;min-width:min(430px,100%)">`;
  // ref band
  if (refLow != null && refHigh != null && refHigh < 1e6) {
    svg += `<rect x="${padL}" y="${y(refHigh)}" width="${W - padL - padR}" height="${y(refLow) - y(refHigh)}" fill="#16a394" opacity="0.08"/>`;
    svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(refHigh)}" y2="${y(refHigh)}" stroke="#16a394" stroke-dasharray="4 3" opacity=".5"/>`;
    svg += `<text class="chart-tip" x="${padL+4}" y="${y(refHigh)-4}">usual max ${refHigh}</text>`;
  }
  // gridlines + labels
  for (let i = 0; i <= 3; i++) {
    const v = lo + (hi - lo) * i / 3;
    svg += `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" opacity=".55"/>`;
    svg += `<text class="chart-tip" x="${padL-7}" y="${y(v)+4}" text-anchor="end">${fmtNum(v)}</text>`;
  }
  // area + line
  const pts = points.map((p, i) => `${x(xs[i])},${y(p.value)}`).join(' ');
  svg += `<polygon class="chart-area" points="${padL},${H-padB} ${pts} ${x(xs.at(-1))},${H-padB}" fill="url(#cg)" opacity=".35"/>
          <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12958a"/><stop offset="1" stop-color="#12958a00"/></linearGradient></defs>`;
  svg += `<polyline class="chart-line" pathLength="1" points="${pts}" fill="none" stroke="#0e6e64" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  for (let i = 0; i < points.length; i++) {
    svg += `<circle class="chart-dot" style="animation-delay:${(0.25 + i * 0.09).toFixed(2)}s" cx="${x(xs[i])}" cy="${y(points[i].value)}" r="4.5" fill="#fff" stroke="#0e6e64" stroke-width="2"><title>${esc(points[i].date)}: ${points[i].value}${unit ? ' ' + unit : ''}</title></circle>`;
  }
  svg += `<text class="chart-tip" x="${padL}" y="${H-8}">${esc(shortDate(points[0].date))}</text>`;
  svg += `<text class="chart-tip" x="${W-padR}" y="${H-8}" text-anchor="end">${esc(shortDate(points.at(-1).date))}</text>`;
  svg += '</svg>';
  return svg;
}
function fmtNum(v) { return v >= 10000 ? (v / 1000) + 'k' : Math.round(v * 100) / 100; }
function shortDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function sparkline(values, w = 120, h = 34, color) {
  if (!values.length) return '';
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = (hi - lo) || 1;
  const X = i => (i / (values.length - 1 || 1) * (w - 6) + 3).toFixed(1);
  const Y = v => (h - 4 - (v - lo) / span * (h - 10)).toFixed(1);
  const pts = values.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  const c = color || '#0057B8';
  const gid = 'sg' + Math.random().toString(36).slice(2, 8);
  const lx = X(values.length - 1), ly = Y(values[values.length - 1]);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`
    + `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="${c}" stop-opacity=".26"/><stop offset="1" stop-color="${c}" stop-opacity="0"/>`
    + `</linearGradient></defs>`
    + `<polygon points="3,${h - 1} ${pts} ${w - 3},${h - 1}" fill="url(#${gid})"/>`
    + `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<circle cx="${lx}" cy="${ly}" r="3.2" fill="${c}" stroke="#fff" stroke-width="1.5"/></svg>`;
}

/* count-up animation for stat numbers */
function animateNum(el, target, dur = 950) {
  if (!Number.isFinite(target)) { el.textContent = target ?? ''; return; }
  const start = performance.now();
  function frame(t) {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* pointer-tracking 3d perspective tilt + glare */
function makeTilt(el, max = 6) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.classList.add('tilt');
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - .5;
    const py = (e.clientY - r.top) / r.height - .5;
    el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-2px)`;
    el.style.setProperty('--gx', ((px + .5) * 100).toFixed(1) + '%');
    el.style.setProperty('--gy', ((py + .5) * 100).toFixed(1) + '%');
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
}

window.TREND_ICON = { increasing: 'Rising', decreasing: 'Falling', stable: 'Stable', no_data: '' };

function fmtDateUI(iso) {
  if (!iso) return '—';
  const d = iso.length > 10 ? new Date(iso) : new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function sevBadge(sev) {
  return {
    attention: '<span class="pill pill-critical"><span class="pill-dot" aria-hidden="true"></span>Needs attention</span>',
    watch: '<span class="pill pill-warning"><span class="pill-dot" aria-hidden="true"></span>Watch</span>',
    info: '<span class="pill pill-info"><span class="pill-dot" aria-hidden="true"></span>FYI</span>',
  }[sev] || '';
}

function flagChip(flag) {
  if (!flag) return '';
  return {
    high: '<span class="pill pill-critical"><span class="pill-dot" aria-hidden="true"></span>High</span>',
    low: '<span class="pill pill-warning"><span class="pill-dot" aria-hidden="true"></span>Low</span>',
    borderline: '<span class="pill pill-warning"><span class="pill-dot" aria-hidden="true"></span>Borderline</span>',
    normal: '<span class="pill pill-normal"><span class="pill-dot" aria-hidden="true"></span>Normal</span>',
  }[flag] || '';
}

function trendBadge(direction) {
  const map = {
    increasing: ['trend-up', '▲ Rising'],
    decreasing: ['trend-down', '▼ Falling'],
    stable: ['trend-flat', '● Stable'],
  }[direction];
  if (!map) return '';
  return `<span class="trend-badge ${map[0]}">${map[1]}</span>`;
}

/* ---------- Illustrated empty states ---------- */
function emptyArt(ic = 'sparkles', tint = '') {
  return `<div class="empty-art" ${tint ? `style="${tint}"` : ''}>
    ${window.icon ? window.icon(ic, 34) : ''}
    <span class="empty-orb o1"></span><span class="empty-orb o2"></span>
  </div>`;
}

function emptyState(title, sub = '', opts = {}) {
  const { icon: ic = 'sparkles', action = '', tint = '' } = opts;
  return `<div class="empty empty-illu">${emptyArt(ic, tint)}
    <b>${esc(title)}</b>
    ${sub ? `<p>${sub}</p>` : ''}
    ${action ? `<div class="mt">${action}</div>` : ''}
  </div>`;
}
