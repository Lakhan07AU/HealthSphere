/* ---------- Health views: Profile · Family · Reports · Timeline · Insights ---------- */

const METRIC_CHOICES = [
  ['weight_kg', 'Weight (kg)'], ['bp_systolic', 'Systolic BP (mmHg)'], ['bp_diastolic', 'Diastolic BP (mmHg)'],
  ['heart_rate', 'Heart rate (bpm)'], ['hba1c', 'HbA1c (%)'], ['glucose_fasting', 'Fasting glucose (mg/dL)'],
  ['total_cholesterol', 'Total cholesterol (mg/dL)'], ['ldl', 'LDL (mg/dL)'], ['hdl', 'HDL (mg/dL)'],
  ['triglycerides', 'Triglycerides (mg/dL)'], ['hemoglobin', 'Hemoglobin (g/dL)'], ['tsh', 'TSH (µIU/mL)'],
  ['vitamin_d', 'Vitamin D (ng/mL)'], ['vitamin_b12', 'Vitamin B12 (pg/mL)'], ['creatinine', 'Creatinine (mg/dL)']
];

/* ================= PROFILE ================= */
VIEWS.profile = async function (container) {
  const { user, profile } = await api('/api/me');
  const p = profile || {};
  container.innerHTML = `
    <div class="topbar"><div><h1>Personal Health Profile</h1>
      <div class="page-sub">Your central health record — every analysis on this platform learns from it.</div></div></div>

    <div class="grid g2">
      <form class="card" id="f-profile">
        <h2>Personal information</h2>
        <div class="grid g2">
          <div><label>Date of birth</label><input type="date" name="dob" value="${esc(p.dob || '')}"></div>
          <div><label>Sex</label><select name="sex">
            ${['male', 'female', 'other'].map(s => `<option value="${s}" ${p.sex === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
          </select></div>
          <div><label>Height (cm)</label><input type="number" step="0.1" name="heightCm" value="${esc(p.heightCm || '')}"></div>
          <div><label>Weight (kg)</label><input type="number" step="0.1" name="weightKg" value="${esc(p.weightKg || '')}"></div>
          <div><label>Blood group</label><select name="bloodGroup">${['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => `<option ${p.bloodGroup === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
          <div><label>Activity level</label><select name="activityLevel">
            ${[['sedentary', 'Sedentary'], ['light', 'Light'], ['moderate', 'Moderate'], ['active', 'Active']].map(([v, l]) => `<option value="${v}" ${p.lifestyle?.activityLevel === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        </div>
        <div class="mt"></div>
        <label>Allergies (comma-separated)</label>
        <input name="allergies" value="${esc((p.allergies || []).join(', '))}" placeholder="Penicillin, dust">
        <div class="mt"></div>
        <label>Existing conditions (comma-separated)</label>
        <input name="conditions" value="${esc((p.conditions || []).join(', '))}" placeholder="Prehypertension">
        <div class="mt"></div>
        <label>Medications</label>
        <input name="medications" value="${esc((p.medications || []).map(m => m.name || m).join(', '))}" placeholder="Current medicines">
        <div class="mt"></div>
        <label>Lifestyle</label>
        <div class="row" style="gap:8px">
          <select name="smoking" style="flex:1;min-width:110px">
            ${['never', 'former', 'current'].map(v => `<option value="${v}" ${p.lifestyle?.smoking === v ? 'selected' : ''}>Smoking: ${v}</option>`).join('')}
          </select>
          <select name="alcohol" style="flex:1;min-width:110px">
            ${['none', 'occasional', 'regular'].map(v => `<option value="${v}" ${p.lifestyle?.alcohol === v ? 'selected' : ''}>Alcohol: ${v}</option>`).join('')}
          </select>
          <input type="number" step="0.5" name="sleepHours" style="flex:1;min-width:120px" placeholder="Sleep h/night" value="${esc(p.lifestyle?.sleepHours || '')}">
        </div>
        <div class="mt"></div>
        <label>Diet preference &amp; goals</label>
        <div class="row" style="gap:8px">
          <select name="foodPreference" style="flex:1;min-width:130px">
            ${[['vegetarian', 'Vegetarian'], ['nonveg', 'Non-vegetarian'], ['vegan', 'Vegan']].map(([v, l]) => `<option value="${v}" ${(p.foodPreference || 'vegetarian') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <input name="goals" style="flex:1.4" placeholder="Goals (comma-separated)" value="${esc((p.goals || []).join(', '))}">
        </div>
        <button class="btn mt" type="submit">Save profile</button>
      </form>

      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <h2>Add a health measurement</h2>
          <form id="f-metric" class="row" style="gap:8px;align-items:flex-end">
            <div style="flex:1.4"><label>Metric</label><select name="key">${METRIC_CHOICES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
            <div style="width:90px"><label>Value</label><input name="value" type="number" step="any" required></div>
            <div style="flex:1"><label>Date</label><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
            <button class="btn sm" type="submit">Add</button>
          </form>
          <div class="disclaimer">Report-extracted values are added automatically when you upload documents. Add manual readings between visits to keep trends current.</div>
        </div>
        <div class="card" id="metrics-list-card"><h2>Your metrics timeline</h2><div id="metrics-list"><span class="spin"></span></div></div>
      </div>
    </div>`;

  container.querySelector('#f-profile').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/profile', {
        method: 'PUT',
        body: {
          dob: fd.get('dob'), sex: fd.get('sex'), heightCm: fd.get('heightCm'),
          weightKg: fd.get('weightKg') || undefined, bloodGroup: fd.get('bloodGroup'),
          allergies: fd.get('allergies'), conditions: fd.get('conditions'),
          medications: fd.get('medications'), goals: fd.get('goals'),
          foodPreference: fd.get('foodPreference'),
          lifestyle: { activityLevel: fd.get('activityLevel'), smoking: fd.get('smoking'), alcohol: fd.get('alcohol'), sleepHours: Number(fd.get('sleepHours')) || p.lifestyle?.sleepHours }
        }
      });
      toast('Profile saved — insights re-analyzed.');
      VIEWS.profile(container);
    } catch (err) { toast(err.message, 'err'); }
  };

  container.querySelector('#f-metric').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/metrics', { method: 'POST', body: Object.fromEntries(fd) });
      toast('Measurement recorded.');
      VIEWS.profile(container);
    } catch (err) { toast(err.message, 'err'); }
  };

  loadMetricsList(container.querySelector('#metrics-list'));
};

async function loadMetricsList(el) {
  const { metrics } = await api('/api/metrics');
  if (!metrics.length) { el.innerHTML = '<div class="empty">No measurements yet</div>'; return; }
  el.innerHTML = `<table class="tbl"><thead><tr><th>Metric</th><th>Value</th><th>Date</th><th>Source</th><th></th></tr></thead><tbody>
    ${metrics.slice(0, 25).map(m => `
      <tr><td>${esc(m.label || m.key)}</td>
      <td class="num-cell"><b>${m.value}</b> ${esc(m.unit || '')} ${flagChip(m.flag)}</td>
      <td>${fmtDateUI(m.date)}</td>
      <td><span class="chip neutral">${m.source && m.source.startsWith('report') ? 'report' : 'manual'}</span></td>
      <td>${m.source === 'manual' ? `<button class="btn sm secondary" data-del="${m.id}">Remove</button>` : ''}</td></tr>`).join('')}
  </tbody></table>`;
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    await api(`/api/metrics/${b.dataset.del}`, { method: 'DELETE' });
    b.closest('tr').remove(); toast('Removed');
  });
}

/* ================= FAMILY ================= */
const RELATIONS = ['Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Other'];
const GEN_OF = {
  Grandfather: 1, Grandmother: 1, Father: 2, Mother: 2, Uncle: 2, Aunt: 2,
  Brother: 3, Sister: 3, Son: 4, Daughter: 4, Other: 3
};

function initialsOf(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

VIEWS.family = async function (container) {
  const { members } = await api('/api/family');
  const selfName = App.user?.name || 'You';
  const selfInitials = initialsOf(selfName);

  /* ---- SVG node-graph tree: grandparent layer on top, You at center ---- */
  function renderGraph() {
    const W = 980, CX = W / 2;
    const LAYER_Y = { 1: 78, 2: 205, 3: 348, 4: 492 };
    const gens = { 1: [], 2: [], 3: [], 4: [] };
    for (const m of members) gens[GEN_OF[m.relation] || 3].push(m);

    const nodes = [];   // {id,x,y,m,gen}
    function lay(gen) {
      const ms = gens[gen];
      const spacing = Math.min(190, (W - 140) / Math.max(ms.length, 1));
      const startX = CX - spacing * (ms.length - 1) / 2;
      ms.forEach((m, i) => nodes.push({ id: m.id, x: startX + spacing * i, y: LAYER_Y[gen], m, gen }));
    }
    [1, 2, 4].forEach(lay);
    // Generation 3: siblings fanned around the center; You occupy the center itself
    const sibs = gens[3];
    const sibSpacing = Math.min(170, (W - 300) / Math.max(sibs.length, 1));
    sibs.forEach((m, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const rank = Math.floor(i / 2) + 1;
      const jitter = (i * 37) % 34 - 17;
      nodes.push({ id: m.id, x: CX + side * rank * sibSpacing, y: LAYER_Y[3] + jitter, m, gen: 3 });
    });
    const youNode = { id: 'you', x: CX, y: LAYER_Y[3], m: null, gen: 0 };
    nodes.push(youNode);

    /* edges */
    const edges = [];
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const gen2 = nodes.filter(n => n.gen === 2), gen1 = nodes.filter(n => n.gen === 1),
          gen3o = nodes.filter(n => n.gen === 3), gen4 = nodes.filter(n => n.gen === 4);
    for (const p of gen2) edges.push({ a: p, b: youNode, kind: 'solid' });
    for (const s of gen3o) edges.push({ a: s, b: youNode, kind: 'dash' });
    for (const c of gen4) edges.push({ a: youNode, b: c, kind: 'solid' });
    for (const g of gen1) {
      const near = gen2.slice().sort((u, v) => Math.abs(u.x - g.x) - Math.abs(v.x - g.x))[0] || youNode;
      edges.push({ a: g, b: near, kind: 'dash' });
    }
    const father = gen2.find(n => n.m.relation === 'Father'), mother = gen2.find(n => n.m.relation === 'Mother');
    if (father && mother) edges.push({ a: father, b: mother, kind: 'partner' });

    const path = (a, b) => {
      const my = (a.y + b.y) / 2;
      return `M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
    };
    const GEN_CLASS = { 1: 'gp', 2: 'par', 3: 'sib', 4: 'kid' };

    let svg = `<svg class="fam-graph" viewBox="0 0 ${W} 560" role="img" aria-label="Family health tree graph">`;
    svg += '<g class="fg-edges">' + edges.map(e =>
      `<path class="fg-edge fg-${e.kind}" d="${path(e.a, e.b)}"/>`).join('') + '</g>';
    svg += '<g class="fg-nodes">';
    for (const n of nodes) {
      const isYou = n.id === 'you';
      const name = isYou ? selfName : (n.m.name || n.m.relation);
      const sub = isYou ? 'You' : n.m.relation + (n.m.ageOrYear ? ` · ${n.m.ageOrYear}` : '');
      const conds = isYou ? '' : (n.m.conditions || []).slice(0, 2)
        .map(c => esc(c.name.length > 20 ? c.name.slice(0, 19) + '…' : c.name)).join(' · ');
      svg += `<g class="fg-node${isYou ? ' fg-you' : ''}" transform="translate(${n.x},${n.y})">
        <circle class="fg-halo" r="40"/>
        <circle class="fg-core fg-${isYou ? 'self' : GEN_CLASS[n.gen]}" r="27"/>
        <text class="fg-initials" text-anchor="middle" dy="5">${esc(initialsOf(name))}</text>
        <text class="fg-name" text-anchor="middle" y="48">${esc(name.length > 18 ? name.slice(0, 17) + '…' : name)}</text>
        <text class="fg-sub" text-anchor="middle" y="63">${esc(sub)}</text>
        ${conds ? `<text class="fg-cond" text-anchor="middle" y="78">${conds}</text>` : ''}
        ${isYou ? '' : `<g class="fg-del" data-delfam="${n.id}" transform="translate(22,-22)"><title>Remove member</title><circle r="11"/><text text-anchor="middle" dy="4">&times;</text></g>`}
      </g>`;
    }
    svg += '</g></svg>';
    return svg;
  }

  container.innerHTML = `
    <div class="topbar"><div><h1>Family Health History</h1>
      <div class="page-sub">Family context powers personalized preventive-care guidance.</div></div></div>

    <div class="card mb" id="tree">
      <div class="spread"><h2 style="padding-bottom:0;border-bottom:none;margin:0">Family health tree</h2>
        <div class="fg-legend">
          <span><i class="fg-dot gp"></i>Grandparents</span><span><i class="fg-dot par"></i>Parents</span>
          <span><i class="fg-dot sib"></i>You &amp; siblings</span><span><i class="fg-dot kid"></i>Children</span>
        </div></div>
      <div class="fg-hint">Hover the &times; on a node to remove that member · lines show lineage</div>
      <div class="fam-graph-wrap">${renderGraph()}</div>
      ${members.length ? '' : '<div class="empty" style="margin-top:8px">Add family members below — they will appear on the graph automatically</div>'}
    </div>

    <div class="card">
      <h2>Add family member</h2>
      <form id="f-fam">
        <div class="grid g4">
          <div><label>Name</label><input name="name" placeholder="Name"></div>
          <div><label>Relationship</label><select name="relation">${RELATIONS.map(r => `<option>${r}</option>`).join('')}</select></div>
          <div><label>Age / birth year</label><input name="ageOrYear" placeholder="e.g. 58 or 1968"></div>
          <div><label>Cancer history</label><select name="cancerHistory"><option value="">No</option><option value="1">Yes</option></select></div>
        </div>
        <div class="mt"></div>
        <label>Conditions — one per line as &ldquo;Condition @ diagnosis-age&rdquo; (age optional)</label>
        <textarea name="conditionsRaw" rows="3" placeholder="Type 2 Diabetes @62&#10;Hypertension @48"></textarea>
        <div class="grid g2 mt">
          <div><label>Surgeries / genetic conditions (comma-separated)</label><input name="geneticConditions" placeholder="Thalassemia trait"></div>
          <div><label>Notes</label><input name="notes" placeholder="Relevant health events"></div>
        </div>
        <button class="btn mt" type="submit">Add to family history</button>
      </form>
    </div>`;

  container.querySelectorAll('[data-delfam]').forEach(b => b.onclick = async () => {
    if (!(await confirmDlg('Remove member?', 'This removes this person and their conditions from your family history.', 'Remove'))) return;
    await api(`/api/family/${b.dataset.delfam}`, { method: 'DELETE' });
    toast('Family member removed'); VIEWS.family(container);
  });

  container.querySelector('#f-fam').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const conditions = String(fd.get('conditionsRaw') || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const at = l.split('@');
      return { name: at[0].trim(), diagAge: (at[1] || '').trim() };
    });
    try {
      await api('/api/family', { method: 'POST', body: {
        name: fd.get('name'), relation: fd.get('relation'), ageOrYear: fd.get('ageOrYear'),
        cancerHistory: !!fd.get('cancerHistory'), conditions,
        geneticConditions: fd.get('geneticConditions'), notes: fd.get('notes')
      }});
      toast('Family member added — guidance updated.'); VIEWS.family(container);
    } catch (err) { toast(err.message, 'err'); }
  };
};

/* ================= REPORTS ================= */
VIEWS.reports = async function (container) {
  const { reports } = await api('/api/reports');
  window.__openReport = id => openReportModal(id);

  container.innerHTML = `
    <div class="topbar"><div><h1>Medical Reports</h1>
      <div class="page-sub">Upload, validate, extract, structure, explain — values feed your trends automatically.</div></div></div>

    <div class="grid g2">
      <div class="card">
        <h2>Upload report</h2>
        <div class="dropzone" id="dz">
          <b>Drag and drop, or click to choose a file</b><br>
          <span style="font-size:12px">PDF (digital text layer), TXT · JPG/PNG via review flow · max 15 MB</span>
          <input type="file" id="fi" accept=".pdf,.txt,.png,.jpg,.jpeg" hidden>
        </div>
        <div id="pipeline-box" style="display:none">
          <ul class="pipeline" id="pipeline"></ul>
        </div>
      </div>

      <div class="card">
        <h2>Paste report text</h2>
        <p class="page-sub">For photos or scans without a text layer, paste the values here — the same extraction and explanation pipeline runs on them.</p>
        <textarea id="manual-text" rows="7" placeholder="Paste lab report text here, e.g.&#10;HbA1c : 6.0 %&#10;LDL : 131 mg/dL&#10;Blood Pressure : 138/88&#10;Report Date: 20 Aug 2026"></textarea>
        <button class="btn mt" id="btn-manual">Process pasted text</button>
      </div>
    </div>

    <div class="card mt">
      <h2>Your reports (${reports.length})</h2>
      ${reports.map(r => `
        <div class="tl-event" style="cursor:pointer" data-open="${r.id}">
          <div style="flex:1">
            <div class="tl-title">${esc(r.filename)}</div>
            <div class="tl-detail">Uploaded ${fmtDateUI(r.uploadedAt)}
              ${r.structured?.reportDate ? `· report dated ${fmtDateUI(r.structured.reportDate)}` : ''}
              ${r.structured?.labName ? `· ${esc(r.structured.labName)}` : ''}</div>
          </div>
          <span class="chip ${r.status === 'processed' ? 'ok' : 'bad'}">${r.status}</span>
          <span class="chip neutral">${r.structured?.tests?.length || 0} values</span>
        </div>`).join('') || '<div class="empty">No reports uploaded yet</div>'}
    </div>`;

  const dz = container.querySelector('#dz');
  const fi = container.querySelector('#fi');
  dz.onclick = () => fi.click();
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('drag'); };
  dz.ondragleave = () => dz.classList.remove('drag');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
  fi.onchange = () => fi.files[0] && handleFile(fi.files[0]);

  async function handleFile(file) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    await runPipeline({ filename: file.name, mime: file.type, dataBase64: btoa(binary) });
  }

  async function runPipeline(payload) {
    const box = container.querySelector('#pipeline-box');
    const ul = container.querySelector('#pipeline');
    box.style.display = 'block';
    ul.innerHTML = ['File validation', 'Document parsing', 'Safety pre-check', 'Medical entity extraction', 'Value normalization & reference ranges', 'Structured health data']
      .map(s => `<li data-st="${s}"><div class="mark"></div><div><div class="st">${s}</div><div class="sd">waiting</div></div></li>`).join('');
    const items = [...ul.querySelectorAll('li')];
    let k = 0;
    const ticker = setInterval(() => { if (k < items.length - 1) mark(k++, true); }, 350);
    function mark(i, spinning) {
      items[i].classList.add('on');
      items[i].querySelector('.mark').innerHTML = spinning ? '<span class="spin"></span>' : '';
    }
    try {
      const { report } = await api('/api/reports', { method: 'POST', body: payload });
      clearInterval(ticker);
      items.forEach(it => it.remove());
      for (const st of report.pipeline) {
        const li = document.createElement('li');
        li.className = 'on' + (st.status === 'error' ? ' err' : '');
        li.innerHTML = `<div class="mark">${st.status === 'error' ? '!' : ''}</div><div><div class="st">${esc(st.stage)}</div><div class="sd">${esc(st.detail)}</div></div>`;
        ul.appendChild(li);
      }
      toast('Report processed — values added to your health graph.');
      setTimeout(() => openReportModal(report.id), 500);
    } catch (err) {
      clearInterval(ticker); mark(items.length - 1, false);
      items.forEach((it, i) => { if (i > k) return; it.classList.add('on'); });
      toast(err.message, 'err');
    }
  }

  container.querySelector('#btn-manual').onclick = async () => {
    const text = container.querySelector('#manual-text').value;
    try {
      const { report } = await api('/api/reports/manual', { method: 'POST', body: { text } });
      toast('Text processed.'); openReportModal(report.id);
    } catch (err) { toast(err.message, 'err'); }
  };

  container.querySelectorAll('[data-open]').forEach(el => el.onclick = () => openReportModal(el.dataset.open));
};

async function openReportModal(id) {
  let data;
  try { data = await api(`/api/reports/${id}`); } catch (e) { return toast(e.message, 'err'); }
  const r = data.report;
  const m = openModal(`
    <div class="spread"><h2 style="margin:0">${esc(r.filename)}</h2>
      <div class="row">
        ${r.fileUrl ? `<a class="btn sm secondary" href="${r.fileUrl}" target="_blank">Open file</a>` : ''}
        <button class="btn sm danger-outline" id="rm-del">Delete report</button>
        <button class="btn sm secondary" id="rm-x">Close</button>
      </div></div>
    <p class="page-sub">${r.structured?.labName ? esc(r.structured.labName) + ' · ' : ''}${r.structured?.reportDate ? 'Report date: ' + fmtDateUI(r.structured.reportDate) : 'Date not detected'}</p>

    <div class="card" style="box-shadow:none;background:var(--primary-soft);border-color:#cde3df">
      <h3>AI summary&nbsp;&nbsp;<span class="chip info">informational — not a diagnosis</span></h3>
      <div style="font-size:13.5px;white-space:pre-wrap">${esc(r.summaryText || '')}</div>
    </div>

    <h3 class="mt">Extracted values</h3>
    ${r.structured?.tests?.length ? `
      <table class="tbl"><thead><tr><th>Test</th><th>Result</th><th>Reference band</th><th>Status</th><th>Trend in your graph</th></tr></thead>
      <tbody>${r.structured.tests.map(t => `
        <tr><td>${esc(t.name)}</td>
        <td class="num-cell"><b>${t.value}</b> ${esc(t.unit)}</td>
        <td class="num-cell">${t.refLow > 999999 ? 'no upper limit' : t.refLow + ' – ' + t.refHigh}</td>
        <td>${flagChip(t.flag)}</td>
        <td style="font-size:12.5px;color:var(--ink-soft)">${esc(data.trendNotes[t.key] || '—')}</td></tr>`).join('')}
      </tbody></table>`
      : '<div class="empty">No standard analytes were auto-detected. Use &ldquo;Paste report text&rdquo; to enter values manually.</div>'}

    ${(r.structured?.flags || []).includes('possible_prompt_injection_ignored')
      ? '<div class="disclaimer"><b>Security notice:</b> this document contained embedded instructions attempting to influence the AI. They were detected and ignored by the prompt-injection guard.</div>' : ''}
    <details class="mt"><summary style="cursor:pointer;font-weight:600;font-size:13px">View processing pipeline</summary>
      <ul class="pipeline">${r.pipeline.map(st => `<li class="on"><div class="mark">${st.status === 'error' ? '!' : ''}</div>
        <div><div class="st">${esc(st.stage)}</div><div class="sd">${esc(st.detail)}</div></div></li>`).join('')}</ul>
    </details>`, { wide: true });

  m.el.querySelector('#rm-x').onclick = m.close;
  m.el.querySelector('#rm-del').onclick = async () => {
    if (!(await confirmDlg('Delete report?', 'Extracted values already merged into trends will remain; only the report record is removed.', 'Delete'))) return;
    await api(`/api/reports/${id}`, { method: 'DELETE' });
    m.close(); toast('Report deleted');
    const c = document.getElementById('view'); VIEWS.reports(c);
  };
}

/* ================= TIMELINE ================= */
const TYPE_LABEL = {
  report: 'Reports', metric: 'Measurements', family: 'Family history',
  lifestyle: 'Lifestyle', reminder: 'Reminders', careteam: 'Care team'
};

VIEWS.timeline = async function (container) {
  const { events } = await api('/api/timeline');
  let filter = 'all';

  container.innerHTML = `
    <div class="topbar"><div><h1>Health Timeline</h1>
      <div class="page-sub">Every significant event in one connected story.</div></div></div>
    <div class="card">
      <div class="tabs" id="tl-tabs">
        <button class="tab" data-t="all">All events</button>
        ${Object.keys(TYPE_LABEL).filter(t => events.some(e => e.type === t)).map(t => `<button class="tab" data-t="${t}">${TYPE_LABEL[t]}</button>`).join('')}
      </div>
      <div id="tl-body"></div>
    </div>`;

  function render() {
    const list = filter === 'all' ? events : events.filter(e => e.type === filter);
    const groups = {};
    for (const ev of list) {
      const y = ev.date.slice(0, 4), mo = new Date(ev.date + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
      groups[y] ??= {};
      groups[y][mo] ??= [];
      groups[y][mo].push(ev);
    }
    document.getElementById('tl-body').innerHTML = Object.keys(groups).sort().reverse().map(y => `
      <div class="tl-group"><div class="tl-year">${y}</div>
      ${Object.keys(groups[y]).map(mo => `
        <div class="tl-month">${mo}</div>
        ${groups[y][mo].map(ev => `
          <div class="tl-event"><div class="tl-rail"><div class="tl-dot t-${ev.type}"></div></div>
            <div><div class="tl-title">${esc(ev.title)}</div>
            ${ev.detail ? `<div class="tl-detail">${esc(ev.detail)}</div>` : ''}
            <div class="tl-date">${fmtDateUI(ev.date)} · <span class="chip neutral" style="font-size:9.5px;padding:1px 5px">${esc(TYPE_LABEL[ev.type] || ev.type)}</span></div></div>
          </div>`).join('')}`).join('')}</div>`).join('') || '<div class="empty">No events match this filter</div>';
  }
  render();
  container.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    container.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active'); filter = t.dataset.t; render();
  });
  container.querySelector('.tab').classList.add('active');
};

/* ================= INSIGHTS ================= */
VIEWS.insights = async function (container) {
  const ins = await api('/api/insights');
  container.innerHTML = `
    <div class="topbar"><div><h1>Health Insights &amp; Preventive Care</h1>
      <div class="page-sub">Rules and longitudinal analysis over your whole health graph. Generated ${fmtDateUI(ins.generatedAt)}.</div></div></div>

    <div class="card sev-${ins.signals[0]?.severity || 'info'} mb" style="background:var(--primary-soft)">
      <h3>How to read this page</h3>
      <div style="font-size:13px">These are <b>risk signals</b> — patterns noticed across your records — paired with topics worth discussing with a healthcare professional.
      They are not diagnoses. Every card shows exactly <i>why</i> it appeared.</div>
    </div>

    <div class="grid g2">
      ${ins.signals.map(s => `
        <div class="card sev-${s.severity}">
          <div class="spread"><b>${esc(s.area)}</b>${sevBadge(s.severity)}</div>
          <div class="mt" style="font-size:13px">${esc(s.action)}</div>
          <details class="mt">
            <summary style="cursor:pointer;font-size:12.5px;font-weight:600;color:var(--primary-dark)">Why am I seeing this? (${s.factors.length} factors)</summary>
            <div style="margin-top:8px;font-size:13px">
              ${s.factors.map(f => `<div style="padding:3px 0">&ndash;&nbsp; ${esc(f)}</div>`).join('')}
              <div class="tl-detail mt">Data considered: ${esc(s.dataConsidered)}</div>
            </div>
          </details>
        </div>`).join('') || '<div class="card empty">No signals yet — add profile, family history and reports to unlock insights.</div>'}
    </div>

    <div class="card mt">
      <h2>Specialties that may be relevant to discuss</h2>
      ${ins.specialists.map(sp => `
        <div class="tl-event">
          <div style="flex:1"><div class="tl-title">${esc(sp.specialty)} <span class="chip neutral">${esc(sp.confidence)}</span></div>
          <div class="tl-detail">${esc(sp.why)}</div></div></div>`).join('') || '<div class="empty">Specialist suggestions appear once risk signals exist</div>'}
      <div class="disclaimer">Suggestions describe relevance of specialties for discussion — never a medical requirement or referral.</div>
    </div>

    <div class="card mt">
      <h2>Preventive screening discussion checklist</h2>
      <table class="tbl"><thead><tr><th>Potential topic</th><th>Why it appears for you</th><th>Recommended review</th></tr></thead>
      <tbody>${ins.screening.map(sc => `
        <tr><td><b>${esc(sc.topic)}</b></td><td style="color:var(--ink-soft)">${esc(sc.reason)}</td><td style="font-size:12.5px">${esc(sc.recommendedReview)}</td></tr>`).join('')}
      </tbody></table>
    </div>

    ${ins.disclaimers.map(d => `<div class="disclaimer">${esc(d)}</div>`).join('')}
  `;
};
