import type { Dataset } from './types';

const DAY_MS = 86_400_000;

export type ReportPeriod = '14d' | '1m' | '3m';

export interface ReportPeriodOption {
  id: ReportPeriod;
  /** Length of the trailing report window in days. */
  days: number;
  label: string;
  shortLabel: string;
}

export const REPORT_PERIODS: readonly ReportPeriodOption[] = [
  { id: '14d', days: 14, label: '14 days', shortLabel: '14d' },
  { id: '1m', days: 30, label: '1 month', shortLabel: '1m' },
  { id: '3m', days: 90, label: '3 months', shortLabel: '3m' },
];

export function periodOption(period: ReportPeriod): ReportPeriodOption {
  return REPORT_PERIODS.find((option) => option.id === period) ?? REPORT_PERIODS[0];
}

export function datasetSpanDays(dataset: Dataset): number {
  if (dataset.readings.length < 2) return 0;
  const first = dataset.readings[0].t;
  const last = dataset.readings[dataset.readings.length - 1].t;
  return (last - first) / DAY_MS;
}

/** 14 days is always usable (it falls back to all available data); longer windows need enough history. */
export function isPeriodAvailable(dataset: Dataset, period: ReportPeriod): boolean {
  if (period === '14d') return dataset.readings.length > 0;
  return Math.round(datasetSpanDays(dataset)) >= periodOption(period).days;
}

export function availablePeriods(dataset: Dataset): ReportPeriod[] {
  return REPORT_PERIODS.filter((option) => isPeriodAvailable(dataset, option.id)).map(
    (option) => option.id,
  );
}

/** Prefer the longest standard window the export supports, so a 3-month file opens as a 3-month report. */
export function defaultPeriod(dataset: Dataset): ReportPeriod {
  const available = availablePeriods(dataset);
  return available[available.length - 1] ?? '14d';
}

/** Keep only the trailing report window, including insulin and carbohydrate context. */
export function sliceDataset(dataset: Dataset, period: ReportPeriod): Dataset {
  if (!dataset.readings.length) return dataset;

  const end = dataset.readings[dataset.readings.length - 1].t;
  const start = end - periodOption(period).days * DAY_MS;

  return {
    ...dataset,
    readings: dataset.readings.filter((reading) => reading.t >= start),
    insulin: dataset.insulin.filter((dose) => dose.t >= start),
    carbs: dataset.carbs.filter((entry) => entry.t >= start),
  };
}
