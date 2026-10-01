import { bmi, bmiCategory, round, mean } from './util.js';

/* ============================================================
   MODEL 4 — LIFESTYLE AI
   Activity plans · nutrition plans · weekly insights.
   Safety-first: adapts to conditions and always recommends
   professional guidance where medical context exists.
   ============================================================ */

export function generateActivityPlan(profile, signals = []) {
  const level = profile.lifestyle?.activityLevel || 'light';
  const userBmi = bmi(profile.heightCm, profile.weightKg);
  const caution = signals.some(s => ['cardio', 'metabolic'].includes(s.id) && s.severity === 'attention');
  const weeks = [];

  const base = level === 'sedentary' ? { walk: 15, mobility: 8, strength: 0 }
    : level === 'light' ? { walk: 20, mobility: 10, strength: 10 }
    : level === 'moderate' ? { walk: 30, mobility: 10, strength: 20 }
    : { walk: 35, mobility: 12, strength: 25 };

  const goalLine = (profile.goals && profile.goals[0]) || 'Build consistent activity';

  for (let w = 0; w < 4; w++) {
    const scale = 1 + w * 0.15;
    weeks.push({
      week: w + 1,
      focus: w === 0 ? 'Build consistent activity' : w === 3 ? 'Consolidate the habit' : 'Gradual progression',
      items: [
        { name: 'Brisk walking', detail: `${Math.round(base.walk * scale)} minutes × ${w === 0 ? 4 : 5} days` },
        { name: 'Mobility & stretching', detail: `${Math.round(base.mobility * scale)} minutes × 3 days` },
        ...(base.strength ? [{ name: 'Bodyweight strength', detail: `${Math.round(base.strength * scale)} minutes × ${w >= 2 ? 3 : 2} days` }] : [])
      ]
    });
  }

  const notes = [];
  notes.push('Start each session gently; stop if you feel unwell.');
  if (caution) notes.push('Because your profile includes cardiovascular/metabolic risk signals, review this plan with a healthcare professional before increasing intensity.');
  if (userBmi && userBmi >= 30) notes.push('Low-impact options (walking, cycling, swimming) are especially joint-friendly at higher BMI.');
  notes.push('This is general guidance, not medical advice — adjust with professional input where relevant.');

  return { generatedAt: new Date().toISOString(), goal: goalLine, weeklyTargetMinutes: Math.round((base.walk * 5 + base.mobility * 3 + base.strength * 2)), weeks, safetyNotes: notes };
}

export const MEALS = {
  vegetarian: {
    breakfast: [['Oats with milk, banana & nuts', '~350 kcal'], ['Vegetable poha/upma + curd', '~320 kcal'], ['Besan chilla with mint chutney', '~300 kcal'], ['Whole-grain toast, peanut butter & fruit', '~330 kcal'], ['Idli + sambar', '~300 kcal'], ['Greek yogurt bowl with seeds & berries', '~340 kcal'], ['Sprouts salad + buttermilk', '~290 kcal']],
    lunch: [['Rajma + brown rice + salad', '~520 kcal'], ['Paneer bhurji + 2 rotis + veggies', '~540 kcal'], ['Dal tadka + rice + bhindi', '~500 kcal'], ['Chole + rice + cucumber salad', '~530 kcal'], ['Veg pulao + raita', '~510 kcal'], ['Mixed-dal khichdi + kadhi', '~480 kcal'], ['Soya chunks curry + rotis', '~540 kcal']],
    dinner: [['Phulka + palak paneer + salad', '~450 kcal'], ['Moong dal + lauki sabzi + roti', '~420 kcal'], ['Vegetable soup + grilled paneer', '~380 kcal'], ['Egg-less veg fried rice (less oil)', '~430 kcal'], ['Tofu stir-fry + quinoa', '~440 kcal'], ['Masoor dal + bhindi + roti', '~430 kcal'], ['Light khichdi + curd', '~400 kcal']]
  },
  nonveg: {
    breakfast: [['Egg omelette + whole-grain toast', '~340 kcal'], ['Boiled eggs + fruit bowl', '~310 kcal'], ['Chicken keema paratha (less oil)', '~400 kcal'], ['Grilled chicken sandwich', '~370 kcal'], ['Curd + muesli + boiled egg', '~350 kcal'], ['Fish patty + salad', '~330 kcal'], ['Egg bhurji + roti', '~360 kcal']],
    lunch: [['Grilled chicken + rice + salad', '~550 kcal'], ['Fish curry + brown rice', '~520 kcal'], ['Chicken tikka + rotis + veggies', '~540 kcal'], ['Prawn masala + rice', '~500 kcal'], ['Mutton curry (lean) + roti', '~580 kcal'], ['Chicken pulao + raita', '~560 kcal'], ['Egg curry + rice + salad', '~510 kcal']],
    dinner: [['Clear chicken soup + grilled fish', '~420 kcal'], ['Tandoori chicken + sautéed veggies', '~450 kcal'], ['Fish moilee + light rice', '~440 kcal'], ['Egg-white curry + roti', '~380 kcal'], ['Chicken stew + appam', '~460 kcal'], ['Grilled salmon + greens', '~430 kcal'], ['Lean kebab + salad + roti', '~410 kcal']]
  },
  vegan: {
    breakfast: [['Oats + soy milk + chia', '~330 kcal'], ['Tofu scramble + toast', '~340 kcal'], ['Poha with peanuts', '~310 kcal'], ['Smoothie bowl (soy yogurt)', '~320 kcal'], ['Idli + sambar (no ghee)', '~290 kcal'], ['Peanut butter toast + fruit', '~330 kcal'], ['Sprout poha', '~300 kcal']],
    lunch: [['Rajma + brown rice + salad', '~520 kcal'], ['Tofu curry + rotis', '~530 kcal'], ['Dal + rice + veggies', '~490 kcal'], ['Chole + rice', '~510 kcal'], ['Soya pulao + salad', '~500 kcal'], ['Peanut-curry + rice', '~530 kcal'], ['Millet khichdi', '~470 kcal']],
    dinner: [['Tofu stir-fry + quinoa', '~430 kcal'], ['Masoor dal + roti + veggies', '~420 kcal'], ['Vegan khichdi + soup', '~390 kcal'], ['Chickpea salad wrap', '~400 kcal'], ['Soya chunk curry + roti', '~440 kcal'], ['Veg clear soup + grilled tofu', '~360 kcal'], ['Dal + lauki sabzi + roti', '~410 kcal']]
  }
};

export function generateNutritionPlan(profile, signals = []) {
  const pref = MEALS[profile.foodPreference] ? profile.foodPreference
    : String(profile.lifestyle?.dietPreference || 'vegetarian').includes('nonveg') || String(profile.lifestyle?.dietPreference || '').includes('egg')
      ? 'nonveg' : 'vegetarian';
  const allergies = (profile.allergies || []).map(a => a.toLowerCase());
  const restrictions = (profile.restrictions || []).map(a => a.toLowerCase());

  const weight = Number(profile.weightKg) || null;
  const height = Number(profile.heightCm) || null;
  const age = profile.dob ? Math.floor((Date.now() - new Date(profile.dob)) / (365.25 * 24 * 3600 * 1000)) : 30;
  const sex = String(profile.sex || 'male').toLowerCase();
  const activity = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }[profile.lifestyle?.activityLevel || 'light'] || 1.375;
  let tdee = null;
  if (weight && height) {
    const bmr = sex === 'female' ? 10 * weight + 6.25 * height - 5 * age - 161 : 10 * weight + 6.25 * height - 5 * age + 5;
    tdee = Math.round(bmr * activity);
  }
  const goal = profile.goals?.find(g => /lose|weight/i.test(g)) ? 'loss' : profile.goals?.find(g => /gain|muscle/i.test(g)) ? 'gain' : 'maintain';
  const target = tdee ? (goal === 'loss' ? tdee - 400 : goal === 'gain' ? tdee + 300 : tdee) : null;

  const menu = MEALS[pref];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekPlan = days.map((d, i) => ({
    day: d,
    breakfast: filterMeal(menu.breakfast[i % 7], allergies, restrictions),
    lunch: filterMeal(menu.lunch[i % 7], allergies, restrictions),
    dinner: filterMeal(menu.dinner[i % 7], allergies, restrictions),
    snacks: 'Fruit / handful of nuts / buttermilk'
  }));

  const notes = [];
  for (const a of allergies) notes.push(`Excluding suggestions containing “${a}” due to your recorded allergy.`);
  for (const r of restrictions) notes.push(`Respecting your dietary restriction: ${r}.`);
  if (signals.some(s => ['metabolic', 'cardio'].includes(s.id) && s.severity !== 'info')) notes.push('Given your risk signals, favouring high-fibre carbohydrates, less added sugar and lower-salt cooking supports the guidance you receive clinically.');
  notes.push('Portion guide: half the plate vegetables, a quarter protein, a quarter whole grains.');
  notes.push('AI-generated nutrition ideas are educational — not medical nutrition therapy.');

  const hydration = weight ? `${Math.min(4, Math.max(2, round(weight * 33 / 1000, 1)))} L/day` : '2–2.5 L/day';
  return {
    generatedAt: new Date().toISOString(),
    preference: pref,
    estimatedDailyCalories: target,
    tdeeEstimate: tdee,
    goal,
    hydrationTarget: hydration,
    weekPlan,
    notes
  };
}

function filterMeal([name, kcal], allergies, restrictions) {
  let n = name.toLowerCase();
  for (const a of [...allergies, ...restrictions]) {
    if (!a) continue;
    const swaps = {
      peanut: ['sunflower-seed butter', 'roasted chana'], milk: ['soy milk'], dairy: ['soy alternative'], egg: ['tofu'],
      gluten: ['millet roti'], fish: ['paneer/tofu'], shrimp: ['paneer'], 'tree nut': ['pumpkin seeds'], soy: ['paneer/legumes']
    };
    const key = Object.keys(swaps).find(k => n.includes(k) && a.includes(k.split(' ')[0]));
    if (key) n = n.replace(key, swaps[key][0]);
  }
  return [titleCase(n), kcal];
}
function titleCase(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }

export function getMealAlternatives(pref, slot, currentMealName) {
  const menu = MEALS[pref] || MEALS.vegetarian;
  const pool = menu[slot] || [];
  return pool
    .filter(([name]) => name.toLowerCase() !== (currentMealName || '').toLowerCase())
    .map(([name, kcal]) => ({ name: titleCase(name), kcal }));
}

export function swapMeal(pref, slot, fromIndex, toIndex) {
  const menu = MEALS[pref] || MEALS.vegetarian;
  const pool = menu[slot] || [];
  if (toIndex < 0 || toIndex >= pool.length) return null;
  const target = pool[toIndex];
  return { name: titleCase(target[0]), kcal: target[1] };
}

/** Weekly lifestyle insight: compare last 7 days vs previous 7. */
export function weeklyInsight(logs = [], weightSeries = []) {
  const now = Date.now();
  const within = (iso, from, to) => { const t = new Date(iso).getTime(); return t >= from && t < to; };
  const curFrom = now - 7 * 86400000, prevFrom = now - 14 * 86400000;
  const pick = (from, to, type) => logs.filter(l => l.type === type && within(l.date, from, to));
  const sum = arr => arr.reduce((a, b) => a + Number(b.value || 0), 0);
  const avg = arr => (arr.length ? mean(arr.map(x => Number(x.value))) : null);

  const exCur = sum(pick(curFrom, now, 'exercise_minutes'));
  const exPrev = sum(pick(prevFrom, curFrom, 'exercise_minutes'));
  const slCur = avg(pick(curFrom, now, 'sleep_hours'));
  const slPrev = avg(pick(prevFrom, curFrom, 'sleep_hours'));
  const hyCur = avg(pick(curFrom, now, 'hydration_liters'));
  const moodCur = avg(pick(curFrom, now, 'mood_score'));

  const insights = [];
  if (exPrev || exCur) {
    const pct = exPrev ? Math.round(((exCur - exPrev) / exPrev) * 100) : null;
    insights.push({ area: 'Exercise', text: pct === null ? `${exCur} min this week` : `${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct)}% vs last week (${exPrev} to ${exCur} min)`, good: pct === null ? true : pct >= 0 });
  }
  if (slCur != null) insights.push({ area: 'Sleep', text: `${slCur.toFixed(1)} h/night avg${slPrev != null ? (slCur >= slPrev ? ' · stable/slightly better' : ' · slightly lower than last week') : ''}`, good: slCur >= 6.5 });
  if (hyCur != null) insights.push({ area: 'Hydration', text: `${hyCur.toFixed(1)} L/day avg`, good: hyCur >= 2 });
  if (moodCur != null) insights.push({ area: 'Self-reported wellbeing', text: `${moodCur.toFixed(1)}/5 avg`, good: moodCur >= 3.5 });

  const w = weightSeries;
  let weightLine = null;
  if (w.length >= 2) {
    const d = round(w.at(-1).value - w.at(-2).value, 1);
    weightLine = { area: 'Weight', text: `${d === 0 ? 'Stable' : (d > 0 ? '+' : '') + d + ' kg'} since last entry`, good: Math.abs(d) <= 1 };
    insights.push(weightLine);
  }

  const rec = [];
  if ((exCur ?? 0) < 150) rec.push('Aim to build toward ~150 minutes of gentle activity per week — consistency beats intensity.');
  else rec.push('Maintain current activity consistency.');
  if (slCur != null && slCur < 6.5) rec.push('Try shifting bedtime 20–30 minutes earlier this week.');
  if (hyCur != null && hyCur < 2) rec.push('Keep a water bottle at your desk to nudge hydration.');

  return { generatedAt: new Date().toISOString(), insights, recommendation: rec.join(' '), hasData: logs.length > 0 };
}
