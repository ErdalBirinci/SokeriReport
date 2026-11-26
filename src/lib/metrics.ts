import { fmt1, fmtInt } from './format';
import { fmtGlucose, rangeLabel, type GlucoseUnit } from './glucose';
import type { Dataset, Reading } from './types';

export const TARGET_LOW = 70;
export const TARGET_HIGH = 180;
export const VERY_LOW = 54;
export const VERY_HIGH = 250;
export const TIGHT_HIGH = 140;

/** A "cluster" window is only reported with enough lows to be plausible. */
export const HYPO_WINDOW_MIN_READINGS = 3;
export const HYPO_WINDOW_MIN_SHARE = 25;

/** Dawn phenomenon windows (local clock hours, inclusive start / exclusive end). */
export const NIGHT_WINDOW = { start: 0, end: 4 };
export const DAWN_WINDOW = { start: 5, end: 8 };
export const DAWN_THRESHOLD = 20;

export type TargetProfileId = 'standard' | 'pregnancy' | 'pediatric' | 'older';

export interface TargetProfile {
  id: TargetProfileId;
  label: string;
  /** Target range in mg/dL. */
  low: number;
  high: number;
  /** Tight range (time in tight range). */
  tightLow: number;
  tightHigh: number;
  /** Time-below-range goal in percent. */
  lowGoal: number;
}

export const TARGET_PROFILES: Record<TargetProfileId, TargetProfile> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    low: 70,
    high: 180,
    tightLow: 70,
    tightHigh: 140,
    lowGoal: 4,
  },
  pregnancy: {
    id: 'pregnancy',
    label: 'Pregnancy',
    low: 63,
    high: 140,
    tightLow: 63,
    tightHigh: 140,
    lowGoal: 4,
  },
  pediatric: {
    id: 'pediatric',
    label: 'Pediatric',
    low: 70,
    high: 180,
    tightLow: 70,
    tightHigh: 140,
    lowGoal: 4,
  },
  older: {
    id: 'older',
    label: 'Older adults',
    low: 70,
    high: 180,
    tightLow: 70,
    tightHigh: 140,
    lowGoal: 1,
  },
};

export const DEFAULT_PROFILE: TargetProfileId = 'standard';

export const PROFILE_OPTIONS = Object.values(TARGET_PROFILES);

export type GriZone = 'Low' | 'Moderate' | 'High' | 'Very high';

export interface HourBucket {
  hour: number;
  count: number;
  median: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
  hypo: number;
}

export interface DayStat {
  key: string;
  label: string;
  count: number;
  mean: number;
  tir: number;
  low: number;
  high: number;
  min: number;
  max: number;
  cv: number;
}

export interface DawnDay {
  key: string;
  label: string;
  night: number;
  morning: number;
  rise: number;
  flagged: boolean;
  complete: boolean;
}

export interface HypoEvent {
  start: number;
  end: number;
  minutes: number;
  nadir: number;
  /** Nadir below 54 mg/dL: International Consensus level 2 hypoglycemia. */
  level2: boolean;
}

export interface Insight {
  tone: 'good' | 'warn' | 'danger' | 'info';
  title: string;
  body: string;
}

export interface QualityDay {
  key: string;
  label: string;
  coverage: number;
}

export interface Quality {
  gapCount: number;
  longestGapMin: number;
  missingMinutes: number;
  /** Sensor sessions estimated from gaps longer than 2 hours; exports do not carry wear events. */
  sessions: number;
  days: QualityDay[];
}

export interface HypoDay {
  key: string;
  label: string;
  /** Low readings per clock hour, 24 entries. */
  hours: number[];
}

export interface Metrics {
  count: number;
  start: number;
  end: number;
  spanDays: number;
  intervalMin: number;
  coverage: number;
  mean: number;
  sd: number;
  cv: number;
  min: number;
  max: number;
  gmi: number;
  ea1c: number;
  veryLow: number;
  low: number;
  target: number;
  high: number;
  veryHigh: number;
  /** Time in tight range (profile-specific tight range). */
  titrr: number;
  /** Glycemia Risk Index, 0–100. */
  gri: number;
  griZone: GriZone;
  targets: TargetProfile;
  hypoReadings: number;
  hypoEvents: HypoEvent[];
  /** Number of level 2 events (nadir below 54 mg/dL). */
  level2HypoCount: number;
  longestHypoMinutes: number;
  nightHypoShare: number;
  hourly: HourBucket[];
  days: DayStat[];
  /** Best 3-hour window, only meaningful with enough low readings to support the claim. */
  hypoWindow: { start: number; end: number; count: number; share: number; meaningful: boolean };
  hypoByHour: number[];
  hypoMatrix: HypoDay[];
  dawn: {
    eligible: number;
    flagged: number;
    avgRise: number;
    meanNight: number;
    meanMorning: number;
    days: DawnDay[];
  };
  quality: Quality;
  insulinDaily: number | null;
  bolusDaily: number | null;
  basalDaily: number | null;
  carbsDaily: number | null;
  insights: Insight[];
  questions: string[];
}

const percent = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);

const p1 = (n: number): string =>
  n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const mean = (values: number[]): number =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

/**
 * Loop-based extent: `Math.min(...values)` overflows the call stack on long
 * CGM exports (a 90-day one-minute series is ~130,000 readings).
 */
function extent(values: number[]): { min: number; max: number } {
  if (!values.length) return { min: 0, max: 0 };
  let min = values[0];
  let max = values[0];
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

const stdDev = (values: number[], avg: number): number => {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(t: number): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(t));
}

function clock(hour: number): string {
  return `${String(((hour % 24) + 24) % 24).padStart(2, '0')}:00`;
}

function griZone(gri: number): GriZone {
  if (gri < 20) return 'Low';
  if (gri < 40) return 'Moderate';
  if (gri < 60) return 'High';
  return 'Very high';
}

function hourlyProfile(readings: Reading[], low: number): HourBucket[] {
  const buckets: number[][] = Array.from({ length: 24 }, () => []);
  for (const r of readings) buckets[new Date(r.t).getHours()].push(r.v);

  return buckets.map((values, hour) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return {
      hour,
      count: sorted.length,
      median: Math.round(percentile(sorted, 0.5)),
      p5: Math.round(percentile(sorted, 0.05)),
      p25: Math.round(percentile(sorted, 0.25)),
      p75: Math.round(percentile(sorted, 0.75)),
      p95: Math.round(percentile(sorted, 0.95)),
      hypo: sorted.filter((v) => v < low).length,
    };
  });
}

function detectHypoEvents(readings: Reading[], intervalMin: number, low: number): HypoEvent[] {
  const gapTolerance = Math.max(20, intervalMin * 2.5);
  const events: HypoEvent[] = [];
  let start: number | null = null;
  let last: number | null = null;
  let nadir = Number.POSITIVE_INFINITY;

  const close = () => {
    if (start === null || last === null) return;
    const minutes = Math.round((last - start) / 60_000) + intervalMin;
    events.push({ start, end: last, minutes, nadir, level2: nadir < VERY_LOW });
    start = null;
    last = null;
    nadir = Number.POSITIVE_INFINITY;
  };

  for (const r of readings) {
    if (r.v < low) {
      if (start === null) {
        start = r.t;
      } else if (last !== null && (r.t - last) / 60_000 > gapTolerance) {
        close();
        start = r.t;
      }
      last = r.t;
      nadir = Math.min(nadir, r.v);
    } else {
      close();
    }
  }
  close();
  return events;
}

function dailyStats(readings: Reading[], low: number, high: number): DayStat[] {
  const groups = new Map<string, Reading[]>();
  for (const r of readings) {
    const key = dayKey(r.t);
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const days: DayStat[] = [];
  for (const [key, values] of groups) {
    const nums = values.map((v) => v.v);
    const avg = mean(nums);
    const sd = stdDev(nums, avg);
    const { min, max } = extent(nums);
    days.push({
      key,
      label: dayLabel(values[0].t),
      count: nums.length,
      mean: Math.round(avg),
      tir: percent(nums.filter((v) => v >= low && v <= high).length, nums.length),
      low: percent(nums.filter((v) => v < low).length, nums.length),
      high: percent(nums.filter((v) => v > high).length, nums.length),
      min,
      max,
      cv: avg > 0 ? (sd / avg) * 100 : 0,
    });
  }

  return days.sort((a, b) => a.key.localeCompare(b.key));
}

function dawnAnalysis(readings: Reading[]): Metrics['dawn'] {
  const groups = new Map<string, Reading[]>();
  for (const r of readings) {
    const key = dayKey(r.t);
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const days: DawnDay[] = [];
  for (const [key, values] of groups) {
    const nightValues: number[] = [];
    const morningValues: number[] = [];
    for (const r of values) {
      const hour = new Date(r.t).getHours();
      if (hour >= NIGHT_WINDOW.start && hour < NIGHT_WINDOW.end) nightValues.push(r.v);
      if (hour >= DAWN_WINDOW.start && hour < DAWN_WINDOW.end) morningValues.push(r.v);
    }
    const complete = nightValues.length >= 4 && morningValues.length >= 4;
    const night = mean(nightValues);
    const morning = mean(morningValues);
    const rise = morning - night;
    days.push({
      key,
      label: dayLabel(values[0].t),
      night: Math.round(night),
      morning: Math.round(morning),
      rise: complete ? Math.round(rise) : 0,
      flagged: complete && rise >= DAWN_THRESHOLD,
      complete,
    });
  }

  days.sort((a, b) => a.key.localeCompare(b.key));
  const eligibleDays = days.filter((d) => d.complete);

  return {
    eligible: eligibleDays.length,
    flagged: eligibleDays.filter((d) => d.flagged).length,
    avgRise: eligibleDays.length ? mean(eligibleDays.map((d) => d.rise)) : 0,
    meanNight: eligibleDays.length ? mean(eligibleDays.map((d) => d.night)) : 0,
    meanMorning: eligibleDays.length ? mean(eligibleDays.map((d) => d.morning)) : 0,
    days,
  };
}

function dailyTotals<T extends { t: number; amount: number }>(items: T[]): number | null {
  if (!items.length) return null;
  const groups = new Map<string, number>();
  for (const item of items) {
    const key = dayKey(item.t);
    groups.set(key, (groups.get(key) ?? 0) + item.amount);
  }
  return mean([...groups.values()]);
}

function qualityAnalysis(readings: Reading[], intervalMin: number): Quality {
  const gapThreshold = Math.max(20, intervalMin * 2.5);
  let gapCount = 0;
  let longestGapMin = 0;
  let missingMinutes = 0;
  let sessions = 1;

  for (let i = 1; i < readings.length; i += 1) {
    const diff = (readings[i].t - readings[i - 1].t) / 60_000;
    if (diff > gapThreshold) {
      gapCount += 1;
      longestGapMin = Math.max(longestGapMin, Math.round(diff));
      missingMinutes += Math.round(diff - intervalMin);
    }
    if (diff > 120) sessions += 1;
  }

  const groups = new Map<string, Reading[]>();
  for (const r of readings) {
    const key = dayKey(r.t);
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const start = readings[0].t;
  const end = readings[readings.length - 1].t;
  const days: QualityDay[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => {
      const midnight = new Date(values[0].t);
      midnight.setHours(0, 0, 0, 0);
      const from = Math.max(midnight.getTime(), start);
      const to = Math.min(midnight.getTime() + 86_400_000, end);
      const expected = Math.max(1, Math.round((to - from) / 60_000 / intervalMin) + 1);
      return {
        key,
        label: dayLabel(values[0].t),
        coverage: Math.min(100, percent(values.length, expected)),
      };
    });

  return { gapCount, longestGapMin, missingMinutes, sessions, days };
}

function hypoMatrix(readings: Reading[], low: number): HypoDay[] {
  const groups = new Map<string, Reading[]>();
  for (const r of readings) {
    const key = dayKey(r.t);
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => {
      const hours = Array.from({ length: 24 }, () => 0);
      for (const r of values) {
        if (r.v < low) hours[new Date(r.t).getHours()] += 1;
      }
      return { key, label: dayLabel(values[0].t), hours };
    });
}

function buildQuestions(m: Omit<Metrics, 'insights' | 'questions'>, unit: GlucoseUnit): string[] {
  const questions: string[] = [];
  const t = m.targets;

  if (m.dawn.eligible >= 3 && m.dawn.flagged / m.dawn.eligible >= 0.4) {
    questions.push(
      `Night-to-morning glucose rises by ${m.dawn.avgRise >= 0 ? '+' : '−'}${fmtGlucose(Math.abs(m.dawn.avgRise), unit)} ${unit} on ${m.dawn.flagged} of ${m.dawn.eligible} days — should basal timing be reviewed?`,
    );
  }
  if (m.hypoReadings > 0 && m.nightHypoShare >= 35) {
    questions.push(
      `${Math.round(m.nightHypoShare)}% of low readings occur overnight — should overnight alerts and the evening routine be reviewed?`,
    );
  }
  if (m.cv > 36) {
    questions.push(
      `CV is ${Math.round(m.cv)}%, above the 36% threshold — which meals or doses drive the largest swings?`,
    );
  }
  if (m.coverage < 70) {
    questions.push(
      `CGM was active ${Math.round(m.coverage)}% of the time — can wear time be improved before the next review?`,
    );
  }
  if (m.high + m.veryHigh > 25) {
    questions.push(
      `Time above ${fmtGlucose(t.high, unit)} ${unit} is ${Math.round(m.high + m.veryHigh)}% — are pre-meal doses and carbohydrate counting aligned?`,
    );
  }
  if (m.longestHypoMinutes >= 60) {
    questions.push(
      `The longest low lasted ${m.longestHypoMinutes} minutes — should the hypoglycemia plan be reviewed?`,
    );
  }

  return questions.slice(0, 3);
}

function buildInsights(
  m: Omit<Metrics, 'insights' | 'questions'>,
  unit: GlucoseUnit,
): Insight[] {
  const out: Insight[] = [];
  const t = m.targets;
  const lowTotal = m.low + m.veryLow;
  const highTotal = m.high + m.veryHigh;

  if (m.target >= 70) {
    out.push({
      tone: 'good',
      title: `Time in range ${p1(m.target)}%`,
      body: `TIR is above the 70% target: ${p1(m.target)}% of ${fmtInt(m.count)} readings are within ${rangeLabel(t.low, t.high, unit)}.`,
    });
  } else if (m.target >= 50) {
    out.push({
      tone: 'warn',
      title: `Time in range ${p1(m.target)}%`,
      body: 'TIR is below the recommended 70% target. Review post-meal peaks and basal settings.',
    });
  } else {
    out.push({
      tone: 'danger',
      title: `Time in range ${p1(m.target)}%`,
      body: 'Glycemic control is clearly outside the target. Reassessing the treatment plan is recommended.',
    });
  }

  if (m.veryLow > 1) {
    out.push({
      tone: 'danger',
      title: `Level 2 hypoglycemia ${p1(m.veryLow)}%`,
      body: `Readings below ${fmtGlucose(VERY_LOW, unit)} ${unit} exceed the <1% target; ${m.level2HypoCount} level 2 ${m.level2HypoCount === 1 ? 'event' : 'events'} recorded.`,
    });
  } else if (lowTotal > t.lowGoal) {
    out.push({
      tone: 'warn',
      title: `Hypoglycemia burden ${p1(lowTotal)}%`,
      body: `Time below ${fmtGlucose(t.low, unit)} ${unit} is above the ${t.lowGoal}% target. Review insulin doses and overnight safety.`,
    });
  } else {
    out.push({
      tone: 'good',
      title: `Hypoglycemia ${p1(lowTotal)}%`,
      body: `Time below ${fmtGlucose(t.low, unit)} ${unit} is within target; ${m.hypoEvents.length} separate low ${m.hypoEvents.length === 1 ? 'event' : 'events'}, longest ${m.longestHypoMinutes} min.`,
    });
  }

  if (m.cv > 36) {
    out.push({
      tone: 'warn',
      title: `High variability (CV ${Math.round(m.cv)}%)`,
      body: 'CV is above the 36% threshold: fluctuations are pronounced. Review basal-bolus matching and meal timing.',
    });
  } else {
    out.push({
      tone: 'good',
      title: `Stable variability (CV ${Math.round(m.cv)}%)`,
      body: 'CV is below the 36% threshold; glycemic fluctuation is under control.',
    });
  }

  if (m.dawn.eligible >= 3 && m.dawn.flagged / m.dawn.eligible >= 0.4) {
    const allDays = m.dawn.flagged === m.dawn.eligible;
    out.push({
      tone: 'warn',
      title: allDays
        ? `Dawn phenomenon on every day (${m.dawn.flagged}/${m.dawn.eligible})`
        : `Dawn phenomenon on ${m.dawn.flagged} of ${m.dawn.eligible} ${m.dawn.eligible === 1 ? 'day' : 'days'}`,
      body: `Night (00–04) mean ${fmtGlucose(m.dawn.meanNight, unit)} ${unit}, morning (05–08) mean ${fmtGlucose(m.dawn.meanMorning, unit)} ${unit}; mean rise ${m.dawn.avgRise >= 0 ? '+' : '−'}${fmtGlucose(Math.abs(m.dawn.avgRise), unit)} ${unit}.`,
    });
  } else if (m.dawn.eligible >= 3) {
    const diff = Math.round(m.dawn.avgRise);
    out.push({
      tone: 'good',
      title: 'No pronounced dawn rise',
      body: `The difference between night (00–04) and morning (05–08) means is ${diff >= 0 ? '+' : '−'}${fmtGlucose(Math.abs(diff), unit)} ${unit} (below the +${fmtGlucose(DAWN_THRESHOLD, unit)} ${unit} threshold).`,
    });
  }

  if (m.hypoWindow.meaningful) {
    const overnight = m.hypoWindow.start >= 22 || m.hypoWindow.start < 6;
    out.push({
      tone: overnight ? 'warn' : 'info',
      title: `Hypoglycemia cluster ${clock(m.hypoWindow.start)}–${clock(m.hypoWindow.end)}`,
      body: `${Math.round(m.hypoWindow.share)}% of the ${m.hypoReadings} low readings fall in this 3-hour window (n=${m.hypoWindow.count}); night share ${Math.round(m.nightHypoShare)}%.`,
    });
  }

  if (m.coverage < 70) {
    out.push({
      tone: 'info',
      title: `Sensor coverage ${Math.round(m.coverage)}%`,
      body: `${Math.round(100 - m.coverage)}% of expected readings are missing. Interpret results with caution; 14 days and >70% coverage are the minimum for a standard AGP.`,
    });
  }

  if (highTotal > 25) {
    out.push({
      tone: 'warn',
      title: `Time above range ${p1(highTotal)}%`,
      body: `Time above ${fmtGlucose(t.high, unit)} ${unit} is over the 25% target. Review pre-meal values and carbohydrate counting.`,
    });
  }

  if (m.longestHypoMinutes >= 60) {
    out.push({
      tone: 'danger',
      title: `${m.longestHypoMinutes}-minute prolonged hypoglycemia`,
      body: 'Prolonged low episodes pose an overnight safety risk; review alert thresholds and overnight insulin.',
    });
  }

  const sortedTones = { danger: 0, warn: 1, info: 2, good: 3 } as const;
  return out.sort((a, b) => sortedTones[a.tone] - sortedTones[b.tone]).slice(0, 6);
}

export interface ComputeOptions {
  profile?: TargetProfileId;
  unit?: GlucoseUnit;
}

export function computeMetrics(dataset: Dataset, options: ComputeOptions = {}): Metrics {
  const targets = TARGET_PROFILES[options.profile ?? DEFAULT_PROFILE];
  const unit: GlucoseUnit = options.unit ?? 'mg/dL';
  const readings = dataset.readings;
  const values = readings.map((r) => r.v);
  const count = values.length;

  const avg = mean(values);
  const sd = stdDev(values, avg);
  const cv = avg > 0 ? (sd / avg) * 100 : 0;

  const diffs: number[] = [];
  for (let i = 1; i < readings.length; i += 1) {
    const diff = (readings[i].t - readings[i - 1].t) / 60_000;
    if (diff > 0.5 && diff < 120) diffs.push(diff);
  }
  diffs.sort((a, b) => a - b);
  const intervalMin = diffs.length ? Math.max(1, Math.round(percentile(diffs, 0.5))) : 5;

  const start = readings[0].t;
  const end = readings[readings.length - 1].t;
  const spanMinutes = (end - start) / 60_000;
  const expected = spanMinutes / intervalMin + 1;
  const coverage = Math.min(100, percent(count, expected));

  const veryLowCount = values.filter((v) => v < VERY_LOW).length;
  const lowCount = values.filter((v) => v >= VERY_LOW && v < targets.low).length;
  const targetCount = values.filter((v) => v >= targets.low && v <= targets.high).length;
  const highCount = values.filter((v) => v > targets.high && v <= VERY_HIGH).length;
  const veryHighCount = values.filter((v) => v > VERY_HIGH).length;
  const tightCount = values.filter((v) => v >= targets.tightLow && v <= targets.tightHigh).length;

  const veryLowPct = percent(veryLowCount, count);
  const lowPct = percent(lowCount, count);
  const veryHighPct = percent(veryHighCount, count);
  const highPct = percent(highCount, count);
  const gri = Math.min(100, 3.0 * veryLowPct + 2.4 * lowPct + 0.8 * veryHighPct + 0.5 * highPct);

  const hypoEvents = detectHypoEvents(readings, intervalMin, targets.low);
  const longestHypoMinutes = hypoEvents.reduce((max, e) => Math.max(max, e.minutes), 0);
  const level2HypoCount = hypoEvents.filter((e) => e.level2).length;

  const hourly = hourlyProfile(readings, targets.low);
  const hypoByHour = hourly.map((h) => h.hypo);
  const hypoReadings = hypoByHour.reduce((a, b) => a + b, 0);
  const nightHypo = hypoByHour.slice(0, 6).reduce((a, b) => a + b, 0);

  let windowStart = 0;
  let windowCount = -1;
  for (let s = 0; s < 24; s += 1) {
    let sum = 0;
    for (let k = 0; k < 3; k += 1) sum += hypoByHour[(s + k) % 24];
    if (sum > windowCount) {
      windowCount = sum;
      windowStart = s;
    }
  }
  // A sliding window can start before the first low of the cluster; report the
  // window from the first hour that actually has low readings.
  for (let step = 0; step < 2; step += 1) {
    if (hypoByHour[((windowStart % 24) + 24) % 24] > 0) break;
    windowStart = (windowStart + 1) % 24;
  }

  const windowCountSafe = Math.max(0, windowCount);
  const windowShare = percent(windowCountSafe, hypoReadings);
  const windowMeaningful =
    hypoReadings >= HYPO_WINDOW_MIN_READINGS && windowShare >= HYPO_WINDOW_MIN_SHARE;
  const { min, max } = extent(values);

  const dawn = dawnAnalysis(readings);
  const days = dailyStats(readings, targets.low, targets.high);
  const quality = qualityAnalysis(readings, intervalMin);
  const hypoMatrixData = hypoMatrix(readings, targets.low);

  const rapid = dataset.insulin.filter((d) => d.kind === 'rapid').map((d) => ({ t: d.t, amount: d.units }));
  const basal = dataset.insulin.filter((d) => d.kind === 'long').map((d) => ({ t: d.t, amount: d.units }));
  const carbs = dataset.carbs.map((c) => ({ t: c.t, amount: c.grams }));
  const rapidTotal = dailyTotals(rapid);
  const basalTotal = dailyTotals(basal);

  const core: Omit<Metrics, 'insights' | 'questions'> = {
    count,
    start,
    end,
    spanDays: (end - start) / 86_400_000,
    intervalMin,
    coverage,
    mean: avg,
    sd,
    cv,
    min,
    max,
    gmi: 3.31 + 0.02392 * avg,
    ea1c: (avg + 46.7) / 28.7,
    veryLow: veryLowPct,
    low: lowPct,
    target: percent(targetCount, count),
    high: highPct,
    veryHigh: veryHighPct,
    titrr: percent(tightCount, count),
    gri,
    griZone: griZone(gri),
    targets,
    hypoReadings,
    hypoEvents,
    level2HypoCount,
    longestHypoMinutes,
    nightHypoShare: hypoReadings > 0 ? percent(nightHypo, hypoReadings) : 0,
    hourly,
    days,
    hypoWindow: {
      start: windowStart,
      end: (windowStart + 3) % 24,
      count: windowMeaningful ? windowCountSafe : 0,
      share: windowMeaningful ? windowShare : 0,
      meaningful: windowMeaningful,
    },
    hypoByHour,
    hypoMatrix: hypoMatrixData,
    dawn,
    quality,
    insulinDaily: rapidTotal !== null || basalTotal !== null ? (rapidTotal ?? 0) + (basalTotal ?? 0) : null,
    bolusDaily: rapidTotal,
    basalDaily: basalTotal,
    carbsDaily: dailyTotals(carbs),
  };

  return {
    ...core,
    insights: buildInsights(core, unit),
    questions: buildQuestions(core, unit),
  };
}
