import { describe, expect, test } from 'bun:test';
import { computeMetrics } from '../src/lib/metrics';
import type { Dataset, Reading } from '../src/lib/types';

const values = [50, 65, 100, 200, 300, 50, 65, 100];
const start = Date.UTC(2026, 2, 1, 0, 0, 0);

function makeDataset(readings: Reading[], fileName = 'metrics.csv'): Dataset {
  return {
    readings,
    insulin: [],
    carbs: [],
    meta: {
      source: 'Synthetic test',
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
  };
}

const dataset = makeDataset(
  values.map((v, index) => ({ t: start + index * 5 * 60_000, v, kind: 'cgm' })),
);

/** Local-time readings so the clock-hour buckets are deterministic. */
function at(hour: number, minute: number, v: number): Reading {
  return { t: new Date(2026, 2, 1, hour, minute).getTime(), v, kind: 'cgm' };
}

describe('target profiles and GRI', () => {
  test('standard targets produce the expected TIR, TITR and GRI', () => {
    const metrics = computeMetrics(dataset, { profile: 'standard' });
    expect(metrics.targets.low).toBe(70);
    expect(metrics.targets.high).toBe(180);
    expect(metrics.target).toBe(25);
    expect(metrics.titrr).toBe(25);
    expect(metrics.veryLow).toBe(25);
    expect(metrics.gri).toBe(100);
    expect(metrics.griZone).toBe('Very high');
  });

  test('pregnancy targets widen the low range and narrow the high range', () => {
    const metrics = computeMetrics(dataset, { profile: 'pregnancy' });
    expect(metrics.targets.low).toBe(63);
    expect(metrics.targets.high).toBe(140);
    expect(metrics.target).toBe(50);
    expect(metrics.titrr).toBe(50);
    expect(metrics.low).toBe(0);
    expect(metrics.gri).toBeGreaterThan(0);
  });
});

describe('long exports', () => {
  test('handles a 90-day one-minute series without a spread overflow', () => {
    // 130,000 readings exceed the argument limit of Math.min(...values) in V8.
    const count = 130_000;
    const readings: Reading[] = Array.from({ length: count }, (_, index) => ({
      t: start + index * 60_000,
      v: 100 + (index % 60),
      kind: 'cgm',
    }));
    const metrics = computeMetrics(makeDataset(readings, '90-days.csv'));

    expect(metrics.count).toBe(count);
    expect(metrics.min).toBe(100);
    expect(metrics.max).toBe(159);
    expect(metrics.days[0].min).toBe(100);
    expect(metrics.days[0].max).toBe(159);
  }, 30_000);
});

describe('hypoglycemia reporting', () => {
  test('labels a nadir below 54 as level 2, not "severe"', () => {
    const metrics = computeMetrics(
      makeDataset([
        at(3, 0, 50),
        at(3, 5, 50),
        at(12, 0, 60),
        at(15, 0, 120),
        at(16, 0, 130),
        at(17, 0, 140),
        at(18, 0, 150),
        at(19, 0, 160),
      ]),
    );

    expect(metrics.level2HypoCount).toBe(1);
    expect(metrics.hypoEvents.map((event) => event.level2)).toEqual([true, false]);
    expect('severeHypoCount' in metrics).toBe(false);
  });

  test('does not claim a cluster from a single low reading', () => {
    const metrics = computeMetrics(
      makeDataset([
        at(3, 0, 60),
        at(6, 0, 120),
        at(9, 0, 130),
        at(12, 0, 140),
        at(15, 0, 150),
        at(18, 0, 160),
        at(21, 0, 170),
        at(23, 0, 110),
      ]),
    );

    expect(metrics.hypoReadings).toBe(1);
    expect(metrics.hypoWindow.meaningful).toBe(false);
    expect(metrics.hypoWindow.count).toBe(0);
    expect(metrics.hypoWindow.share).toBe(0);
    expect(metrics.insights.some((insight) => insight.title.includes('cluster'))).toBe(false);
  });

  test('reports a cluster when several lows share a window', () => {
    const metrics = computeMetrics(
      makeDataset([
        at(3, 0, 60),
        at(3, 5, 58),
        at(3, 10, 62),
        at(3, 15, 64),
        at(12, 0, 120),
        at(15, 0, 140),
        at(18, 0, 150),
        at(21, 0, 160),
      ]),
    );

    expect(metrics.hypoReadings).toBe(4);
    expect(metrics.hypoWindow.meaningful).toBe(true);
    expect(metrics.hypoWindow.start).toBe(3);
    expect(metrics.hypoWindow.count).toBe(4);
    expect(metrics.hypoWindow.share).toBe(100);
  });
});
