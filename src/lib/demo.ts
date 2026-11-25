import type { CarbEntry, Dataset, InsulinDose, Reading } from './types';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Post-meal excursion: fast rise, exponential decay. */
function mealEffect(hour: number, at: number, amplitude: number): number {
  const d = hour - at;
  if (d < 0) return 0;
  const rise = 1 - Math.exp(-d * 6);
  const decay = Math.exp(-d / 1.6);
  return amplitude * rise * decay;
}

export function buildDemoDataset(): Dataset {
  const random = mulberry32(20261125);
  const stepMs = 5 * 60 * 1000;
  const end = Math.floor(Date.now() / stepMs) * stepMs;
  const days = 90;
  const start = end - days * 86_400_000 + stepMs;

  const readings: Reading[] = [];
  const insulin: InsulinDose[] = [];
  const carbs: CarbEntry[] = [];
  const hypoDays = new Set([2, 5, 9, 12]);
  const highDays = new Set([1, 4, 8, 11]);

  for (let t = start; t <= end; t += stepMs) {
    const date = new Date(t);
    const hour = date.getHours() + date.getMinutes() / 60;
    const dayIndex = Math.floor((t - start) / 86_400_000);

    if (random() < 0.012) continue; // realistic sensor gaps

    let value = 114 + 9 * Math.sin((hour / 24) * Math.PI * 2 - 1.1);
    if (hour >= 3 && hour <= 8) value += Math.max(0, (hour - 3) / 5) * (12 + (dayIndex % 4) * 7);

    value += mealEffect(hour, 8.2, highDays.has(dayIndex % 14) ? 128 : 96);
    value += mealEffect(hour, 13.0, highDays.has(dayIndex % 14) ? 110 : 78);
    value += mealEffect(hour, 19.3, highDays.has(dayIndex % 14) ? 120 : 88);
    value += mealEffect(hour, 22.2, 28);

    if (hypoDays.has(dayIndex % 14) && hour > 1.9 && hour < 4.7) {
      const g = Math.exp(-((hour - 3.2) ** 2) / (2 * 0.85 * 0.85));
      value -= g * 66;
    }
    if (dayIndex % 30 === 7 && hour > 16.8 && hour < 18.4) {
      value -= Math.exp(-((hour - 17.5) ** 2) / (2 * 0.5 * 0.5)) * 32;
    }

    value += (random() * 2 - 1) * 13;
    value = Math.max(42, Math.min(336, value));

    readings.push({ t, v: Math.round(value), kind: 'cgm' });
  }

  for (let d = 0; d < days; d += 1) {
    const day = new Date(start + d * 86_400_000);
    const at = (hour: number, minute: number) =>
      new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();

    insulin.push({ t: at(8, 5), units: 6 + Math.round(random() * 2), kind: 'rapid' });
    insulin.push({ t: at(12, 40), units: 7 + Math.round(random() * 2), kind: 'rapid' });
    insulin.push({ t: at(19, 10), units: 8 + Math.round(random() * 2), kind: 'rapid' });
    insulin.push({ t: at(22, 15), units: 18, kind: 'long' });

    carbs.push({ t: at(8, 10), grams: 42 + Math.round(random() * 10) });
    carbs.push({ t: at(12, 45), grams: 58 + Math.round(random() * 14) });
    carbs.push({ t: at(19, 20), grams: 62 + Math.round(random() * 16) });
  }

  return {
    readings,
    insulin,
    carbs,
    meta: {
      source: 'Sample data (synthetic)',
      fileName: 'sample-90-days.csv',
      unit: 'mg/dL',
      date: { order: 'DMY', source: 'default', ambiguous: 0, examples: [], conflict: false, uncertain: false },
      time: { absolute: false, utc: false },
    },
  };
}
