/* ---------- Lifestyle hub + Reminders ---------- */

VIEWS.lifestyle = async function (container) {
  const d = await api('/api/lifestyle');
  const wi = d.weeklyInsight;
  const act = d.plans.activity, nut = d.plans.nutrition;

  container.innerHTML = `
    <div class="topbar"><div><h1>Lifestyle Hub</h1>
      <div class="page-sub">Exercise, nutrition, sleep and hydration — personalized plans that adapt to your health graph.</div></div>
      <button class="btn secondary" id="regen">Regenerate plans</button></div>

    <div class="grid g2 mb">
      <div class="card">
        <h2>This week vs last week</h2>
        ${wi.hasData ? `
          ${wi.insights.map(i => `
            <div class="spread" style="padding:7px 0;border-bottom:1px dashed var(--line)">
              <b style="font-size:13.5px">${esc(i.area)}</b>
              <span class="${i.good ? 'flag-normal' : 'flag-borderline'}">${esc(i.text)}</span></div>`).join('')}
          <div class="mt" style="font-size:13.5px;background:var(--primary-soft);border-radius:8px;padding:10px 12px">
            <b>Recommendation.</b> ${esc(wi.recommendation)}</div>`
          : '<div class="empty">Start logging below — insights appear after a week of data.</div>'}
        <div class="row mt divider" style="gap:8px">
          <form id="log-ex" class="row" style="gap:6px"><input name="value" type="number" min="0" placeholder="Exercise (min)" style="width:130px"><button class="btn sm">Log</button></form>
          <form id="log-sl" class="row" style="gap:6px"><input name="value" type="number" step="0.5" min="0" placeholder="Sleep (h)" style="width:110px"><button class="btn sm">Log</button></form>
          <form id="log-hy" class="row" style="gap:6px"><input name="value" type="number" step="0.1" min="0" placeholder="Water (L)" style="width:110px"><button class="btn sm">Log</button></form>
          <select id="log-mood" style="width:auto"><option value="">Mood check-in…</option><option value="1">1 — Very low</option><option value="2">2 — Low</option><option value="3">3 — Neutral</option><option value="4">4 — Good</option><option value="5">5 — Very good</option></select>
        </div>
      </div>

      <div class="card">
        <h2><span>Activity plan</span>&nbsp;&nbsp;${act ? `<span class="chip neutral">${esc(act.goal)}</span>` : ''}</h2>
        ${act ? `
          <div class="page-sub">Target ~${act.weeklyTargetMinutes} min/week · generated ${fmtDateUI(act.generatedAt)}</div>
          ${act.weeks.map(w => `
            <details ${w.week === 1 ? 'open' : ''} class="mb" style="border-bottom:1px dashed var(--line);padding-bottom:8px">
              <summary style="cursor:pointer;font-weight:600;font-size:13.5px">Week ${w.week} — ${esc(w.focus)}</summary>
              ${w.items.map(it => `<div class="spread" style="padding:4px 14px;font-size:13.5px"><span>${esc(it.name)}</span><span class="chip ok">${esc(it.detail)}</span></div>`).join('')}
            </details>`).join('')}
          <div class="disclaimer">${act.safetyNotes.map(esc).join('<br>')}</div>`
          : '<div class="empty">No plan yet — set your profile and goals, then regenerate.</div>'}
      </div>
    </div>

    <div class="card mb">
      <div class="spread mb">
        <h2 style="display:flex;align-items:center;gap:8px">Nutrition plan
          ${nut ? `<span class="chip info">${esc(nut.preference)}${nut.estimatedDailyCalories ? ` · ~${nut.estimatedDailyCalories} kcal/day target` : ''}</span>` : ''}
          ${nut?.editedByUser ? '<span class="chip ok" style="font-size:10px">Customized</span>' : ''}
        </h2>
        <div class="row" style="gap:8px">
          ${nut ? `
            <button class="btn sm secondary" id="export-pdf">📄 Export PDF</button>
            <button class="btn sm secondary" id="export-json">💾 Export JSON</button>
            <button class="btn sm" id="regen-nutrition">🔄 Regenerate</button>
          ` : ''}
        </div>
      </div>
      ${nut ? `
        <div class="row mb" style="gap:8px;flex-wrap:wrap">
          <span class="chip neutral">Hydration target: ${esc(nut.hydrationTarget)}</span>
          <span class="chip neutral">Goal: ${esc(nut.goal)}${nut.tdeeEstimate ? ` · TDEE est. ${nut.tdeeEstimate} kcal` : ''}</span>
        </div>
        <div style="overflow-x:auto">
        <table class="tbl" id="nutrition-table"><thead><tr>
          <th style="width:60px">Day</th>
          <th>Breakfast <button class="btn-icon" data-slot-filter="breakfast" title="Filter breakfast options">🔄</button></th>
          <th>Lunch <button class="btn-icon" data-slot-filter="lunch" title="Filter lunch options">🔄</button></th>
          <th>Dinner <button class="btn-icon" data-slot-filter="dinner" title="Filter dinner options">🔄</button></th>
          <th>Snacks</th>
        </tr></thead>
        <tbody>${nut.weekPlan.map((day, di) => `
          <tr>
            <td><b>${esc(day.day)}</b>
              <div style="margin-top:4px"><button class="btn-icon sm" data-regen-day="${di}" title="Regenerate this day">🔄</button></div>
            </td>
            <td class="meal-cell" data-day="${di}" data-slot="breakfast">${mealCell(day.breakfast, di, 'breakfast')}</td>
            <td class="meal-cell" data-day="${di}" data-slot="lunch">${mealCell(day.lunch, di, 'lunch')}</td>
            <td class="meal-cell" data-day="${di}" data-slot="dinner">${mealCell(day.dinner, di, 'dinner')}</td>
            <td class="meal-cell" data-day="${di}" data-slot="snacks" style="color:var(--ink-soft);font-size:12.5px">
              <span class="meal-text">${esc(day.snacks)}</span>
              <button class="btn-icon sm meal-edit-btn" data-day="${di}" data-slot="snacks" title="Edit">✏️</button>
            </td>
          </tr>`).join('')}</tbody></table>
        </div>
        <div class="disclaimer mt">${nut.notes.map(esc).join('<br>')}
          ${nut.lastEditedAt ? `<br><small>Last customized: ${new Date(nut.lastEditedAt).toLocaleString()}</small>` : ''}
        </div>`
        : '<div class="empty">No nutrition plan yet. Set your profile and goals, then regenerate.</div>'}
    </div>`;

  function mealCell(meal, dayIndex, slot) {
    if (slot === 'snacks') {
      return `<span class="meal-text">${esc(meal)}</span>
        <button class="btn-icon sm meal-edit-btn" data-day="${dayIndex}" data-slot="snacks" title="Edit">✏️</button>`;
    }
    const [name, kcal] = Array.isArray(meal) ? meal : [meal, ''];
    return `<span class="meal-text">${esc(name)}<br><small class="tl-detail">${esc(kcal || '')}</small></span>
      <div class="meal-actions">
        <button class="btn-icon sm meal-edit-btn" data-day="${dayIndex}" data-slot="${slot}" title="Edit this meal">✏️</button>
        <button class="btn-icon sm meal-swap-btn" data-day="${dayIndex}" data-slot="${slot}" title="Swap with alternative">🔄</button>
      </div>`;
  }

  /* ---- Logging forms ---- */
  const logTypes = { 'log-ex': 'exercise_minutes', 'log-sl': 'sleep_hours', 'log-hy': 'hydration_liters' };
  for (const [id, type] of Object.entries(logTypes)) {
    container.querySelector('#' + id).onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/api/lifestyle/logs', { method: 'POST', body: { type, value: Number(fd.get('value')) } });
        toast('Logged.'); VIEWS.lifestyle(container);
      } catch (err) { toast(err.message, 'err'); }
    };
  }
  container.querySelector('#log-mood').onchange = async e => {
    if (!e.target.value) return;
    await api('/api/lifestyle/logs', { method: 'POST', body: { type: 'mood_score', value: Number(e.target.value) } });
    toast('Check-in recorded.'); VIEWS.lifestyle(container);
  };
  container.querySelector('#regen').onclick = async () => {
    await api('/api/lifestyle/regenerate', { method: 'POST' });
    toast('Plans regenerated from your latest data.'); VIEWS.lifestyle(container);
  };
  if (container.querySelector('#regen-nutrition')) {
    container.querySelector('#regen-nutrition').onclick = async () => {
      await api('/api/lifestyle/regenerate', { method: 'POST' });
      toast('Nutrition plan regenerated.'); VIEWS.lifestyle(container);
    };
  }

  /* ---- Meal edit buttons ---- */
  container.querySelectorAll('.meal-edit-btn').forEach(btn => {
    btn.onclick = () => openEditMealModal(Number(btn.dataset.day), btn.dataset.slot, nut);
  });

  /* ---- Meal swap buttons ---- */
  container.querySelectorAll('.meal-swap-btn').forEach(btn => {
    btn.onclick = () => openSwapMealModal(Number(btn.dataset.day), btn.dataset.slot, nut);
  });

  /* ---- Regenerate single day ---- */
  container.querySelectorAll('[data-regen-day]').forEach(btn => {
    btn.onclick = async () => {
      const dayIndex = Number(btn.dataset.regenDay);
      btn.disabled = true;
      try {
        await api('/api/lifestyle/nutrition/regenerate-day', { method: 'POST', body: { dayIndex } });
        toast('Day regenerated.'); VIEWS.lifestyle(container);
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
    };
  });

  /* ---- PDF Export ---- */
  if (container.querySelector('#export-pdf')) {
    container.querySelector('#export-pdf').onclick = () => exportNutritionPDF(nut);
  }

  /* ---- JSON Export ---- */
  if (container.querySelector('#export-json')) {
    container.querySelector('#export-json').onclick = () => {
      const blob = new Blob([JSON.stringify(nut, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'nutrition-plan.json';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('JSON exported.');
    };
  }
};

/* =================== EDIT MEAL MODAL =================== */
function openEditMealModal(dayIndex, slot, nut) {
  const day = nut.weekPlan[dayIndex];
  const current = slot === 'snacks' ? day.snacks : (Array.isArray(day[slot]) ? day[slot][0] : day[slot] || '');
  const currentKcal = slot === 'snacks' ? '' : (Array.isArray(day[slot]) ? day[slot][1] : '');

  const m = openModal(`
    <h2>Edit ${day.day} — ${slot.charAt(0).toUpperCase() + slot.slice(1)}</h2>
    <p class="page-sub mb">Customize this meal to your preference.</p>
    <label>Meal name</label>
    <input id="edit-meal-name" value="${esc(current)}" placeholder="e.g. Oats with berries">
    ${slot !== 'snacks' ? `
      <div class="mt"></div>
      <label>Approx. calories</label>
      <input id="edit-meal-kcal" value="${esc(currentKcal)}" placeholder="e.g. ~350 kcal">
    ` : ''}
    <div class="row mt" style="justify-content:flex-end">
      <button class="btn secondary" id="edit-cancel">Cancel</button>
      <button class="btn" id="edit-save">Save</button>
    </div>
  `, { wide: true });

  m.el.querySelector('#edit-cancel').onclick = () => m.close();
  m.el.querySelector('#edit-save').onclick = async () => {
    const name = m.el.querySelector('#edit-meal-name').value.trim();
    const kcal = slot !== 'snacks' ? (m.el.querySelector('#edit-meal-kcal')?.value || '').trim() : '';
    if (!name) { toast('Meal name is required.', 'err'); return; }
    try {
      await api('/api/lifestyle/nutrition/edit', {
        method: 'POST', body: { dayIndex, slot, name, kcal }
      });
      toast('Meal updated.');
      m.close();
      VIEWS.lifestyle(document.getElementById('app'));
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* =================== SWAP MEAL MODAL =================== */
async function openSwapMealModal(dayIndex, slot, nut) {
  const day = nut.weekPlan[dayIndex];
  const currentName = Array.isArray(day[slot]) ? day[slot][0] : day[slot] || '';
  let alts = [];
  try {
    const r = await api(`/api/lifestyle/nutrition/alternatives?slot=${slot}&dayIndex=${dayIndex}`);
    alts = r.alternatives || [];
  } catch (e) { toast('Could not load alternatives.', 'err'); return; }

  if (alts.length === 0) { toast('No alternatives available.', 'err'); return; }

  const m = openModal(`
    <h2>Swap ${day.day} — ${slot.charAt(0).toUpperCase() + slot.slice(1)}</h2>
    <p class="page-sub mb">Current: <b>${esc(currentName)}</b> — choose a replacement:</p>
    <div id="swap-options" style="max-height:350px;overflow-y:auto">
      ${alts.map((a, i) => `
        <div class="swap-option" data-index="${i}" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all .15s">
          <div>
            <b style="font-size:13.5px">${esc(a.name)}</b>
            <span style="font-size:12px;color:var(--ink-soft);margin-left:6px">${esc(a.kcal)}</span>
          </div>
          <span style="font-size:18px;color:var(--primary)">→</span>
        </div>
      `).join('')}
    </div>
    <div class="row mt" style="justify-content:flex-end">
      <button class="btn secondary" id="swap-cancel">Cancel</button>
    </div>
  `, { wide: true });

  m.el.querySelector('#swap-cancel').onclick = () => m.close();
  m.el.querySelectorAll('.swap-option').forEach(opt => {
    opt.onmouseenter = () => { opt.style.borderColor = 'var(--primary)'; opt.style.background = 'var(--primary-soft, #f0fdf4)'; };
    opt.onmouseleave = () => { opt.style.borderColor = 'var(--line)'; opt.style.background = ''; };
    opt.onclick = async () => {
      const withIndex = alts[Number(opt.dataset.index)]._poolIndex ?? Number(opt.dataset.index);
      try {
        await api('/api/lifestyle/nutrition/swap', {
          method: 'POST', body: { dayIndex, slot, withIndex }
        });
        toast('Meal swapped!');
        m.close();
        VIEWS.lifestyle(document.getElementById('app'));
      } catch (e) { toast(e.message, 'err'); }
    };
  });
}

function loadScriptOnce(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.async = false;
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
async function ensurePdfLibs() {
  let ns = window.jspdf || window.jsPDF || window.jspPDF;
  if (ns && typeof (ns.jsPDF || ns) === 'function') return ns;
  toast('Loading PDF library...', '');
  try { await loadScriptOnce('/js/jspdf.umd.min.js'); } catch {}
  try { await loadScriptOnce('/js/jspdf.plugin.autotable.min.js'); } catch {}
  ns = window.jspdf || window.jsPDF || window.jspPDF;
  if (!ns) {
    try { await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js'); } catch {}
    try { await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js'); } catch {}
    ns = window.jspdf || window.jsPDF || window.jspPDF;
  }
  return ns;
}
/* =================== PDF EXPORT =================== */
async function exportNutritionPDF(nut) {
  try {
  let ns = window.jspdf || window.jsPDF || window.jspPDF;
  if (!ns || typeof (ns.jsPDF || ns) !== 'function') ns = await ensurePdfLibs();
  if (!ns) {
    toast('PDF library failed to load. Disable ad-blocker and refresh.', 'err');
    console.error('jsPDF global missing. window keys:', Object.keys(window).filter(k=>/pdf/i.test(k)));
    return;
  }
  const jsPDF = ns.jsPDF || ns.default?.jsPDF || ns;
  if (typeof jsPDF !== 'function') {
    toast('PDF library failed to initialize.', 'err');
    console.error('jsPDF constructor not found in', ns);
    return;
  }
  const doc = new jsPDF('p', 'mm', 'a4');
  const hasDocAutoTable = typeof doc.autoTable === 'function';
  const hasNsAutoTable = typeof (ns.autoTable || window.autoTable) === 'function';
  if (!hasDocAutoTable && !hasNsAutoTable) {
    console.warn('autoTable plugin not detected - table will be rendered manually');
  }

  // Header
  doc.setFontSize(20);
  doc.setTextColor(14, 110, 100);
  doc.text('HealthSphere AI', 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text('Personalized Nutrition Plan', 14, 25);

  // Meta info
  doc.setFontSize(10);
  doc.setTextColor(60);
  const prefLabel = nut.preference ? nut.preference.charAt(0).toUpperCase() + nut.preference.slice(1) : 'General';
  const lines = [
    `Diet preference: ${prefLabel}`,
    nut.estimatedDailyCalories ? `Daily calorie target: ~${nut.estimatedDailyCalories} kcal` : '',
    nut.tdeeEstimate ? `TDEE estimate: ${nut.tdeeEstimate} kcal` : '',
    `Goal: ${nut.goal || 'maintain'}`,
    `Hydration target: ${nut.hydrationTarget || '2-2.5 L/day'}`,
    nut.editedByUser ? 'Status: Customized by user' : 'Status: AI-generated'
  ].filter(Boolean);
  let y = 31;
  for (const line of lines) { doc.text(line, 14, y); y += 5; }
  y += 2;

  // Meal plan table
  const headers = [['Day', 'Breakfast', 'Lunch', 'Dinner', 'Snacks']];
  const rows = nut.weekPlan.map(d => [
    d.day,
    Array.isArray(d.breakfast) ? `${d.breakfast[0]} (${d.breakfast[1] || ''})` : d.breakfast || '',
    Array.isArray(d.lunch) ? `${d.lunch[0]} (${d.lunch[1] || ''})` : d.lunch || '',
    Array.isArray(d.dinner) ? `${d.dinner[0]} (${d.dinner[1] || ''})` : d.dinner || '',
    d.snacks || ''
  ]);

  const tableOpts = {
    startY: y,
    head: headers,
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [14, 110, 100], textColor: 255, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: 40 },
    columnStyles: {
      0: { cellWidth: 18, fontStyle: 'bold' },
      4: { cellWidth: 35, textColor: [120, 120, 120] }
    },
    margin: { left: 14, right: 14 },
    didDrawPage: function (data) {
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text(
        'HealthSphere AI - AI-generated nutrition ideas are educational, not medical nutrition therapy.',
        14, doc.internal.pageSize.height - 8
      );
    }
  };
  if (typeof doc.autoTable === 'function') {
    doc.autoTable(tableOpts);
  } else if (typeof ns.autoTable === 'function') {
    ns.autoTable(doc, tableOpts);
  } else if (typeof window.autoTable === 'function') {
    window.autoTable(doc, tableOpts);
  } else {
    // Fallback manual table if plugin missing
    let ty = y + 6;
    doc.setFontSize(9); doc.setTextColor(255);
    doc.setFillColor(14,110,100); doc.rect(14, ty-5, 182, 7, 'F');
    doc.text(headers[0].join(' | '), 15, ty);
    ty += 8; doc.setTextColor(40); doc.setFontSize(8);
    rows.forEach(r => { if (ty > 280) { doc.addPage(); ty = 15; } doc.text(r.join(' | ').slice(0,110), 14, ty); ty += 5; });
    doc.lastAutoTable = { finalY: ty };
  }

  y = (doc.lastAutoTable?.finalY || y + 60) + 8;

  // Notes section
  if (nut.notes && nut.notes.length > 0) {
    doc.setFontSize(10);
    doc.setTextColor(14, 110, 100);
    doc.text('Important Notes', 14, y);
    y += 6;
    doc.setFontSize(8.5);
    doc.setTextColor(80);
    for (const note of nut.notes) {
      const lines = doc.splitTextToSize(`• ${note}`, 175);
      for (const line of lines) {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.text(line, 14, y);
        y += 4;
      }
    }
  }

  // Portion guide
  y += 4;
  if (y > 265) { doc.addPage(); y = 20; }
  doc.setFontSize(9);
  doc.setTextColor(14, 110, 100);
  doc.text('Plate guide: ½ vegetables · ¼ protein · ¼ whole grains', 14, y);
  y += 5;
  doc.setFontSize(7.5);
  doc.setTextColor(160);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} by HealthSphere AI`, 14, y);

  doc.save('HealthSphere-Nutrition-Plan.pdf');
  toast('PDF exported successfully!');
  } catch (e) {
    console.error('PDF export failed', e);
    toast('PDF export failed: ' + (e.message || e), 'err');
  }
}
