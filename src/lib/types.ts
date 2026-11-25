export type ReadingKind = 'cgm' | 'scan' | 'bg';

export interface Reading {
  /** Epoch milliseconds (local device time). */
  t: number;
  /** Glucose value, always normalised to mg/dL. */
  v: number;
  kind: ReadingKind;
}

export interface InsulinDose {
  t: number;
  units: number;
  kind: 'rapid' | 'long';
}

export interface CarbEntry {
  t: number;
  grams: number;
}

export type DateOrder = 'DMY' | 'MDY';

export interface DateMeta {
  /** Order actually used to read the file. */
  order: DateOrder;
  /** Where the order came from: inferred from unambiguous dates, fallback, or the user. */
  source: 'detected' | 'default' | 'override';
  /** Dates where both day-first and month-first readings are valid. */
  ambiguous: number;
  /** Up to three raw examples of ambiguous dates. */
  examples: string[];
  /** File contains both day-first and month-first evidence. */
  conflict: boolean;
  /** Order is genuinely unresolved (no evidence or contradictory evidence). */
  uncertain: boolean;
  /** First parseable date value, shown next to the format label. */
  sample?: string;
}

export interface TimeMeta {
  /** Timestamps are absolute instants (epoch / UTC), not wall-clock strings. */
  absolute: boolean;
  /** Source carried an explicit UTC or numeric-offset marker. */
  utc: boolean;
}

export interface DatasetMeta {
  source: string;
  fileName: string;
  /** Unit found in the source file — readings are converted to mg/dL regardless. */
  unit: 'mg/dL' | 'mmol/L';
  date: DateMeta;
  time: TimeMeta;
}

export interface Dataset {
  readings: Reading[];
  insulin: InsulinDose[];
  carbs: CarbEntry[];
  meta: DatasetMeta;
}

export type ParseOutcome =
  | { ok: true; dataset: Dataset; warnings: string[] }
  | { ok: false; error: string };
