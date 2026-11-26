import { describe, expect, test } from 'bun:test';
import { buildSummary } from '../src/lib/summary';
import { comparisonNarrative } from '../src/lib/comparison';
import { applyExclusions, readingKey } from '../src/lib/exclusions';
import { pdfTitle } from '../src/lib/exportTitle';
import { mergeDatasets } from '../src/lib/merge';
import { computeMetrics } from '../src/lib/metrics';
import type { Dataset, Reading } from '../src/lib/types';

const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0, 0).getTime();

const dataset = (values: Array<[number, number, number]>, fileName = 'one.csv'): Dataset => ({
  readings: values.map(([day, hour, v]) => ({ t: at(day, hour), v, kind: 'cgm' })),
  insulin: [],
  carbs: [],
  meta: {
    source: 'LibreView',
    fileName,
    unit: 'mg/dL',
    date: {
      order: 'DMY',
      source: 'detected',
      ambiguous: 0,
      examples: [],
      conflict: false,
      uncertain: false,
    },
    time: { absolute: false, utc: false },
  },
});

describe('multi-export merge', () => {
  test('sorts readings, keeps one value per timestamp and dedupes treatments', () => {
    const base = dataset([
      [1, 8, 120],
      [1, 9, 140],
    ]);
    base.insulin.push({ t: at(1, 8), units: 4, kind: 'rapid' });
    const incoming = dataset(
      [
        [1, 7, 100],
        [1, 9, 141],
        [2, 8, 150],
      ],
      'two.csv',
    );
    incoming.insulin.push({ t: at(1, 8), units: 4, kind: 'rapid' });

    const result = mergeDatasets(base, incoming);
    expect(result.added).toBe(2);
    expect(result.duplicates).toBe(1);
    expect(result.dataset.readings.map((reading) => reading.v)).toEqual([100, 120, 140, 150]);
    expect(result.dataset.insulin).toHaveLength(1);
    expect(result.dataset.meta.source).toBe('LibreView');
    expect(result.dataset.meta.files).toEqual(['one.csv', 'two.csv']);
    expect(result.dataset.meta.fileName).toContain('2 files');
  });

  test('warns through metadata when date order is uncertain', () => {
    const base = dataset([[1, 8, 120]]);
    const incoming = dataset([[2, 8, 130]], 'two.csv');
    base.meta.date.uncertain = false;
    incoming.meta.date.uncertain = true;
    const result = mergeDatasets(base, incoming);
    expect(result.dataset.meta.date.uncertain).toBe(true);
  });
});

describe('manual reading exclusions', () => {
  test('removes exactly the selected keys and keeps the rest', () => {
    const base = dataset([
      [1, 8, 120],
      [1, 9, 140],
    ]);
    const removed: Reading = base.readings[0];
    const filtered = applyExclusions(base, new Set([readingKey(removed)]));
    expect(filtered.readings).toHaveLength(1);
    expect(filtered.readings[0].v).toBe(140);
    expect(base.readings).toHaveLength(2);
    expect(applyExclusions(base, new Set())).toBe(base);
  });
});

describe('comparison narrative', () => {
  test('names the direction of the main changes', () => {
    const previous = computeMetrics(
      dataset(Array.from({ length: 168 }, (_, index) => [1 + Math.floor(index / 24), index % 24, 200])),
    );
    const current = computeMetrics(
      dataset(Array.from({ length: 168 }, (_, index) => [1 + Math.floor(index / 24), index % 24, 110])),
    );
    const text = comparisonNarrative(current, previous, 'mg/dL');
    expect(text).toContain('TIR is up');
    expect(text).toContain('mean glucose is down');
  });
});

describe('sharing copy', () => {
  const base = dataset(Array.from({ length: 168 }, (_, index) => [1 + Math.floor(index / 24), index % 24, 140]));
  const metrics = computeMetrics(base);

  test('leaves patient, note and file name out of the summary', () => {
    const text = buildSummary(metrics, base, 'Ada Lovelace', 'Call after lunch', 'mg/dL', {
      anonymise: true,
    });
    expect(text).not.toContain('Ada Lovelace');
    expect(text).not.toContain('Call after lunch');
    expect(text).not.toContain('one.csv');
    expect(text).toContain('Patient ·');
    expect(text).toContain('source file hidden');
  });

  test('builds a safe PDF filename from the report dates', () => {
    expect(pdfTitle(metrics.start, metrics.end)).toBe('SokeriReport_2026-11-01_2026-11-07');
    expect(pdfTitle(metrics.start, metrics.end, true)).toBe('SokeriReport_summary');
  });
});
