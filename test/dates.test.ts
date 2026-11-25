import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile, type ParseOptions } from '../src/lib/parse';

const load = (name: string) =>
  new File([readFileSync(join(import.meta.dir, 'fixtures', name))], name);

async function parse(name: string, options?: ParseOptions) {
  const outcome = await parseFile(load(name), options);
  if (!outcome.ok) throw new Error(`${name}: ${outcome.error}`);
  return outcome;
}

const local = (ms: number) => {
  const value = new Date(ms);
  return { day: value.getDate(), month: value.getMonth() + 1, year: value.getFullYear() };
};

const hourIn = (zone: string, ms: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hour12: false }).format(
    new Date(ms),
  );

const hasDateWarning = (warnings: string[]) => warnings.some((w) => w.includes('ambiguous'));

describe('date order detection', () => {
  test('a decisive day-first date settles the whole file', async () => {
    const { dataset, warnings } = await parse('mixed-dmy.csv');

    expect(dataset.meta.date.order).toBe('DMY');
    expect(dataset.meta.date.source).toBe('detected');
    // 03.04 dates are individually ambiguous, but 25.11 proves the order.
    expect(dataset.meta.date.ambiguous).toBe(5);
    expect(dataset.meta.date.uncertain).toBe(false);
    expect(hasDateWarning(warnings)).toBe(false);

    const readings = dataset.readings;
    expect(local(readings[0].t)).toEqual({ day: 3, month: 4, year: 2026 });
    expect(local(readings[readings.length - 1].t)).toEqual({ day: 25, month: 11, year: 2026 });
  });

  test('files without decisive evidence stay flagged', async () => {
    const { dataset, warnings } = await parse('ambiguous-only.csv');

    expect(dataset.meta.date.uncertain).toBe(true);
    expect(dataset.meta.date.source).toBe('default');
    expect(dataset.meta.date.order).toBe('DMY');
    expect(hasDateWarning(warnings)).toBe(true);
    expect(local(dataset.readings[0].t)).toEqual({ day: 3, month: 4, year: 2026 });
  });

  test('overriding the order re-reads the same file and clears the warning', async () => {
    const { dataset, warnings } = await parse('ambiguous-only.csv', { dateOrder: 'MDY' });

    expect(dataset.meta.date.order).toBe('MDY');
    expect(dataset.meta.date.source).toBe('override');
    expect(dataset.meta.date.uncertain).toBe(false);
    expect(hasDateWarning(warnings)).toBe(false);
    expect(local(dataset.readings[0].t)).toEqual({ day: 4, month: 3, year: 2026 });
  });

  test('contradictory evidence is flagged', async () => {
    const { dataset, warnings } = await parse('conflict.csv');

    expect(dataset.meta.date.conflict).toBe(true);
    expect(dataset.meta.date.uncertain).toBe(true);
    expect(warnings.some((w) => w.includes('mixes day-first'))).toBe(true);
  });

  test('a decisive month-first date settles the whole file', async () => {
    const { dataset, warnings } = await parse('month-first.csv');

    expect(dataset.meta.date.order).toBe('MDY');
    expect(dataset.meta.date.source).toBe('detected');
    expect(dataset.meta.date.uncertain).toBe(false);
    expect(hasDateWarning(warnings)).toBe(false);
  });
});

describe('timestamp handling', () => {
  test('UTC markers and numeric offsets keep the instant', async () => {
    const { dataset, warnings } = await parse('iso-utc.csv');

    expect(dataset.meta.time.absolute).toBe(true);
    expect(dataset.meta.time.utc).toBe(true);
    expect(dataset.readings[0].t).toBe(Date.parse('2026-11-25T05:10:00Z'));
    expect(dataset.readings[9].t).toBe(Date.parse('2026-11-25T05:24:00Z'));
    expect(warnings.some((w) => w.includes('UTC'))).toBe(true);
  });

  test('Nightscout epoch is preserved and renders per zone', async () => {
    const { dataset } = await parse('nightscout.json');

    expect(dataset.meta.time.absolute).toBe(true);
    expect(dataset.meta.time.utc).toBe(false);
    expect(dataset.readings[0].t).toBe(1795583400000);
    expect(hourIn('Europe/Istanbul', dataset.readings[0].t)).toBe('08');
    expect(hourIn('Europe/Berlin', dataset.readings[0].t)).toBe('06');
  });

  test('epoch seconds are normalised instead of landing in 1970', async () => {
    const { dataset } = await parse('nightscout-seconds.json');

    expect(dataset.readings[0].t).toBe(1795583400000);
    expect(new Date(dataset.readings[0].t).getFullYear()).toBe(2026);
  });

  test('dateString UTC values keep the instant', async () => {
    const { dataset } = await parse('nightscout-datestring.json');

    expect(dataset.readings[0].t).toBe(1795583400000);
    expect(dataset.meta.time.utc).toBe(true);
  });

  test('DST boundary renders per zone without drift', async () => {
    const { dataset } = await parse('nightscout-dst.json');

    expect(dataset.readings[0].t).toBe(1774747800000);
    expect(hourIn('Europe/Berlin', dataset.readings[0].t)).toBe('03');
    expect(hourIn('Europe/Istanbul', dataset.readings[0].t)).toBe('04');
  });
});
