import { fmtDate } from './util.js';

/* ---------------- Health timeline (PRD 8.8) ---------------- */

const TYPE_META = {
  report: { label: 'Report' },
  metric: { label: 'Measurement' },
  family: { label: 'Family history' },
  lifestyle: { label: 'Lifestyle' },
  reminder: { label: 'Follow-up' },
  profile: { label: 'Profile' },
  careteam: { label: 'Care team' }
};

export function buildTimeline({ reports = [], metrics = [], family = [], logs = [], reminders = [], doctors = [] }) {
  const events = [];
  for (const r of reports) {
    events.push({
      id: r.id, date: r.uploadedAt?.slice(0, 10), type: 'report',
      title: r.structured?.tests?.length ? `Medical report processed · ${r.structured.tests.length} values extracted` : 'Medical report uploaded',
      detail: `${r.filename}${r.structured?.labName ? ' · ' + r.structured.labName : ''}${r.structured?.reportDate ? ' · report dated ' + fmtDate(r.structured.reportDate) : ''}`
    });
  }
  for (const m of metrics) {
    events.push({
      id: m.id, date: m.date, type: 'metric',
      title: m.label || `${m.key.replace(/_/g, ' ')} recorded`,
      detail: `${m.value} ${m.unit || ''}${m.source && m.source !== 'manual' ? ' (from report)' : ''}`.trim()
    });
  }
  for (const f of family) {
    events.push({
      id: f.id, date: f.recordedAt?.slice(0, 10) || today(), type: 'family',
      title: `Family history added: ${f.name} (${f.relation})`,
      detail: (f.conditions || []).map(c => c.name + (c.diagAge ? ` (dx ~${c.diagAge})` : '')).join(', ') || 'No conditions recorded'
    });
  }
  for (const l of logs) {
    const labels = {
      exercise_minutes: ['Exercise logged', 'min'], sleep_hours: ['Sleep logged', 'h'],
      hydration_liters: ['Hydration logged', 'L'], mood_score: ['Wellbeing check-in', '/5'], weight_kg: ['Weight logged', 'kg']
    };
    const [t, u] = labels[l.type] || [l.type, ''];
    events.push({ id: l.id, date: l.date, type: 'lifestyle', title: t, detail: `${l.value} ${u}` });
  }
  for (const r of reminders) {
    if (r.status === 'completed') events.push({ id: r.id, date: r.actionLog?.at(-1)?.ts?.slice(0, 10), type: 'reminder', title: `Completed: ${r.title}`, detail: '' });
  }
  for (const d of doctors) {
    events.push({ id: d.id, date: d.addedAt?.slice(0, 10) || today(), type: 'careteam', title: `Care team updated: ${d.name}`, detail: d.specialty || d.role || '' });
  }
  return events
    .filter(e => e.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function today() { return new Date().toISOString().slice(0, 10); }

export { TYPE_META };
