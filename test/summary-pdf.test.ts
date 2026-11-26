import { describe, expect, test } from 'bun:test';
import { parseFile } from '../src/lib/parse';
import { parseSummaryPdf } from '../src/lib/summaryPdf';

const page = (...lines: string[]) => lines.join('\n');

describe('summary PDF import', () => {
  test('reads the printed AGP metrics without inventing readings', () => {
    const summary = parseSummaryPdf(
      [
        page(
          'LibreView',
          'Ambulatory Glucose Profile (AGP)',
          'Report period: 14 days',
          'Time in Range 71%',
          'Time below range 3%',
          'Time above range 26%',
          'Very low 1%',
          'Very high 6%',
          'Average glucose 154 mg/dL',
          'Glucose variability (CV) 31.2%',
          'GMI 6.8%',
          'Sensor active 94%',
          '1,234 readings',
        ),
      ],
      'agp.pdf',
    );

    expect(summary).not.toBeNull();
    if (!summary) return;
    expect(summary.source).toBe('LibreView summary PDF');
    expect(summary.unit).toBe('mg/dL');
    expect(summary.days).toBe(14);
    expect(summary.readings).toBe(1234);
    expect(summary.tir).toBe(71);
    expect(summary.tbr).toBe(3);
    expect(summary.tar).toBe(26);
    expect(summary.mean).toBe(154);
    expect(summary.cv).toBe(31.2);
    expect(summary.gmi).toBe(6.8);
    expect(summary.coverage).toBe(94);
    expect(summary.warnings.join(' ')).toContain('summary values only');
  });

  test('keeps mmol/L values in the source unit', () => {
    const summary = parseSummaryPdf(
      [
        page(
          'Dexcom Clarity',
          'Ambulatory Glucose Profile',
          'Time in Range 68%',
          'Time below range 2%',
          'Time above range 30%',
          'Average glucose 8.6 mmol/L',
          'CV 33%',
          'GMI 6.5%',
        ),
      ],
      'clarity.pdf',
    );

    expect(summary?.unit).toBe('mmol/L');
    expect(summary?.mean).toBe(8.6);
    expect(summary?.source).toBe('Dexcom summary PDF');
  });

  test('does not turn a daily-log page or an arbitrary PDF into a summary', () => {
    expect(
      parseSummaryPdf([page('LibreView Glucose Readings', 'Date Time Glucose', '27.10.2026 08:00 110')], 'daily.pdf'),
    ).toBeNull();
    expect(
      parseSummaryPdf([page('Invoice', 'Total 120 EUR', 'Payment due')], 'invoice.pdf'),
    ).toBeNull();
  });

  test('attaches a summary to a real PDF that has no reading rows', async () => {
    const bytes = await Bun.file('test/fixtures/pdf/summary.pdf').arrayBuffer();
    const outcome = await parseFile(
      new File([bytes], 'summary.pdf', { type: 'application/pdf' }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !('summary' in outcome)) return;
    expect(outcome.summary.tir).toBe(78);
    expect(outcome.summary.mean).toBe(133);
    expect(outcome.summary.gmi).toBe(6.4);
    expect(outcome.summary.values.map((item) => item.label)).toContain('Average glucose');
  }, 20_000);
});
