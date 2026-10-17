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
const PARENT_REL = ['Father', 'Mother'];
const CHILD_REL = ['Son', 'Daughter'];
const SIB_REL = ['Brother', 'Sister'];

function initialsOf(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

VIEWS.family = async function (container) {
  const { members } = await api('/api/family');
  const selfName = App.user?.name || 'You';

  const byId = Object.fromEntries(members.map(m => [m.id, m]));
  const anchorOf = m => (m.relationTo && byId[m.relationTo]) || null;
  const anchorLabel = m => {
    const a = anchorOf(m);
    return a ? (a.name || a.relation) : 'you';
  };

  /* Generation is derived from the relationTo chain, not a fixed table, so a
     "Father" linked to your Mother is your grandfather (gen 1), while a
     "Father" linked to you is gen 2. This is what makes maternal/paternal
     grandparents place and connect correctly. */
  const GEN_YOU = 3;
  function genOfMember(m, _depth = 0) {
    if (!m) return GEN_YOU;
    if (_depth > 8) return GEN_OF[m.relation] || GEN_YOU; // cycle guard
    const a = anchorOf(m);
    const base = a ? genOfMember(a, _depth + 1) : GEN_YOU;
    if (PARENT_REL.includes(m.relation)) return Math.max(0, base - 1);
    if (CHILD_REL.includes(m.relation)) return Math.min(4, base + 1);
    if (SIB_REL.includes(m.relation)) return base;
    // Grandparent/grandmother: two generations above the anchor (or above you
    // when unlinked). Uncle/Aunt: same generation as the anchor.
    if (m.relation === 'Grandfather' || m.relation === 'Grandmother') return Math.max(0, base - 2);
    if (m.relation === 'Uncle' || m.relation === 'Aunt') return base;
    // Other/unlinked fallback
    if (!a) return GEN_OF[m.relation] || GEN_YOU;
    return base;
  }
  const genMap = Object.fromEntries(members.map(m => [m.id, genOfMember(m)]));

  /* Suggested relationships when adding a NEW person relative to `anchor`
     (null anchor = relative to "you"). These are the biologically sensible
     options given where the anchor sits in the tree. */
  function suggestionsFor(anchor) {
    if (!anchor) return ['Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Grandfather', 'Grandmother'];
    const aRel = anchor.relation;
    if (PARENT_REL.includes(aRel)) {
      // Your parent → their parent = your grandparent; their sibling = your uncle/aunt
      return ['Father', 'Mother', 'Brother', 'Sister', 'Uncle', 'Aunt'];
    }
    if (SIB_REL.includes(aRel)) {
      return ['Brother', 'Sister', 'Father', 'Mother'];
    }
    if (CHILD_REL.includes(aRel)) {
      return ['Son', 'Daughter', 'Brother', 'Sister'];
    }
    if (aRel === 'Grandfather' || aRel === 'Grandmother') {
      return ['Father', 'Mother', 'Brother', 'Sister']; // their parent = your great-grandparent
    }
    if (aRel === 'Uncle' || aRel === 'Aunt') {
      return ['Brother', 'Sister', 'Father', 'Mother'];
    }
    return ['Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter'];
  }

  /* Derive a human label from the relationTo chain (e.g. Father-of-Mother →
     Maternal Grandfather). Falls back to the raw relation. */

  // Walk up the anchor chain to find which of your parents this person descends
  // from. Returns 'Mother' (maternal), 'Father' (paternal), or null.
  function sideOf(person, _depth = 0) {
    if (!person || _depth > 8) return null;
    const a = anchorOf(person);
    if (!a) return null;
    if (a.relation === 'Mother') return 'Mother';
    if (a.relation === 'Father') return 'Father';
    if (!a.relationTo || a.relationTo === 'you') return null; // reached You, no parent found
    return sideOf(a, _depth + 1);
  }

  function relLabel(m) {
    const a = anchorOf(m);
    if (!a) return m.relation; // linked to "you"
    const aRel = a.relation;
    const aIsYouParent = PARENT_REL.includes(aRel) && (!a.relationTo || a.relationTo === 'you');
    const side = aRel === 'Mother' ? 'Maternal' : 'Paternal';

    // A parent/grandparent OF your mother/father is your grandparent.
    if (PARENT_REL.includes(m.relation) && aIsYouParent) {
      return `${side} ${m.relation === 'Father' ? 'Grandfather' : 'Grandmother'}`;
    }
    // A parent OF your grandparent is your great-grandparent.
    if (PARENT_REL.includes(m.relation) && PARENT_REL.includes(aRel)) {
      const ggSide = sideOf(a) ? 'Maternal' : 'Paternal';
      return `${ggSide} Great-${m.relation === 'Father' ? 'grandfather' : 'grandmother'}`;
    }
    if (m.relation === 'Grandfather' || m.relation === 'Grandmother') {
      if (aIsYouParent) return `${side} ${m.relation}`; // Grandfather of your parent
      return `${m.relation} of ${a.name || a.relation}`;
    }
    if (PARENT_REL.includes(m.relation)) {
      return `${m.relation} of ${a.name || a.relation}`;
    }
    if (SIB_REL.includes(m.relation) && aIsYouParent) {
      return m.relation === 'Brother' ? `${side} Uncle` : `${side} Aunt`;
    }
    if (SIB_REL.includes(m.relation)) return `${m.relation} of ${a.name || a.relation}`;
    if (CHILD_REL.includes(m.relation)) return `${m.relation} of ${a.name || a.relation}`;
    return m.relation;
  }

  /* Short label for the graph (names/labels must fit under a ~150px node). */
  function shortLabel(m) {
    const full = relLabel(m);
    if (full.length <= 18) return full;
    return full
      .replace(/^Maternal /, 'Mat. ')
      .replace(/^Paternal /, 'Pat. ')
      .replace(/Great-/, 'Gt-')
      .replace(/Grandfather/, 'Grandpa')
      .replace(/Grandmother/, 'Grandma');
  }

  function conditionsToRaw(list) {
    return (list || []).map(c => c.name + (c.diagAge ? ' @' + c.diagAge : '')).join('\n');
  }
  function parseConditions(raw) {
    return String(raw || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const at = l.split('@');
      return { name: at[0].trim(), diagAge: (at[1] || '').trim() };
    });
  }
  function relationSelectHTML(preset, anchor) {
    const ctx = suggestionsFor(anchor);
    const ctxOpts = ctx.map(r => `<option ${preset === r ? 'selected' : ''}>${r}</option>`).join('');
    const rest = RELATIONS.filter(r => !ctx.includes(r)).map(r => `<option ${preset === r ? 'selected' : ''}>${r}</option>`).join('');
    return `<select name="relation"><optgroup label="Suggested">${ctxOpts}</optgroup><optgroup label="All relationships">${rest}</optgroup></select>`;
  }
  function anchorSelectHTML(currentId, excludeId) {
    // Options: "You" plus every member except the one being edited (can't link to self).
    const opts = [`<option value="you" ${!currentId || currentId === 'you' ? 'selected' : ''}>You</option>`]
      .concat(members.filter(x => x.id !== excludeId).map(x =>
        `<option value="${esc(x.id)}" ${currentId === x.id ? 'selected' : ''}>${esc(x.name || relLabel(x))}</option>`)).join('');
    return `<select name="relationTo">${opts}</select>`;
  }
  function memberFormFields(m = {}, anchor, forEditId) {
    const showAnchor = forEditId != null; // only the edit form can re-parent
    return `
      <div class="grid g2">
        <div><label>Name</label><input name="name" value="${esc(m.name || '')}" placeholder="Name"></div>
        <div><label>Relationship${anchor && !forEditId ? ` (to ${esc(anchor.name || anchor.relation)})` : ''}</label>${relationSelectHTML(m.relation, anchor)}</div>
        ${showAnchor ? `<div><label>Linked to</label>${anchorSelectHTML(m.relationTo, forEditId)}</div>` : ''}
        <div><label>Age / birth year</label><input name="ageOrYear" value="${esc(m.ageOrYear || '')}" placeholder="e.g. 58 or 1968"></div>
        <div><label>Cancer history</label><select name="cancerHistory"><option value="">No</option><option value="1" ${m.cancerHistory ? 'selected' : ''}>Yes</option></select></div>
      </div>
      <div class="mt"></div>
      <label>Conditions — one per line as &ldquo;Condition @ diagnosis-age&rdquo;</label>
      <textarea name="conditionsRaw" rows="3" placeholder="Type 2 Diabetes @62&#10;Hypertension @48">${esc(conditionsToRaw(m.conditions))}</textarea>
      <div class="grid g2 mt">
        <div><label>Surgeries / genetic conditions (comma-separated)</label><input name="geneticConditions" value="${esc((m.geneticConditions || []).join(', '))}"></div>
        <div><label>Notes</label><input name="notes" value="${esc(m.notes || '')}" placeholder="Relevant health events"></div>
      </div>`;
  }
  function formToBody(fd, anchorId) {
    // The edit form carries a "Linked to" selector; prefer it over the fallback.
    const relTo = fd.get('relationTo') || anchorId || 'you';
    return {
      name: fd.get('name'), relation: fd.get('relation'), ageOrYear: fd.get('ageOrYear'),
      cancerHistory: !!fd.get('cancerHistory'), conditions: parseConditions(fd.get('conditionsRaw')),
      geneticConditions: fd.get('geneticConditions'), notes: fd.get('notes'),
      relationTo: relTo
    };
  }
  async function removeMember(id) {
    if (!(await confirmDlg('Remove member?', 'This removes this person and their conditions from your family history.', 'Remove'))) return;
    await api(`/api/family/${id}`, { method: 'DELETE' });
    toast('Family member removed');
    VIEWS.family(container);
  }

  function openEditModal(m) {
    const anchor = anchorOf(m);
    const modal = openModal(`
      <h2>Update record — ${esc(m.name || m.relation)}</h2>
      <p class="page-sub">Changes update your family history and re-analyze guidance.</p>
      <form id="fm-edit-form" class="mt">${memberFormFields(m, anchor, m.id)}
        <div class="row mt" style="justify-content:flex-end">
          <button type="button" class="btn secondary" id="fm-edit-cancel">Cancel</button>
          <button type="submit" class="btn">Save changes</button>
        </div>
      </form>`, { label: 'Edit family member' });
    modal.el.querySelector('#fm-edit-cancel').onclick = () => modal.close();
    modal.el.querySelector('#fm-edit-form').onsubmit = async e => {
      e.preventDefault();
      try {
        await api(`/api/family/${m.id}`, { method: 'PUT', body: formToBody(new FormData(e.target), m.relationTo || 'you') });
        modal.close();
        toast('Record updated — guidance re-analyzed.');
        VIEWS.family(container);
      } catch (err) { toast(err.message, 'err'); }
    };
  }

  function openAddRelativeModal(parentLabel, anchorId, presetRelation) {
    const anchor = anchorId && anchorId !== 'you' ? byId[anchorId] : null;
    const preset = presetRelation || suggestionsFor(anchor)[0];
    const modal = openModal(`
      <h2>Add relative</h2>
      <p class="page-sub">New family member connected to <b>${esc(parentLabel)}</b>. Suggested relationships are based on where they sit in your tree.</p>
      <form id="fm-add-form" class="mt">${memberFormFields({ relation: preset }, anchor)}
        <div class="row mt" style="justify-content:flex-end">
          <button type="button" class="btn secondary" id="fm-add-cancel">Cancel</button>
          <button type="submit" class="btn">Add to family history</button>
        </div>
      </form>`, { label: 'Add relative' });
    modal.el.querySelector('#fm-add-cancel').onclick = () => modal.close();
    modal.el.querySelector('#fm-add-form').onsubmit = async e => {
      e.preventDefault();
      try {
        await api('/api/family', { method: 'POST', body: formToBody(new FormData(e.target), anchorId || 'you') });
        modal.close();
        toast('Family member added — guidance updated.');
        VIEWS.family(container);
      } catch (err) { toast(err.message, 'err'); }
    };
  }

  function openMemberModal(m) {
    const conds = (m.conditions || []);
    const label = relLabel(m);
    const modal = openModal(`
      <div class="spread" style="align-items:flex-start">
        <div>
          <h2 style="margin:0">${esc(m.name || label)}</h2>
          <div class="row" style="gap:6px;margin-top:6px">
            <span class="chip neutral">${esc(label)}</span>
            ${m.ageOrYear ? `<span class="chip neutral">~${esc(m.ageOrYear)}</span>` : ''}
            ${m.cancerHistory ? '<span class="chip warn">cancer history</span>' : ''}
            <span class="chip info">linked to ${esc(anchorLabel(m))}</span>
          </div>
        </div>
        <button class="btn sm secondary" id="fm-close">Close</button>
      </div>
      <dl class="fam-kv mt">
        <dt>Conditions</dt><dd>${conds.length ? conds.map(c => esc(c.name) + (c.diagAge ? ` <span class="page-sub">(@${esc(c.diagAge)})</span>` : '')).join(' · ') : '<span class="page-sub">None recorded</span>'}</dd>
        <dt>Surgeries / genetic</dt><dd>${(m.geneticConditions || []).length ? esc((m.geneticConditions || []).join(', ')) : '<span class="page-sub">None recorded</span>'}</dd>
        <dt>Notes</dt><dd>${m.notes ? esc(m.notes) : '<span class="page-sub">—</span>'}</dd>
        <dt>Added</dt><dd class="page-sub">${m.recordedAt ? fmtDateUI(String(m.recordedAt).slice(0, 10)) : '—'}</dd>
      </dl>
      <div class="disclaimer mt">Updating this record re-runs family-aware risk signals and screening guidance.</div>
      <div class="row mt fam-actions" style="justify-content:flex-end">
        <button class="btn sm secondary" id="fm-del">Remove</button>
        <button class="btn sm secondary" id="fm-add">+ Add relative</button>
        <button class="btn sm" id="fm-edit">Edit record</button>
      </div>`, { label: 'Family member details' });
    modal.el.querySelector('#fm-close').onclick = () => modal.close();
    modal.el.querySelector('#fm-edit').onclick = () => { modal.close(); openEditModal(m); };
    modal.el.querySelector('#fm-add').onclick = () => {
      modal.close();
      openAddRelativeModal(m.name || label, m.id, suggestionsFor(m)[0]);
    };
    modal.el.querySelector('#fm-del').onclick = async () => { modal.close(); await removeMember(m.id); };
  }

  function openYouModal() {
    const modal = openModal(`
      <div class="spread" style="align-items:flex-start">
        <div>
          <h2 style="margin:0">${esc(selfName)}</h2>
          <div class="row" style="gap:6px;margin-top:6px"><span class="chip neutral">You</span><span class="chip ok">center of tree</span></div>
        </div>
        <button class="btn sm secondary" id="fm-close">Close</button>
      </div>
      <p class="page-sub mt">Your own details live in the health profile. From here you can grow the tree — parents, siblings and children connect through you. To add a grandparent, first add a parent, then click that parent and add their parent.</p>
      <div class="row mt fam-actions" style="justify-content:flex-end">
        <button class="btn sm secondary" id="fm-profile">Open my profile</button>
        <button class="btn sm" id="fm-add">+ Add relative</button>
      </div>`, { label: 'Your node' });
    modal.el.querySelector('#fm-close').onclick = () => modal.close();
    modal.el.querySelector('#fm-profile').onclick = () => { modal.close(); location.hash = '#/profile'; };
    modal.el.querySelector('#fm-add').onclick = () => {
      modal.close();
      openAddRelativeModal(selfName, 'you', 'Father');
    };
  }

  /* ---- SVG node-graph tree: layout + edges derived from relationTo chain ---- */
  const GEN_CLASS = { 0: 'ggp', 1: 'gp', 2: 'par', 3: 'sib', 4: 'kid' };
  const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);

  function renderGraph() {
    const W = 980, CX = W / 2;
    const LAYER_Y = { 0: 30, 1: 130, 2: 250, 3: 375, 4: 500 };
    const H = 570;

    // Build node list. "you" is always gen 3 / center. Each member is placed on
    // the layer of its derived generation and pushed toward its anchor's x.
    const nodes = [{ id: 'you', m: null, gen: GEN_YOU, x: CX, y: LAYER_Y[GEN_YOU] }];
    const nodeById = { you: nodes[0] };
    for (const m of members) {
      const g = Math.max(0, Math.min(4, genMap[m.id] ?? GEN_YOU));
      const n = { id: m.id, m, gen: g, x: CX, y: LAYER_Y[g], anchorId: (m.relationTo && byId[m.relationTo]) ? m.relationTo : 'you' };
      nodes.push(n); nodeById[m.id] = n;
    }

    // Place each row from the top (ancestors) down, centering each node under
    // its anchor so edges stay short and the tree reads top-to-bottom. Gen 3
    // (You + siblings) is laid out first and pinned, so ancestors can aim at
    // their child and siblings can fan around You without ever landing on it.
    const layers = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    nodes.forEach(n => { if (n.id !== 'you' && layers[n.gen]) layers[n.gen].push(n); });

    // Gen 3: fan siblings around the fixed "You" — alternate left/right, never at center.
    const sibs = layers[3];
    const sibSpacing = Math.min(185, (W - 300) / Math.max(sibs.length, 1));
    sibs.forEach((n, i) => {
      const side = i % 2 === 0 ? -1 : 1;                       // 1st left, 2nd right, 3rd left…
      const rank = Math.floor(i / 2) + 1;                      // distance from center
      n.x = CX + side * rank * sibSpacing;
      n.y = LAYER_Y[3];
    });

    // Ancestors (gen 0,1,2) and descendants (gen 4): center under the anchor.
    // Process in birth order so a node's anchor x is already settled.
    const placeRow = (row, baseY) => {
      // Seed with the anchor's x, then push apart to enforce a readable gap.
      row.forEach(n => {
        const a = nodeById[n.anchorId] || nodeById.you;
        n.x = a.x; n.y = baseY;
      });
      resolveOverlaps(row, n => n.x);
    };
    placeRow(layers[2], LAYER_Y[2]); // parents first (their anchors are You/sibs, fixed)
    placeRow(layers[4], LAYER_Y[4]); // children under their parent
    placeRow(layers[1], LAYER_Y[1]); // grandparents under the parent they link to
    placeRow(layers[0], LAYER_Y[0]); // great-grandparents under the grandparent

    // Resolve horizontal overlaps on a row: group nodes that were seeded at the
    // same anchor x, spread each group symmetrically around its anchor (so a
    // couple straddles their child), then enforce a global min-gap left→right.
    function resolveOverlaps(row, getX) {
      if (row.length < 2) return;
      const GAP = 180;
      // group by seeded anchor x (within a small epsilon)
      row.sort((a, b) => getX(a) - getX(b));
      const groups = [];
      let cur = [row[0]];
      for (let i = 1; i < row.length; i++) {
        if (Math.abs(getX(row[i]) - getX(row[i - 1])) < 1) cur.push(row[i]);
        else { groups.push(cur); cur = [row[i]]; }
      }
      groups.push(cur);
      // spread each group symmetrically around its shared anchor x
      groups.forEach(g => {
        const base = getX(g[0]);
        g.forEach((n, i) => { n.x = base + (i - (g.length - 1) / 2) * GAP; });
      });
      // re-sort and enforce minimum gap left→right so nothing overlaps
      row.sort((a, b) => getX(a) - getX(b));
      for (let i = 1; i < row.length; i++) {
        const need = getX(row[i - 1]) + GAP;
        if (getX(row[i]) < need) row[i].x += need - getX(row[i]);
      }
      // if the row now runs off the right edge, shift the whole row back and
      // re-enforce gaps from the right so nothing overflows.
      const over = getX(row[row.length - 1]) - (W - 60);
      if (over > 0) {
        for (let i = row.length - 1; i >= 0; i--) {
          const cap = i === row.length - 1 ? W - 60 : getX(row[i + 1]) - GAP;
          if (getX(row[i]) > cap) row[i].x = cap;
        }
      }
      // clamp into view
      row.forEach(n => { n.x = Math.max(60, Math.min(W - 60, n.x)); });
    }

    /* edges derived from relationTo: parent→child, sibling↔sibling, partner */
    const edges = [];
    const edgeKey = new Set();
    const addEdge = (a, b, kind) => {
      if (!a || !b || a === b) return;
      const k = [a.id, b.id].sort().join('|') + ':' + kind;
      if (edgeKey.has(k)) return;
      edgeKey.add(k);
      edges.push({ a, b, kind });
    };
    for (const n of nodes) {
      if (n.id === 'you') continue;
      const r = n.m.relation;
      const a = nodeById[n.anchorId] || nodeById.you;

      if (PARENT_REL.includes(r) || CHILD_REL.includes(r)) {
        // Parent/child: solid line. Orient so the elder is the line start.
        const parent = n.gen < a.gen ? n : (a.gen < n.gen ? a : n);
        const child = parent === n ? a : n;
        addEdge(parent, child, 'solid');
      } else {
        // Grandparents, siblings, uncles/aunts, "other": dashed link to anchor.
        addEdge(n, a, 'dash');
      }
    }
    // Partner (couple) line: link two people of opposite parent-type who share
    // the same anchor, so a couple shows joined. Applies to your parents AND to
    // any grandparent couple (two grandparents sharing a parent anchor).
    for (const gen of [1, 2]) {
      const row = nodes.filter(n => n.gen === gen && n.m && (PARENT_REL.includes(n.m.relation)));
      const byAnchor = {};
      row.forEach(n => { (byAnchor[n.anchorId] = byAnchor[n.anchorId] || []).push(n); });
      Object.values(byAnchor).forEach(pair => {
        if (pair.length === 2) addEdge(pair[0], pair[1], 'partner');
      });
    }

    const path = (a, b) => {
      const my = (a.y + b.y) / 2;
      return `M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
    };

    let svg = `<svg class="fam-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Family health tree graph">`;
    svg += '<g class="fg-edges">' + edges.map(e =>
      `<path class="fg-edge fg-${e.kind}" d="${path(e.a, e.b)}"/>`).join('') + '</g>';
    svg += '<g class="fg-nodes">';
    for (const n of nodes) {
      const isYou = n.id === 'you';
      const name = isYou ? selfName : (n.m.name || shortLabel(n.m));
      const sub = isYou ? 'You' : shortLabel(n.m) + (n.m.ageOrYear ? ` · ${n.m.ageOrYear}` : '');
      const conds = isYou ? '' : (n.m.conditions || []).slice(0, 2)
        .map(c => esc(truncate(c.name, 20))).join(' · ');
      const quick = `<g class="fg-quick">
        <g class="fg-qbtn fg-qadd" data-addrel="${esc(n.id)}" transform="translate(-24,-24)" role="button" aria-label="${esc('Add relative of ' + name)}"><title>Add relative</title><circle r="11"/><text text-anchor="middle" dy="4">+</text></g>
        ${isYou ? '' : `<g class="fg-qbtn fg-qedit" data-editfam="${esc(n.id)}" transform="translate(24,-24)" role="button" aria-label="${esc('Update record of ' + name)}"><title>Update record</title><circle r="11"/><text text-anchor="middle" dy="4">&#9998;</text></g>
        <g class="fg-qbtn fg-qdel" data-delfam="${esc(n.id)}" transform="translate(24,24)" role="button" aria-label="${esc('Remove ' + name)}"><title>Remove member</title><circle r="11"/><text text-anchor="middle" dy="4">&times;</text></g>`}
      </g>`;
      svg += `<g class="fg-node${isYou ? ' fg-you' : ''}" transform="translate(${Math.round(n.x)},${n.y})" data-famid="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(isYou ? 'You — select for options' : name + ' — select to update record or add relatives')}">
        <circle class="fg-halo" r="40"/>
        <circle class="fg-core fg-${isYou ? 'self' : GEN_CLASS[n.gen] || 'sib'}" r="27"/>
        <text class="fg-initials" text-anchor="middle" dy="5">${esc(initialsOf(name))}</text>
        <text class="fg-name" text-anchor="middle" y="48">${esc(truncate(name, 18))}</text>
        <text class="fg-sub" text-anchor="middle" y="63">${esc(sub)}</text>
        ${conds ? `<text class="fg-cond" text-anchor="middle" y="78">${conds}</text>` : ''}
        ${quick}
      </g>`;
    }
    svg += '</g></svg>';
    return svg;
  }

  const totalConds = members.reduce((n, m) => n + (m.conditions || []).length, 0);
  const gensCovered = new Set([GEN_YOU, ...Object.values(genMap)]).size;

  container.innerHTML = `
    <div class="topbar"><div><h1>Family Health History</h1>
      <div class="page-sub">Family context powers personalized preventive-care guidance.</div></div></div>

    <div class="card mb" id="tree">
      <div class="spread"><h2 style="padding-bottom:0;border-bottom:none;margin:0">Family health tree</h2>
        <div class="fg-legend">
          <span class="fam-stat"><b>${members.length}</b> people</span>
          <span class="fam-stat"><b>${totalConds}</b> conditions</span>
          <span class="fam-stat"><b>${gensCovered}</b> generations</span>
          <span><i class="fg-dot ggp"></i>Great-grand</span><span><i class="fg-dot gp"></i>Grandparents</span><span><i class="fg-dot par"></i>Parents</span>
          <span><i class="fg-dot sib"></i>You &amp; siblings</span><span><i class="fg-dot kid"></i>Children</span>
        </div></div>
      <div class="fg-hint">Click a person to select them — then update their record or add relatives · hover a node for quick + / ✎ / × actions</div>
      <div class="fam-graph-wrap">${renderGraph()}</div>
      <div class="fam-bar" id="fam-bar" aria-live="polite"></div>
      ${members.length ? '' : '<div class="empty" style="margin-top:8px">Add family members below — they will appear on the graph automatically</div>'}
    </div>

    <div class="card">
      <h2>Add family member</h2>
      <p class="page-sub" id="add-ctx-hint"></p>
      <form id="f-fam">
        <div class="grid g4">
          <div><label>Name</label><input name="name" placeholder="Name"></div>
          <div><label>Relationship</label><select name="relation" id="add-relation"></select></div>
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
        <div class="mt row" style="align-items:center">
          <button class="btn" type="submit">Add to family history</button>
          <span class="page-sub" id="add-target"></span>
        </div>
      </form>
    </div>`;

  /* ---- selection state + contextual action bar ---- */
  const barEl = container.querySelector('#fam-bar');

  // The bottom form attaches to the selected node (or You by default).
  let selectedId = 'you';
  const addForm = container.querySelector('#f-fam');
  const addRelationSel = addForm.querySelector('#add-relation');
  const addCtxHint = container.querySelector('#add-ctx-hint');
  const addTarget = addForm.querySelector('#add-target');

  function renderAddFormCtx() {
    const isYou = selectedId === 'you';
    const anchor = isYou ? null : byId[selectedId];
    const preset = suggestionsFor(anchor)[0];
    addRelationSel.innerHTML = relationSelectHTML(preset, anchor);
    const label = isYou ? selfName : (anchor.name || relLabel(anchor));
    addCtxHint.textContent = `This person will be linked to ${label}. Pick a relationship that describes how they connect to ${label}.`;
    addTarget.textContent = `→ linked to ${label}`;
  }

  function nodeColorClass(id, m) {
    if (id === 'you') return 'self';
    return GEN_CLASS[genMap[id] ?? GEN_YOU] || 'sib';
  }

  function clearSelection() {
    selectedId = 'you';
    renderAddFormCtx();
    container.querySelectorAll('.fg-node.fg-selected').forEach(n => n.classList.remove('fg-selected'));
    if (barEl) { barEl.classList.remove('on'); barEl.innerHTML = ''; }
  }

  function addRelativeFrom(id) {
    if (id === 'you') { openAddRelativeModal(selfName, 'you', 'Father'); return; }
    const m = members.find(x => x.id === id);
    if (!m) return;
    openAddRelativeModal(m.name || relLabel(m), m.id, suggestionsFor(m)[0]);
  }

  function selectNode(id) {
    const isYou = id === 'you';
    const m = isYou ? null : members.find(x => x.id === id);
    if (!isYou && !m) { clearSelection(); return; }

    selectedId = id;
    renderAddFormCtx();

    container.querySelectorAll('.fg-node').forEach(n =>
      n.classList.toggle('fg-selected', n.dataset.famid === id));

    const name = isYou ? selfName : (m.name || relLabel(m));
    const rel = isYou ? 'You · center of tree' : relLabel(m) + (m.ageOrYear ? ` · ~${m.ageOrYear}` : '');
    const nConds = isYou ? 0 : (m.conditions || []).length;

    barEl.innerHTML = `
      <span class="fam-bar-av ${nodeColorClass(id, m)}">${esc(initialsOf(name))}</span>
      <div class="fam-bar-meta">
        <b>${esc(name)}</b>
        <span class="page-sub">${esc(rel)}${nConds ? ` · ${nConds} condition${nConds > 1 ? 's' : ''} recorded` : ''}${!isYou ? ` · linked to ${esc(anchorLabel(m))}` : ''}</span>
      </div>
      <div class="fam-bar-acts">
        ${isYou
          ? `<button class="btn sm secondary" data-bar="profile">My profile</button>
             <button class="btn sm" data-bar="add">+ Add relative</button>`
          : `<button class="btn sm danger-outline" data-bar="remove">Remove</button>
             <button class="btn sm secondary" data-bar="add">+ Add relative</button>
             <button class="btn sm secondary" data-bar="details">Details</button>
             <button class="btn sm" data-bar="edit">Update record</button>`}
      </div>`;
    barEl.classList.add('on');

    barEl.querySelectorAll('[data-bar]').forEach(btn => btn.onclick = () => {
      const act = btn.dataset.bar;
      if (act === 'edit') openEditModal(m);
      else if (act === 'details') openMemberModal(m);
      else if (act === 'add') addRelativeFrom(id);
      else if (act === 'remove') removeMember(id);
      else if (act === 'profile') openYouModal();
    });
  }

  /* ---- wire nodes: click to select; quick actions on hover ---- */
  container.querySelectorAll('[data-famid]').forEach(g => {
    const open = e => {
      if (e.target.closest('[data-delfam],[data-addrel],[data-editfam]')) return;
      selectNode(g.dataset.famid);
    };
    g.onclick = open;
    g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } };
  });

  container.querySelectorAll('[data-addrel]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    addRelativeFrom(b.dataset.addrel);
  });

  container.querySelectorAll('[data-editfam]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const m = members.find(x => x.id === b.dataset.editfam);
    if (m) openEditModal(m);
  });

  container.querySelectorAll('[data-delfam]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    removeMember(b.dataset.delfam);
  });

  renderAddFormCtx();

  addForm.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(addForm);
    try {
      await api('/api/family', { method: 'POST', body: formToBody(fd, selectedId) });
      toast('Family member added — guidance updated.'); VIEWS.family(container);
    } catch (err) { toast(err.message, 'err'); }
  };
};

/* ---- in-browser OCR (tesseract.js, loaded on first use) ----
   Shared by the upload flow and the report modal's "read image again" action. */
let tessPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tessPromise) return tessPromise;
  tessPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    // A failed load must not poison later attempts: reset so the next
    // upload (or "Read image again") retries the download fresh.
    s.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else { tessPromise = null; reject(new Error('OCR engine failed to start')); }
    };
    s.onerror = () => { tessPromise = null; reject(new Error('OCR engine could not be downloaded (connect to the internet once)')); };
    document.head.appendChild(s);
  });
  return tessPromise;
}
// A failed recognition must not poison later attempts either.
async function ocrImage(file, onProgress) {
  const T = await loadTesseract().catch(err => { tessPromise = null; throw err; });
  let src;
  try {
    src = await prepareForOcr(file);
  } catch (err) {
    throw new Error('Could not read this image file.');
  }
  try {
    const { data } = await T.recognize(src, 'eng', {
      logger: m => { if (m.status === 'recognizing text') onProgress(m.progress || 0); }
    });
    return String(data && data.text || '').replace(/\r/g, '').trim();
  } catch (err) {
    tessPromise = null;
    throw err;
  }
}

// Upscale small photos, greyscale and stretch contrast — scanned/paper photos
// read far more reliably after this.
async function prepareForOcr(file) {
  if (!('createImageBitmap' in window)) return file;
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 2000 ? Math.min(3, 2000 / Math.max(bmp.width, 1)) : 1;
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const img = c.getImageData(0, 0, w, h), d = img.data;
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
  const hist = new Uint32Array(256);
  for (let j = 0; j < g.length; j++) hist[g[j]]++;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= g.length * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= g.length * 0.98) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  for (let j = 0, i = 0; j < g.length; j++, i += 4) {
    const v = Math.max(0, Math.min(255, ((g[j] - lo) * 255 / span) | 0));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  c.putImageData(img, 0, 0);
  return cv;
}

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
          <span style="font-size:12px">PDF · TXT · JPG/PNG photos &amp; scans — read automatically with in-browser OCR · max 15 MB</span>
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
    const payload = { filename: file.name, mime: file.type, dataBase64: btoa(binary) };
    // Images (and any file the server can't parse) get OCR'd right here in the
    // browser — the recognized text travels with the upload, so nothing extra
    // leaves the device and the server extracts from real content.
    const isImage = /^image\//.test(file.type || '') || /\.(png|jpe?g)$/i.test(file.name || '');
    await runPipeline(payload, isImage ? file : null);
  }

  async function runPipeline(payload, imageFile) {
    const box = container.querySelector('#pipeline-box');
    const ul = container.querySelector('#pipeline');
    box.style.display = 'block';
    const names = ['File validation'];
    if (imageFile) names.push('OCR / document parsing');
    names.push('Safety pre-check', 'Medical entity extraction', 'Value normalization & reference ranges', 'Structured health data');
    ul.innerHTML = names.map(s => `<li data-st="${s}"><div class="mark"></div><div><div class="st">${esc(s)}</div><div class="sd">waiting</div></div></li>`).join('');
    const items = [...ul.querySelectorAll('li')];
    const setStage = (i, detail, spinning) => {
      const li = items[i]; if (!li) return;
      li.classList.add('on');
      li.querySelector('.sd').textContent = detail;
      li.querySelector('.mark').innerHTML = spinning ? '<span class="spin"></span>' : '';
    };

    setStage(0, `${payload.filename} · ${Math.max(1, Math.round(payload.dataBase64.length * 0.75 / 1024))} KB`, false);

    // Step 1: recognize the image text before anything else runs on it.
    if (imageFile) {
      setStage(1, 'Loading OCR engine…', true);
      try {
        const text = await ocrImage(imageFile, pr => setStage(1, `Recognizing text — ${Math.round(pr * 100)}%`, true));
        payload.ocrText = text;
        const words = text ? text.split(/\s+/).length : 0;
        setStage(1, words ? `Recognized ${words} word(s) in your browser` : 'No text recognized — enter values via “Paste report text”', false);
      } catch (err) {
        setStage(1, `OCR unavailable — ${err.message}`, false);
      }
    }

    // Step 2: hand off to the server pipeline (validation → extraction → …).
    const base = imageFile ? 2 : 1;
    let k = base;
    const ticker = setInterval(() => { if (k < items.length - 1) { items[k].classList.add('on'); items[k].querySelector('.mark').innerHTML = '<span class="spin"></span>'; k++; } }, 350);
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
      const got = report.structured?.tests?.length || 0;
      toast(got ? `Report processed — ${got} value(s) added to your health graph.` : 'Report saved — no values auto-detected, please review.');
      setTimeout(() => openReportModal(report.id), 500);
    } catch (err) {
      clearInterval(ticker);
      items.forEach(it => it.classList.add('on'));
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
        ${(/\.(png|jpe?g)$/i.test(r.filename || '') || /^image\//.test(r.mime || '')) ? `<button class="btn sm secondary" id="rm-ocr">Read image again (OCR)</button>` : ''}
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
      <tbody>${r.structured.tests.map(t => {
        const band = t.refLow == null && t.refHigh == null ? '—'
          : t.refLow == null ? `< ${t.refHigh}`
          : t.refHigh == null ? `> ${t.refLow}`
          : t.refHigh > 999999 ? 'no upper limit' : `${t.refLow} – ${t.refHigh}`;
        const review = t.confidence && t.confidence !== 'high'
          ? ` <span class="chip warn" title="${esc(t.note || 'Needs review — verify against the original document')}">review</span>` : '';
        const bandTitle = t.refSource === 'lab' ? ' title="The laboratory\u2019s stated interval from this report"' : '';
        return `
        <tr><td>${esc(t.name)}${review}</td>
        <td class="num-cell"><b>${t.value}</b> ${esc(t.unit)}</td>
        <td class="num-cell"${bandTitle}>${band}</td>
        <td>${flagChip(t.flag)}</td>
        <td style="font-size:12.5px;color:var(--ink-soft)">${esc(data.trendNotes[t.key] || '—')}</td></tr>`; }).join('')}
      </tbody></table>`
      : '<div class="empty">No standard analytes were auto-detected. Use &ldquo;Paste report text&rdquo; to enter values manually.</div>'}
    ${(r.structured?.unresolved || []).length ? `
      <div class="card mt" style="box-shadow:none;border-style:dashed">
        <h3>Seen but unreadable (${r.structured.unresolved.length})</h3>
        <p class="page-sub">These test names were recognized, but their values were not legible in this document. Correct the OCR text below and re-extract, or add the readings manually.</p>
        ${r.structured.unresolved.map(u => `<div class="tl-event" style="padding:4px 0"><b>${esc(u.name)}</b> <span class="page-sub">· value not legible</span></div>`).join('')}
      </div>` : ''}

    ${r.ocrText ? `<details class="mt"><summary style="cursor:pointer;font-weight:600;font-size:13px">Text recognized from the document (OCR)</summary>
      <textarea id="fm-ocrtext" rows="6" style="width:100%;margin-top:8px;font-size:12.5px">${esc(r.ocrText)}</textarea>
      <div class="row mt" style="justify-content:flex-end">
        <button class="btn sm secondary" id="fm-ocr-reproc">Re-extract values from this text</button>
      </div></details>` : ''}

    ${(r.structured?.flags || []).includes('possible_prompt_injection_ignored')
      ? '<div class="disclaimer"><b>Security notice:</b> this document contained embedded instructions attempting to influence the AI. They were detected and ignored by the prompt-injection guard.</div>' : ''}
    <details class="mt"><summary style="cursor:pointer;font-weight:600;font-size:13px">View processing pipeline</summary>
      <ul class="pipeline">${r.pipeline.map(st => `<li class="on"><div class="mark">${st.status === 'error' ? '!' : ''}</div>
        <div><div class="st">${esc(st.stage)}</div><div class="sd">${esc(st.detail)}</div></div></li>`).join('')}</ul>
    </details>`, { wide: true });

  m.el.querySelector('#rm-x').onclick = m.close;

  // "Read image again (OCR)" — for reports uploaded before OCR existed, or when
  // the first pass found nothing. Fetches the stored original, recognizes text
  // in the browser, then re-extracts values from it.
  const ocrRun = m.el.querySelector('#rm-ocr');
  if (ocrRun) ocrRun.onclick = async () => {
    const label0 = 'Read image again (OCR)';
    ocrRun.disabled = true;
    try {
      ocrRun.textContent = 'Loading image…';
      const resp = await fetch(`/api/reports/${id}/file`, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error('The original file is no longer stored — please upload it again.');
      const blob = await resp.blob();
      const text = await ocrImage(blob, pr => { ocrRun.textContent = `Reading… ${Math.round(pr * 100)}%`; });
      if (!text.trim()) {
        toast('No text recognized in this image — try a clearer photo, or use "Paste report text".');
        ocrRun.disabled = false; ocrRun.textContent = label0;
        return;
      }
      ocrRun.textContent = 'Extracting values…';
      await api(`/api/reports/${id}/reextract`, { method: 'POST', body: { text } });
      m.close();
      toast('Text recognized — values re-extracted from the image.');
      openReportModal(id);
    } catch (err) {
      toast(err.message, 'err');
      ocrRun.disabled = false; ocrRun.textContent = label0;
    }
  };

  const ocrBtn = m.el.querySelector('#fm-ocr-reproc');
  if (ocrBtn) ocrBtn.onclick = async () => {
    const ta = m.el.querySelector('#fm-ocrtext');
    ocrBtn.disabled = true; ocrBtn.textContent = 'Re-extracting…';
    try {
      await api(`/api/reports/${id}/reextract`, { method: 'POST', body: { text: ta.value } });
      m.close();
      toast('Values re-extracted from your corrected text.');
      openReportModal(id);
    } catch (err) {
      ocrBtn.disabled = false; ocrBtn.textContent = 'Re-extract values from this text';
      toast(err.message, 'err');
    }
  };
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
