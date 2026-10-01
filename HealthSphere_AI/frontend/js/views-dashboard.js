/* ---------- Dashboard ---------- */

VIEWS.dashboard = async function (container) {
  const d = await api('/api/overview');
  const wi = d.weeklyInsight;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

  const sev = d.signalSeverity || { attention: 0, watch: 0, info: 0 };
  const score = Math.max(8, Math.min(99, Math.round(100 - 15 * (sev.attention || 0) - 6 * (sev.watch || 0))));
  const scoreColor = score >= 85 ? '#177245' : score >= 65 ? '#B7791F' : '#C0392B';
  const scoreLabel = score >= 85 ? 'Steady' : score >= 65 ? 'Watch a few' : 'Needs care';
  const RING_C = (2 * Math.PI * 54).toFixed(1);

  container.innerHTML = `
    <section class="hero">
      <canvas class="hero-canvas" data-graph aria-hidden="true"></canvas>
      <div class="hero-inner">
        <div>
          <div class="hero-kicker">${today}</div>
          <h1>${greet}, ${esc(d.user.name.split(' ')[0])}</h1>
          <p class="hero-sub">Your connected health picture — signals, trends and next steps in one place. Every insight links back to its source record.</p>
          <div class="trust-strip">
            <span class="trust-pill"><i></i>Explainable signals</span>
            <span class="trust-pill"><i></i>Private to you</span>
            <span class="trust-pill"><i></i>Preventive-first</span>
          </div>
        </div>
        <div class="hero-side">
          <div class="score-ring" role="img" aria-label="Prevention score ${score} out of 100: ${scoreLabel}">
            <svg viewBox="0 0 130 130" width="132" height="132">
              <circle cx="65" cy="65" r="54" fill="none" stroke="#D8E4F2" stroke-width="11"/>
              <circle id="score-arc" cx="65" cy="65" r="54" fill="none" stroke="${scoreColor}" stroke-width="11"
                stroke-linecap="round" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"
                data-target="${(RING_C * (1 - score / 100)).toFixed(1)}" transform="rotate(-90 65 65)"/>
            </svg>
            <div class="score-center"><b data-count="${score}">0</b><span>${scoreLabel}</span></div>
          </div>
          <div class="score-cap">Prevention score · informational pattern summary, not a medical grade</div>
          <div class="hero-actions">
            <button class="btn" data-nav="#/reports">Upload Report</button>
            <button class="btn secondary" data-nav="#/profile">Add Health Data</button>
            <button class="btn danger-outline" data-nav="#/emergency">Emergency</button>
          </div>
        </div>
      </div>
      <div class="benefit-row">
        <div class="benefit"><b>Reports → structured data</b><span>Upload a lab PDF, get trends automatically.</span></div>
        <div class="benefit"><b>Family-aware signals</b><span>History + labs + lifestyle combined.</span></div>
        <div class="benefit"><b>Next best action</b><span>Screenings, reminders &amp; doctors to discuss.</span></div>
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><b data-count="${d.signalCount}">0</b><span>Health signals detected</span></div>
        <div class="hero-stat"><b data-count="${d.recentReports.length}">0</b><span>Reports processed</span></div>
        <div class="hero-stat"><b data-count="${d.upcomingReminders.length}">0</b><span>Upcoming reminders</span></div>
        <div class="hero-stat"><b data-count="${profileCompletion(d.profile)}">0</b><span>% profile complete</span></div>
      </div>
    </section>

    <div class="card mb">
      <div class="spread"><h2>Vitals at a glance</h2><a href="#/profile">Manage</a></div>
      <div class="vitals-grid">
        ${d.metricCards.map(mc => vitalTile(mc)).join('')}
      </div>
    </div>

    <div class="grid g2">
        <div class="card">
          <div class="spread"><h2>Risk signals &amp; preventive guidance</h2><a href="#/insights">All insights</a></div>
          ${(d.topSignals || []).map(s => `
            <div class="card sev-${s.severity}" style="box-shadow:none;margin-bottom:10px;padding:12px 14px">
              <div class="spread"><b style="font-size:13.5px">${esc(s.area)}</b>${sevBadge(s.severity)}</div>
              <div class="page-sub" style="margin:4px 0">${esc(s.action)}</div>
            </div>`).join('') || emptyState('All clear for now', 'No risk signals in your current records — keep tracking and we will flag changes early. No signals is good news.', { icon: 'shield-check' })}
          <div class="disclaimer">Signals are pattern observations from your records, not diagnoses.</div>
        </div>

        <div class="card">
          <div class="spread"><h2>Weekly lifestyle insight</h2><a href="#/lifestyle">Lifestyle hub</a></div>
          ${wi.hasData ? (wi.insights || []).map(i => `
            <div class="spread" style="padding:5px 0;border-bottom:1px dashed var(--line)">
              <span style="font-size:13px;font-weight:600">${esc(i.area)}</span>
              <span class="${i.good ? 'flag-normal' : 'flag-borderline'}" style="font-size:13px">${esc(i.text)}</span>
            </div>`).join('') + `<div class="page-sub mt" style="margin-bottom:0">${esc(wi.recommendation)}</div>`
            : emptyState('No lifestyle data yet', 'Log exercise, sleep, or hydration to unlock your weekly insight.', { icon: 'moon', action: '<a class="btn sm secondary" href="#/lifestyle">Open lifestyle hub</a>' })}
        </div>
    </div>

    <div class="grid g2 mt">
      <div class="card">
        <div class="spread"><h2>Recent reports</h2><a href="#/reports">All reports</a></div>
        ${d.recentReports.map(r => `
          <div class="tl-event" style="cursor:pointer" data-report="${r.id}">
            <div style="flex:1"><div class="tl-title">${esc(r.filename)}</div>
            <div class="tl-detail">${r.testCount} values extracted · uploaded ${fmtDateUI(r.uploadedAt)}</div></div>
            <span class="chip neutral">View</span>
          </div>`).join('') || emptyState('No reports yet', 'Upload your first lab report — values are extracted automatically and trended over time.', { icon: 'file-text', action: '<a class="btn sm" href="#/reports">Upload report</a>' })}
      </div>
      <div class="card">
        <div class="spread"><h2>Upcoming reminders</h2><a href="#/reminders">All reminders</a></div>
        ${d.upcomingReminders.map(r => `
          <div class="tl-event">
            <div><div class="tl-title">${esc(r.title)}</div>
            <div class="rem-due">Due ${fmtDateUI(r.dueDate)}</div></div>
          </div>`).join('') || emptyState('Nothing scheduled', 'Reminders for screenings, medication, and checkups will appear here.', { icon: 'bell' })}
        <div class="mt divider spread">
          <div><b style="font-size:13px">Family health signals</b>
          <div class="row mt" style="gap:6px">${(d.familySignals || []).map(f => `<span class="chip warn">${esc(f.cond)} ×${f.n}</span>`).join('') || '<span class="page-sub">Add family history for context-aware guidance</span>'}</div></div>
          <a href="#/family">Family tree</a>
        </div>
        ${(d.careTeam || []).length ? `<div class="divider"><b style="font-size:13px">Care team</b></div>` : ''}
        ${d.careTeam.map(doc => `<div class="tl-event">
          <div><div class="tl-title">${esc(doc.name)}</div><div class="tl-detail">${esc(doc.specialty || doc.role)}</div></div></div>`).join('')}
      </div>
    </div>`;

  container.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { location.hash = b.dataset.nav; });
  container.querySelectorAll('[data-count]').forEach(el => animateNum(el, +el.dataset.count));
  const arc = container.querySelector('#score-arc');
  if (arc) requestAnimationFrame(() => requestAnimationFrame(() => {
    arc.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.22,.61,.36,1)';
    arc.style.strokeDashoffset = arc.dataset.target;
  }));
  container.querySelectorAll('.card.hoverable').forEach(c => makeTilt(c, 6));
  if (window.HealthGraph) HealthGraph.mount(container);
  container.querySelectorAll('[data-report]').forEach(el => {
    el.onclick = () => { location.hash = '#/reports'; setTimeout(() => window.__openReport?.(el.dataset.report), 400); };
  });
};

function profileCompletion(p) {
  if (!p) return 0;
  const checks = [p.dob, p.sex, p.heightCm, p.weightKg, p.bloodGroup,
    Array.isArray(p.allergies) ? 'y' : '',
    p.conditions !== undefined ? 'y' : '', p.lifestyle?.activityLevel];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

const FLAG_COLORS = { high: '#C0392B', low: '#C0392B', borderline: '#C9930A', normal: '#0E7C6B' };

function vitalTile(mc) {
  const a = mc.analysis;
  if (!a || a.status === 'no_data') return `
    <div class="vital vital-empty">
      <div class="vital-top"><b>${esc(mc.label)}</b><span class="pill pill-neutral">No data</span></div>
      <div class="tl-detail">No readings yet — <a href="#/profile">add one</a></div>
    </div>`;
  const pts = (a.points || []).map(p => p.value);
  let delta = '';
  if (pts.length >= 2) {
    const prev = pts[pts.length - 2], last = pts[pts.length - 1];
    const pct = prev !== 0 ? ((last - prev) / Math.abs(prev)) * 100 : 0;
    const arrow = Math.abs(pct) < 0.05 ? '●' : pct > 0 ? '▲' : '▼';
    delta = `<span class="chip neutral">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
  }
  const flag = mc.lastFlag || null;
  return `
    <div class="vital">
      <div class="vital-top"><b>${esc(mc.label)}</b>${flag ? flagChip(flag) : ''}</div>
      <div class="vital-value">${a.last.value}<small> ${esc(a.unit || '')}</small></div>
      <div class="vital-sub"><span class="tl-detail">${esc(fmtDateUI(a.last.date))}</span>${delta}</div>
      <div class="vital-chart">${sparkline(pts, 150, 42, FLAG_COLORS[flag] || '#0057B8')}</div>
      <div class="vital-trend">${esc(TREND_ICON[a.direction] || a.direction || '')}${a.stale ? ' · check overdue' : ''}${a.anomaly ? ' · unusual jump' : ''}</div>
    </div>`;
}
