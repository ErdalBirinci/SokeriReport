import { describe, expect, test } from 'bun:test';
import {
  availablePeriods,
  defaultPeriod,
  isPeriodAvailable,
  periodOption,
  sliceDataset,
} from '../src/lib/period';
import type { Dataset } from '../src/lib/types';

const HOUR = 3_600_000;

function makeDataset(days: number): Dataset {
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);
  const readings = Array.from({ length: days * 24 }, (_, index) => ({
    t: start + index * HOUR,
    v: 100 + (index % 40),
    kind: 'cgm' as const,
  }));

  return {
    readings,
    insulin: [
      { t: start, units: 1, kind: 'rapid' },
      { t: start + (days * 24 - 1) * HOUR, units: 2, kind: 'rapid' },
    ],
    carbs: [
      { t: start, grams: 10 },
      { t: start + (days * 24 - 1) * HOUR, grams: 20 },
    ],
    meta: {
      source: 'Synthetic period test',
      fileName: `${days}-days.csv`,
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
  };
}

describe('report periods', () => {
  test('uses 14-day, 30-day and 90-day trailing windows', () => {
    const dataset = makeDataset(90);

    const end = dataset.readings[dataset.readings.length - 1].t;

    for (const [id, days, expectedReadings, expectedContext] of [
      ['14d', 14, 14 * 24 + 1, 1],
      ['1m', 30, 30 * 24 + 1, 1],
      ['3m', 90, 90 * 24, 2],
    ] as const) {
      const sliced = sliceDataset(dataset, id);
      const windowStart = end - days * 24 * HOUR;

      expect(periodOption(id).days).toBe(days);
      expect(sliced.readings.length).toBe(expectedReadings);
      expect(sliced.readings[0].t).toBeGreaterThanOrEqual(windowStart);
      expect(sliced.readings[sliced.readings.length - 1].t).toBe(end);
      expect(sliced.readings.every((reading) => reading.t >= windowStart)).toBe(true);
      expect(sliced.insulin.length).toBe(expectedContext);
      expect(sliced.insulin.every((dose) => dose.t >= windowStart)).toBe(true);
      expect(sliced.carbs.length).toBe(expectedContext);
      expect(sliced.carbs.every((entry) => entry.t >= windowStart)).toBe(true);
      expect(sliced.meta.fileName).toBe('90-days.csv');
    }

    expect(dataset.readings.length).toBe(90 * 24);
    const twoWeeks = sliceDataset(dataset, '14d');
    expect(twoWeeks.readings[0].t).toBe(end - 14 * 24 * HOUR);
  });

  test('selects the longest period the dataset supports by default', () => {
    expect(defaultPeriod(makeDataset(90))).toBe('3m');
    expect(defaultPeriod(makeDataset(89))).toBe('1m');
    expect(defaultPeriod(makeDataset(30))).toBe('1m');
    expect(defaultPeriod(makeDataset(29))).toBe('14d');
    expect(defaultPeriod(makeDataset(20))).toBe('14d');
    expect(defaultPeriod(makeDataset(14))).toBe('14d');
  });

  test('keeps shorter datasets on 14 days and disables unsupported windows', () => {
    const twoWeeks = makeDataset(14);
    const oneMonth = makeDataset(30);

    expect(availablePeriods(twoWeeks)).toEqual(['14d']);
    expect(availablePeriods(makeDataset(29))).toEqual(['14d']);
    expect(availablePeriods(makeDataset(89))).toEqual(['14d', '1m']);
    expect(isPeriodAvailable(twoWeeks, '14d')).toBe(true);
    expect(isPeriodAvailable(twoWeeks, '1m')).toBe(false);
    expect(isPeriodAvailable(twoWeeks, '3m')).toBe(false);

    expect(availablePeriods(oneMonth)).toEqual(['14d', '1m']);
    expect(isPeriodAvailable(oneMonth, '1m')).toBe(true);
    expect(isPeriodAvailable(oneMonth, '3m')).toBe(false);

    expect(availablePeriods(makeDataset(10))).toEqual(['14d']);
    expect(defaultPeriod(makeDataset(10))).toBe('14d');
  });
});
