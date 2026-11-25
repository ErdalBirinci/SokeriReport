import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ComparisonPanel, { type Comparison } from '../src/components/ComparisonPanel';
import { computeMetrics } from '../src/lib/metrics';
import type { Dataset } from '../src/lib/types';

const HOUR = 3_600_000;

function makeDataset(days: number): Dataset {
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);
  const readings = Array.from({ length: days * 24 }, (_, index) => ({
    t: start + index * HOUR,
    v: 100,
    kind: 'cgm' as const,
  }));

  return {
    readings,
    insulin: [],
    carbs: [],
    meta: {
      source: 'Synthetic comparison test',
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

function comparison(days: number): Comparison {
  const dataset = makeDataset(days);
  return {
    fileName: `${days}-days.csv`,
    dataset,
    metrics: computeMetrics(dataset),
  };
}

function render(currentDays: number, previousDays: number): string {
  const current = makeDataset(currentDays);
  return renderToStaticMarkup(
    createElement(ComparisonPanel, {
      comparison: comparison(previousDays),
      current: computeMetrics(current),
      unit: 'mg/dL',
    }),
  );
}

describe('comparison window warning', () => {
  test('warns when the current and previous windows differ', () => {
    const html = render(90, 14);

    expect(html).toContain('Different window lengths.');
    expect(html).toContain('90 days');
    expect(html).toContain('14 days');
  });

  test('does not warn when both reports use the same window length', () => {
    const html = render(14, 14);

    expect(html).not.toContain('Different window lengths.');
    expect(html).toContain('Compared with previous export');
  });
});
