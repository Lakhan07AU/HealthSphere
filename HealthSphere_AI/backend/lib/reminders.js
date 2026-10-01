import { uid, addDays, todayISO } from './util.js';

/* ---------------- Reminder system (PRD 8.12) ---------------- */

export function createReminder(userId, { title, type = 'health', dueDate, notes = '', source = 'user', repeatable = false }) {
  const r = {
    id: uid('rem'), userId, title: String(title).slice(0, 140), type,
    dueDate: dueDate || addDays(todayISO(), 1),
    notes: String(notes).slice(0, 300),
    status: 'active', source, repeatable,
    createdAt: new Date().toISOString(),
    actionLog: []
  };
  return r;
}

/** Auto-generate reminders from risk signals + data staleness (idempotent by source key). */
export function syncAutoReminders(user, reminders, signals) {
  const existing = new Set(reminders.filter(r => r.source !== 'user').map(r => r.source));
  const add = (key, title, type, days) => {
    if (existing.has(key)) return;
    reminders.push(createReminder(user.id, { title, type, source: key, dueDate: addDays(todayISO(), days) }));
  };
  for (const s of signals) {
    if (s.id === 'metabolic' && s.severity === 'attention') add('auto:hba1c_followup', 'Follow up on HbA1c trend with your doctor', 'health', 10);
    if (s.id === 'cardio' && s.severity !== 'info') add('auto:bp_check', 'Record a blood-pressure reading', 'measurement', 2);
    if (s.id === 'nutrition') add('auto:nutrition_discuss', 'Add vitamin panel to next blood-test discussion', 'screening', 21);
    if (s.id.startsWith('stale_')) add(`auto:${s.id}`, `Update your ${s.factors[0].split(' has ')[0].toLowerCase()} reading`, 'measurement', 3);
  }
  add('auto:weekly_review', 'Weekly health review — check insights & lifestyle plan', 'lifestyle', 7 - ((new Date().getDay() + 6) % 7));
  return reminders;
}

export function reminderAction(reminder, action, payload = {}) {
  const log = { ts: new Date().toISOString(), action };
  switch (action) {
    case 'complete':
      reminder.status = 'completed';
      if (reminder.repeatable) reminder.dueDate = addDays(todayISO(), Number(payload.days || 7));
      break;
    case 'snooze': {
      const days = Math.max(1, Math.min(30, Number(payload.days || 1)));
      reminder.dueDate = addDays(todayISO(), days);
      log.detail = `+${days}d`;
      break;
    }
    case 'reschedule':
      reminder.dueDate = payload.date || addDays(todayISO(), 1);
      break;
    case 'disable':
      reminder.status = 'disabled';
      break;
    default:
      throw new Error('Unknown reminder action');
  }
  reminder.actionLog.push(log);
}
