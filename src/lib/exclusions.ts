import type { Dataset, Reading } from './types';

/** Stable identity for a reading; the parser already collapses duplicate times. */
export function readingKey(reading: Reading): string {
  return `${reading.t}|${reading.kind}|${reading.v}`;
}

export function applyExclusions(dataset: Dataset, excluded: ReadonlySet<string>): Dataset {
  if (excluded.size === 0) return dataset;
  const readings = dataset.readings.filter((reading) => !excluded.has(readingKey(reading)));
  if (readings.length === dataset.readings.length) return dataset;
  return { ...dataset, readings };
}

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
