import { describe, expect, test } from 'bun:test';
import { parseFile, parsePdfLines } from '../src/lib/parse';

const fixture = async (name: string): Promise<File> => {
  const path = `test/fixtures/pdf/${name}`;
  return new File([await Bun.file(path).arrayBuffer()], name, { type: 'application/pdf' });
};

const page = (...lines: string[]): string[] => [lines.join('\n')];

const readings = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => {
    const day = 27 + Math.floor(index / 12);
    const hour = 8 + Math.floor((index % 12) / 6);
    const minute = (index % 6) * 5;
    const value = 70 + ((index * 17) % 150);
    return `${String(day).padStart(2, '0')}.10.2026 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${value}`;
  });

describe('PDF report imports', () => {
  test('reads full date/time rows and keeps the PDF source', () => {
    const outcome = parsePdfLines(
      page('LibreView Glucose Readings', 'Date/Time Glucose (mg/dL)', ...readings(12)),
      'report.pdf',
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.readings).toHaveLength(12);
    expect(outcome.dataset.meta.source).toBe('LibreView PDF');
    expect(outcome.dataset.meta.unit).toBe('mg/dL');
    expect(outcome.warnings[0]).toContain('Read 12 glucose readings from the PDF table');
  });

  test('uses date headers for daily-log tables with time-only rows', () => {
    const outcome = parsePdfLines(
      page(
        'LibreView Daily Log',
        'Time Glucose (mg/dL)',
        '27.10.2026',
        '08:00 142',
        '08:05 138',
        '08:10 131',
        '08:15 126',
        '08:20 64',
        '08:25 68',
        '28.10.2026',
        '09:00 205',
        '09:05 214',
        '09:10 198',
        '09:15 172',
        '09:20 149',
        '09:25 121',
      ),
      'daily.pdf',
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.readings).toHaveLength(12);
    expect(outcome.dataset.readings[0].v).toBe(142);
    expect(outcome.dataset.readings[11].v).toBe(121);
  });

  test('converts a mmol/L readings table to mg/dL', () => {
    const outcome = parsePdfLines(
      page(
        'Dexcom Clarity Glucose Readings',
        'Date Time Glucose (mmol/L)',
        ...Array.from({ length: 12 }, (_, index) => {
          const minute = (index % 6) * 5;
          return `27.10.2026 ${8 + Math.floor(index / 6)}:${String(minute).padStart(2, '0')} ${(
            5.5 + index * 0.4
          ).toFixed(1).replace('.', ',')}`;
        }),
      ),
      'mmol.pdf',
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.meta.unit).toBe('mmol/L');
    expect(outcome.dataset.readings[0].v).toBeGreaterThan(90);
    expect(outcome.warnings.join(' ')).toContain('mmol/L');
  });

  test('rejects summary PDFs with export guidance instead of parsing chart labels', () => {
    const outcome = parsePdfLines(
      page(
        'Endocrinology Consultation Report',
        'Average glucose 133 mg/dL',
        'Time in range 78%',
        'Glucose management indicator 6.4%',
        'Ambulatory Glucose Profile (AGP)',
        '00:00 120 03:00 150 06:00 180',
      ),
      'summary.pdf',
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('summary report');
    expect(outcome.error).toContain('average glucose 133');
    expect(outcome.error).toContain('TIR 78%');
    expect(outcome.error).toContain('LibreView → Download CSV');
  });

  test('explains a PDF table with fewer than eight readings', () => {
    const outcome = parsePdfLines(
      page('Glucose Readings', 'Date/Time Glucose (mg/dL)', ...readings(5)),
      'few.pdf',
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('only 5 usable glucose readings');
    expect(outcome.error).toContain('at least 8');
  });

  test('analyzes a tiny PDF when the user explicitly allows it', () => {
    const outcome = parsePdfLines(
      page('Glucose Readings', 'Date/Time Glucose (mg/dL)', ...readings(5)),
      'few.pdf',
      undefined,
      true,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.readings).toHaveLength(5);
    expect(outcome.warnings.join(' ')).toContain('too small for a representative glycemic report');
  });

  test('counts the valid readings when a CSV is too small', async () => {
    const file = new File(
      [
        ['time,glucose', '27.10.2026 08:00,142', '27.10.2026 08:05,138', '27.10.2026 08:10,131'].join(
          '\n',
        ),
      ],
      'few.csv',
      { type: 'text/csv' },
    );

    const outcome = await parseFile(file);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('Only 3 valid glucose readings were found');
  });

  test('analyzes a tiny CSV when the user explicitly allows it', async () => {
    const file = new File(
      [
        ['time,glucose', '27.10.2026 08:00,142', '27.10.2026 08:05,138', '27.10.2026 08:10,131'].join(
          '\n',
        ),
      ],
      'few.csv',
      { type: 'text/csv' },
    );

    const outcome = await parseFile(file, { allowSparse: true });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.readings).toHaveLength(3);
    expect(outcome.warnings.join(' ')).toContain('too small');
  });

  test('explains when a PDF has no selectable text', () => {
    const outcome = parsePdfLines([], 'scan.pdf');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('no selectable text');
  });

  test('extracts readings from a real PDF end to end', async () => {
    const outcome = await parseFile(await fixture('libreview-readings.pdf'));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.readings).toHaveLength(32);
    expect(outcome.dataset.meta.source).toBe('LibreView PDF');
    expect(outcome.dataset.meta.unit).toBe('mg/dL');
    expect(outcome.warnings[0]).toContain('PDF table');
  });

  test('extracts a daily-log PDF with date headers', async () => {
    const outcome = await parseFile(await fixture('daily-log.pdf'));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.readings).toHaveLength(24);
    expect(outcome.dataset.readings[0].v).toBe(120);
  });

  test('converts a real mmol/L PDF', async () => {
    const outcome = await parseFile(await fixture('mmol-readings.pdf'));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.meta.source).toBe('Dexcom Clarity PDF');
    expect(outcome.dataset.meta.unit).toBe('mmol/L');
    expect(outcome.dataset.readings[0].v).toBeGreaterThan(130);
  });

  test('fails a summary PDF with the raw-export instructions', async () => {
    const outcome = await parseFile(await fixture('summary.pdf'));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('summary report');
  });

  test('fails an image-only PDF without dumping binary header bytes', async () => {
    const outcome = await parseFile(await fixture('no-text.pdf'));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('no selectable text');
    expect(outcome.error).not.toContain('%PDF');
  });

  test('rejects a .pdf name whose content is not a PDF', async () => {
    const file = new File(['time,glucose\n27.10.2026 08:00,142'], 'fake.pdf', {
      type: 'application/pdf',
    });

    const outcome = await parseFile(file);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('not a valid PDF');
  });
});
