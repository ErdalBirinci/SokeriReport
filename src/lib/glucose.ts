import { fmt1, fmtInt } from './format';

export type GlucoseUnit = 'mg/dL' | 'mmol/L';

export const MGDL_PER_MMOL = 18.0182;

export const UNIT_OPTIONS: GlucoseUnit[] = ['mg/dL', 'mmol/L'];

export const toDisplay = (mgdl: number, unit: GlucoseUnit): number =>
  unit === 'mmol/L' ? mgdl / MGDL_PER_MMOL : mgdl;

/** Format a glucose value in the selected display unit (no unit suffix). */
export const fmtGlucose = (mgdl: number, unit: GlucoseUnit): string =>
  unit === 'mmol/L' ? fmt1(mgdl / MGDL_PER_MMOL) : fmtInt(mgdl);

/** Format a signed glucose difference in the selected display unit. */
export const fmtGlucoseDelta = (mgdl: number, unit: GlucoseUnit): string => {
  const value = unit === 'mmol/L' ? fmt1(Math.abs(mgdl) / MGDL_PER_MMOL) : fmtInt(Math.abs(mgdl));
  return `${mgdl >= 0 ? '+' : '−'}${value}`;
};

/** "70–180 mg/dL" or "3.9–10.0 mmol/L". */
export const rangeLabel = (low: number, high: number, unit: GlucoseUnit): string =>
  `${fmtGlucose(low, unit)}–${fmtGlucose(high, unit)} ${unit}`;
