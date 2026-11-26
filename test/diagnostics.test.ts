import { describe, expect, test } from 'bun:test';
import { parseFile, parsePdfLines } from '../src/lib/parse';

const page = (...lines: string[]): string[] => [lines.join('\n')];

describe('import diagnostics', () => {
  test('reports rows and headers when the columns are not recognized', async () => {
    const file = new File(['foo,bar\n1,2'], 'bad.csv', { type: 'text/csv' });
    const outcome = await parseFile(file);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics?.rows).toBe(1);
    expect(outcome.diagnostics?.dates).toBe(0);
    expect(outcome.diagnostics?.values).toBe(0);
    expect(outcome.diagnostics?.kept).toBe(0);
    expect(outcome.diagnostics?.notes.join(' ')).toContain('foo');
  });

  test('shows why CSV rows were dropped', async () => {
    const file = new File(
      [['time,glucose', '27.10.2026 08:00,abc', 'not-a-date,140'].join('\n')],
      'dropped.csv',
      { type: 'text/csv' },
    );
    const outcome = await parseFile(file);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics?.rows).toBe(2);
    expect(outcome.diagnostics?.dates).toBe(1);
    expect(outcome.diagnostics?.values).toBe(1);
    expect(outcome.diagnostics?.kept).toBe(0);
    const removed = outcome.diagnostics?.removed.map((item) => item.label).join(' ') ?? '';
    expect(removed).toContain('date could not be read');
    expect(removed).toContain('glucose value could not be read');
  });

  test('reports a summary PDF without inventing table rows', () => {
    const outcome = parsePdfLines(
      page('Average glucose 133 mg/dL', 'Time in range 78%'),
      'summary.pdf',
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics?.rows).toBe(0);
    expect(outcome.diagnostics?.notes.join(' ')).toContain('No readings table header');
    expect(outcome.diagnostics?.notes.join(' ')).toContain('2 text lines scanned');
  });

  test('reports an image-only PDF', () => {
    const outcome = parsePdfLines([], 'scan.pdf');

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics?.notes.join(' ')).toContain('no selectable text');
  });
});
