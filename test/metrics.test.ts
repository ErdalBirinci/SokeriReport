import { describe, expect, test } from 'bun:test';
import { computeMetrics } from '../src/lib/metrics';
import type { Dataset } from '../src/lib/types';

const values = [50, 65, 100, 200, 300, 50, 65, 100];
const start = Date.UTC(2026, 2, 1, 0, 0, 0);
const dataset: Dataset = {
  readings: values.map((v, index) => ({ t: start + index * 5 * 60_000, v, kind: 'cgm' })),
  insulin: [],
  carbs: [],
  meta: {
    source: 'Synthetic test',
    fileName: 'metrics.csv',
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
