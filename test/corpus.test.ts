import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseFile } from '../src/lib/parse';
import { parseFileAsync } from '../src/lib/parseAsync';

const fixture = (name: string, type = 'text/csv') =>
  new File([readFileSync(`test/fixtures/${name}`)], name, { type });

describe('real export corpus', () => {
  test('LibreView Turkish export in Windows-1254', async () => {
    const outcome = await parseFile(fixture('libre-tr-windows1254.csv'));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.dataset.meta.source).toBe('LibreView');
    expect(outcome.dataset.meta.unit).toBe('mg/dL');
    expect(outcome.dataset.meta.date.order).toBe('DMY');
    expect(outcome.dataset.readings).toHaveLength(168);
    expect(outcome.dataset.insulin.filter((dose) => dose.kind === 'rapid')).toHaveLength(14);
    expect(outcome.dataset.insulin.filter((dose) => dose.kind === 'long')).toHaveLength(14);
    expect(outcome.dataset.carbs).toHaveLength(14);
    expect(outcome.warnings.some((warning) => warning.includes('Windows-1254'))).toBe(true);
  });

  test('LibreView German export with comma decimals and mmol/L', async () => {
    const outcome = await parseFile(fixture('libre-de-mmol.csv'));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.dataset.meta.source).toBe('LibreView');
    expect(outcome.dataset.meta.unit).toBe('mmol/L');
    expect(outcome.dataset.meta.date.order).toBe('DMY');
    expect(outcome.dataset.readings).toHaveLength(168);
    expect(outcome.dataset.readings[0].v).toBe(132);
    expect(outcome.dataset.insulin.filter((dose) => dose.kind === 'rapid')).toHaveLength(14);
    expect(outcome.dataset.insulin.filter((dose) => dose.kind === 'long')).toHaveLength(14);
    expect(outcome.dataset.carbs).toHaveLength(14);
    const unitWarning = outcome.warnings.find((warning) => warning.includes('read as mmol/L'));
    expect(unitWarning).toContain('normalised to mg/dL');
    expect(unitWarning).toContain('opens in mmol/L');
  });

  test('Dexcom Clarity CSV with insulin and carbohydrate events', async () => {
    const outcome = await parseFile(fixture('dexcom-clarity.csv'));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.dataset.meta.source).toBe('Dexcom Clarity');
    expect(outcome.dataset.readings).toHaveLength(168);
    expect(outcome.dataset.insulin).toHaveLength(14);
    expect(outcome.dataset.insulin.every((dose) => dose.kind === 'rapid')).toBe(true);
    expect(outcome.dataset.carbs).toHaveLength(14);
  });

  test('Nightscout JSON with treatments uses absolute timestamps', async () => {
    const outcome = await parseFile(fixture('nightscout-entries.json', 'application/json'));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.dataset.meta.source).toBe('Nightscout');
    expect(outcome.dataset.readings).toHaveLength(168);
    expect(outcome.dataset.insulin).toHaveLength(28);
    expect(outcome.dataset.insulin.filter((dose) => dose.kind === 'long')).toHaveLength(14);
    expect(outcome.dataset.carbs).toHaveLength(14);
    expect(outcome.dataset.meta.time.absolute).toBe(true);
  });

  test('UTF-16LE generic CSV is decoded and analysed', async () => {
    const outcome = await parseFile(fixture('generic-utf16le.csv'));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.dataset.meta.source).toBe('Generic CSV');
    expect(outcome.dataset.readings).toHaveLength(168);
    expect(outcome.dataset.readings[0].v).toBe(132);
    expect(outcome.warnings.some((warning) => warning.includes('UTF-16LE'))).toBe(true);
  });

  test('small files skip the worker and parse identically', async () => {
    const direct = await parseFile(fixture('generic-utf16le.csv'));
    const viaAsync = await parseFileAsync(fixture('generic-utf16le.csv'));
    expect(viaAsync.ok).toBe(true);
    if (!direct.ok || !viaAsync.ok) return;
    expect(viaAsync.dataset.readings).toHaveLength(direct.dataset.readings.length);
  });
});
