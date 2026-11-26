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
  /** Every source file when several exports were merged. */
  files?: string[];
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

export interface ParseDiagnosticRemoval {
  label: string;
  count: number;
}

/** What the importer read, and where candidate rows were dropped. */
export interface ParseDiagnostics {
  /** Candidate rows or PDF table rows found. */
  rows: number;
  /** Candidate rows with a readable date/time. */
  dates: number;
  /** Candidate rows with a readable glucose value. */
  values: number;
  /** Readings left after filtering and duplicate removal. */
  kept: number;
  removed: ParseDiagnosticRemoval[];
  notes: string[];
}

export interface SummaryValue {
  label: string;
  value: string;
}

/** Metrics a glucose summary PDF prints, without the underlying readings. */
export interface SummaryImport {
  fileName: string;
  source: string;
  unit: 'mg/dL' | 'mmol/L';
  periodText?: string;
  days?: number;
  readings?: number;
  tir?: number;
  tbr?: number;
  tar?: number;
  veryLow?: number;
  veryHigh?: number;
  mean?: number;
  cv?: number;
  gmi?: number;
  coverage?: number;
  values: SummaryValue[];
  warnings: string[];
}

export type ParseOutcome =
  | { ok: true; dataset: Dataset; warnings: string[]; diagnostics?: ParseDiagnostics }
  | { ok: true; summary: SummaryImport; warnings: string[] }
  | { ok: false; error: string; diagnostics?: ParseDiagnostics };
