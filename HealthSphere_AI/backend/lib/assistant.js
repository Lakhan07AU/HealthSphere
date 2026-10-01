import { coll, objColl } from './db.js';
import { buildSeries, analyzeSeries, labelOf } from './trends.js';
import { getInsights } from './insights.js';
import { weeklyInsight } from './lifestyle.js';

/* ============================================================
   AI ASSISTANT — rule-based, explainable, zero-dependency
   Answers questions strictly from the signed-in user's own records.
   No LLM, no external calls, nothing leaves the server.
   Every reply is informational, never a diagnosis (Safety Layer).
   ============================================================ */

const METRIC_PHRASES = [
  { re: /\b(hba1c|a1c|glycat)/, keys: ['hba1c'] },
  { re: /\b(blood sugar|sugar|glucose|fasting)/, keys: ['glucose_fasting', 'glucose_random'] },
  { re: /\b(bp|blood pressure|systolic|hypertens)/, keys: ['bp_systolic', 'bp_diastolic'] },
  { re: /\b(cholesterol|lipid)/, keys: ['total_cholesterol', 'ldl', 'hdl', 'triglycerides'] },
  { re: /\bldl\b/, keys: ['ldl'] },
  { re: /\bhdl\b/, keys: ['hdl'] },
  { re: /\btriglyceride/, keys: ['triglycerides'] },
  { re: /\b(weight|kgs?|kilograms?)\b/, keys: ['weight_kg', 'weight'] },
  { re: /\b(thyroid|tsh)\b/, keys: ['tsh'] },
  { re: /\b(vitamin d)\b/, keys: ['vitamin_d'] },
  { re: /\b(b12|cobalamin)\b/, keys: ['vitamin_b12'] },
  { re: /\b(hemoglobin|haemoglobin|\bhb\b)/, keys: ['hemoglobin'] },
  { re: /\b(creatinine|kidney|renal)\b/, keys: ['creatinine'] },
  { re: /\b(heart rate|pulse)\b/, keys: ['heart_rate'] },
  { re: /\b(sleep)\b/, keys: ['sleep_hours'] }
];

const DEFAULT_CHIPS = ['My HbA1c trend', 'Am I at risk?', 'Upcoming reminders', 'My latest report', 'Hydration goal'];

export function askAssistant(userId, qRaw) {
  const q = String(qRaw || '').toLowerCase().trim();
  if (!q) return { reply: 'Ask me anything about your records — try one of the suggestions below.', chips: DEFAULT_CHIPS };

  /* greetings & capability help */
  if (/^(hi|hii+|hello|hey|namaste|good (morning|evening|afternoon))\b/.test(q) || /\b(help|what can you do|capabilities)\b/.test(q)) {
    return {
      reply: 'Hello! I\'m your HealthSphere assistant — a private, rule-based helper that reads only YOUR records.\n\n' +
        'I can explain:\n• Metric values & trends (HbA1c, BP, cholesterol, weight…)\n• Your risk signals and why they appear\n• Latest lab report findings\n• Upcoming reminders & lifestyle goals\n• Family-history patterns',
      chips: DEFAULT_CHIPS
    };
  }

  /* emergency / nearby */
  if (/\b(emergency|sos|urgent|hospital|pharmacy|clinic near|nearby|ambulance)\b/.test(q)) {
    return {
      reply: 'For life-threatening situations always call 112 directly — Emergency Mode gives you one-tap call buttons, your emergency card and SOS alerts to your primary contact.\n\nNearby Care shows real hospitals, labs and pharmacies around your live location.',
      links: [{ label: 'Open Emergency Mode', href: '#/emergency' }, { label: 'Find Nearby Care', href: '#/hospitals' }],
      chips: ['Upcoming reminders']
    };
  }

  /* reminders */
  if (/\b(reminder|remind|due|medicin|medication|appointment|vaccination|follow.?up)\b/.test(q)) {
    const rem = coll('reminders', userId).filter(r => r.status === 'active')
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).slice(0, 3);
    return {
      reply: rem.length
        ? `You have ${coll('reminders', userId).filter(r => r.status === 'active').length} active reminder(s). Next up:\n` +
          rem.map(r => `• ${r.title || r.type} — due ${r.dueDate}`).join('\n')
        : 'No active reminders right now. Reminders are auto-generated from abnormal results and follow-ups, or you can add your own.',
      links: [{ label: 'Manage reminders', href: '#/reminders' }],
      chips: ['My latest report', 'Am I at risk?']
    };
  }

  /* reports */
  if (/\b(report|lab result|lab test|upload|document|pdf|extracted)\b/.test(q)) {
    const reps = coll('reports', userId).slice().sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
    if (!reps.length) return { reply: 'No reports uploaded yet. Upload a lab PDF and I\'ll be able to discuss its extracted values.', links: [{ label: 'Upload a report', href: '#/reports' }], chips: DEFAULT_CHIPS };
    const lastR = reps[0];
    const tests = lastR.structured?.tests || [];
    const abnormal = tests.filter(t => t.flag && t.flag !== 'normal');
    return {
      reply: `You have ${reps.length} processed report(s). Latest: "${lastR.filename}" uploaded ${String(lastR.uploadedAt).slice(0, 10)} — ${tests.length} value(s) extracted${abnormal.length ? `, ${abnormal.length} flagged outside reference range (${abnormal.slice(0, 3).map(t => t.name).join(', ')})` : ', all within reference ranges'}.`,
      links: [{ label: 'View reports', href: '#/reports' }, { label: 'See trends', href: '#/timeline' }],
      chips: ['HbA1c trend', 'Am I at risk?']
    };
  }

  /* risk signals */
  if (/\b(risk|insight|signal|at risk|prevent|screening|specialist|why am i seeing)\b/.test(q)) {
    const ins = getInsights(userId);
    if (!ins.signals.length) {
      return { reply: 'No risk signals yet — signals appear once you add profile details, family history, reports and measurements. They combine those factors using evidence-informed rules.', links: [{ label: 'Add family history', href: '#/family' }], chips: DEFAULT_CHIPS };
    }
    return {
      reply: `Based on your records I currently see ${ins.signals.length} signal(s). Top ones:\n` +
        ins.signals.slice(0, 3).map(s => `• [${s.severity}] ${s.area} — ${s.action || ''}`).join('\n') +
        '\n\nEvery signal lists its contributing factors under "Why am I seeing this?" — these are observations, not diagnoses.',
      links: [{ label: 'All insights & risks', href: '#/insights' }],
      chips: ['HbA1c trend', 'Blood pressure trend']
    };
  }

  /* lifestyle */
  if (/\b(diet|meal|nutrition|calorie|eat|food|water|hydrat|exercise|workout|activity|steps|lifestyle)\b/.test(q)) {
    const prof = objColl('profiles', userId);
    const logs = coll('logs', userId);
    const weightSeries = buildSeries(coll('metrics', userId).filter(m => m.key === 'weight_kg').map(m => ({ date: m.date, value: m.value })));
    const wi = weeklyInsight(logs, weightSeries);
    const bits = [];
    if (prof.weightKg) bits.push(`Hydration target ≈ ${(prof.weightKg * 0.033).toFixed(1)} L/day (from your ${prof.weightKg} kg weight)`);
    if (wi.hasData && (wi.insights || []).length) bits.push(...wi.insights.map(i => `${i.area}: ${i.text}`));
    if (wi.recommendation) bits.push(wi.recommendation);
    if (!bits.length) bits.push('Log exercise, sleep and hydration in the Lifestyle Hub for a few days — then I can summarise your week and adjust plans.');
    return {
      reply: bits.join('\n'),
      links: [{ label: 'Open Lifestyle Hub', href: '#/lifestyle' }],
      chips: ['Weight trend', 'Upcoming reminders']
    };
  }

  /* family history */
  if (/\b(family|hereditar|genetic|father|mother|grandp|sibling|uncle|aunt)\b/.test(q)) {
    const fam = coll('families', userId);
    if (!fam.length) return { reply: 'No family history recorded yet. Adding parents/grandparents conditions lets the risk engine personalise your signals.', links: [{ label: 'Add family history', href: '#/family' }], chips: DEFAULT_CHIPS };
    const condMap = new Map();
    for (const f of fam) for (const c of (f.conditions || [])) {
      const name = c.name || c;
      condMap.set(name, [...(condMap.get(name) || []), f.relation]);
    }
    const lines = [...condMap.entries()].sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5).map(([cond, rels]) => `• ${cond} — ${rels.length} relative(s): ${[...new Set(rels)].join(', ')}`);
    return {
      reply: `Across ${fam.length} recorded relatives:\n${lines.join('\n')}\n\nPatterns here feed your preventive-care signals.`,
      links: [{ label: 'Family history tree', href: '#/family' }],
      chips: ['Am I at risk?', 'My profile basics']
    };
  }

  /* privacy / settings */
  if (/\b(export|download my data|privacy|delete.*account|gdpr|consent|password)\b/.test(q)) {
    return {
      reply: 'Your data rights live in Settings: full JSON export of every record, consent toggles (contacts import, location, sharing), password change and immediate account deletion. All of it is audited.',
      links: [{ label: 'Open Settings & Privacy', href: '#/settings' }],
      chips: DEFAULT_CHIPS
    };
  }

  /* profile basics */
  if (/\b(my profile|how old|my age|blood group|blood type|height|allerg)\b/.test(q)) {
    const p = objColl('profiles', userId);
    const bits = [];
    if (p.dob) bits.push(`Born ${p.dob} (age ${ageFrom(p.dob)})`);
    if (p.sex) bits.push(p.sex);
    if (p.bloodGroup) bits.push(`Blood group ${p.bloodGroup}`);
    if (p.heightCm) bits.push(`${p.heightCm} cm`);
    if (p.weightKg) bits.push(`${p.weightKg} kg`);
    if (p.allergies?.length) bits.push(`Allergies: ${p.allergies.join(', ')}`);
    if (p.conditions?.length) bits.push(`Recorded conditions: ${p.conditions.join(', ')}`);
    return {
      reply: bits.length ? bits.join(' · ') : 'Your profile is mostly empty — fill it in My Profile so guidance can be personalised.',
      links: [{ label: 'My Profile', href: '#/profile' }],
      chips: DEFAULT_CHIPS
    };
  }

  /* specific metric(s)? */
  const wanted = [];
  for (const mp of METRIC_PHRASES) if (mp.re.test(q)) for (const k of mp.keys) if (!wanted.includes(k)) wanted.push(k);

  const allMetrics = coll('metrics', userId);
  let targetKeys = wanted.filter(k => allMetrics.some(m => m.key === k));

  /* generic "trend / how am I doing" → summarise most-tracked metrics */
  if (!targetKeys.length && /\b(trend|over time|improving|worse|doing|health status|summary|summarise|summarize)\b/.test(q)) {
    const counts = new Map();
    for (const m of allMetrics) counts.set(m.key, (counts.get(m.key) || 0) + 1);
    targetKeys = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
  }

  if (targetKeys.length) {
    const lines = [];
    for (const key of targetKeys) {
      const entries = allMetrics.filter(m => m.key === key);
      if (!entries.length) continue;
      const a = analyzeSeries(buildSeries(entries.map(m => ({ date: m.date, value: m.value }))), key);
      if (a.status !== 'ok') continue;
      const unit = entries[0].unit ? ` ${entries[0].unit}` : '';
      const flag = entries[entries.length - 1]?.flag;
      lines.push(`• ${labelOf(key)}: latest ${a.last.value}${unit} (${a.last.date}), ${a.n} reading(s)` +
        (a.direction ? ` — ${a.direction}` : '') +
        (a.suddenChange ? `. ⚠ ${a.suddenDetail}` : '') +
        (flag && flag !== 'normal' ? ` · flagged ${flag}` : ''));
    }
    if (lines.length) {
      return {
        reply: lines.join('\n') + '\n\nValues come straight from your measurements and processed reports — informational, not a diagnosis.',
        links: [{ label: 'Open Timeline', href: '#/timeline' }],
        chips: ['Am I at risk?', 'Latest report', ...DEFAULT_CHIPS.slice(2)]
      };
    }
  }

  /* fallback */
  return {
    reply: 'I couldn\'t map that to your records yet. I understand questions about your metrics (e.g. "HbA1c trend", "blood pressure"), risk signals, reports, reminders, lifestyle and family history.',
    chips: DEFAULT_CHIPS
  };
}

function ageFrom(dob) {
  const d = new Date(dob + 'T00:00:00Z');
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
}
