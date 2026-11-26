import type { Dataset } from './types';

export interface MergeResult {
  dataset: Dataset;
  /** Readings from the incoming file that were new. */
  added: number;
  /** Readings dropped because the timestamp already existed. */
  duplicates: number;
}

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

/**
 * Merge a second export into the current one. Readings are always in mg/dL, so
 * files printed in mmol/L combine safely; an exact timestamp keeps the existing
 * reading unless the incoming one is a CGM value and the existing is a scan.
 */
export function mergeDatasets(base: Dataset, incoming: Dataset): MergeResult {
  const byTime = new Map<number, Dataset['readings'][number]>();
  for (const reading of base.readings) byTime.set(reading.t, reading);
  let added = 0;
  let duplicates = 0;

  for (const reading of incoming.readings) {
    const current = byTime.get(reading.t);
    if (!current) {
      byTime.set(reading.t, reading);
      added += 1;
    } else {
      duplicates += 1;
      if (reading.kind === 'cgm' && current.kind !== 'cgm') byTime.set(reading.t, reading);
    }
  }

  const insulin = new Map<string, Dataset['insulin'][number]>();
  for (const dose of [...base.insulin, ...incoming.insulin]) {
    insulin.set(`${dose.t}|${dose.kind}|${dose.units}`, dose);
  }
  const carbs = new Map<string, Dataset['carbs'][number]>();
  for (const entry of [...base.carbs, ...incoming.carbs]) {
    carbs.set(`${entry.t}|${entry.grams}`, entry);
  }

  const files = unique([
    ...(base.meta.files ?? [base.meta.fileName]),
    ...(incoming.meta.files ?? [incoming.meta.fileName]),
  ]);
  const sources = unique([base.meta.source, incoming.meta.source]);
  const dateUncertain = base.meta.date.uncertain || incoming.meta.date.uncertain;

  return {
    added,
    duplicates,
    dataset: {
      readings: [...byTime.values()].sort((a, b) => a.t - b.t),
      insulin: [...insulin.values()].sort((a, b) => a.t - b.t),
      carbs: [...carbs.values()].sort((a, b) => a.t - b.t),
      meta: {
        ...base.meta,
        source: sources.join(' + '),
        fileName: files.length > 1 ? `${files.length} files: ${files.join(', ')}` : base.meta.fileName,
        files,
        date: {
          ...base.meta.date,
          ambiguous: base.meta.date.ambiguous + incoming.meta.date.ambiguous,
          conflict: base.meta.date.conflict || incoming.meta.date.conflict,
          uncertain: dateUncertain,
        },
        time: {
          absolute: base.meta.time.absolute && incoming.meta.time.absolute,
          utc: base.meta.time.utc || incoming.meta.time.utc,
        },
      },
    },
  };
}
