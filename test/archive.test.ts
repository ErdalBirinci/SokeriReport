import { describe, expect, test } from 'bun:test';
import { decryptPayload, encryptPayload, type ArchivePayload } from '../src/lib/archive';

const payload: ArchivePayload = {
  dataset: {
    readings: [{ t: 1_772_000_000_000, v: 112, kind: 'cgm' }],
    insulin: [],
    carbs: [],
    meta: {
      source: 'Test export',
      fileName: 'test.csv',
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
  },
  patient: 'Test patient',
  note: 'Follow-up in 3 months',
  summaryOverride: null,
  profile: 'standard',
  unit: 'mg/dL',
};

describe('encrypted archive', () => {
  test('round-trips a report payload', async () => {
    const sealed = await encryptPayload(payload, 'correct horse battery');
    expect(sealed.cipher.length).toBeGreaterThan(20);
    expect(sealed.cipher).not.toContain('Test patient');

    const opened = await decryptPayload<ArchivePayload>(sealed, 'correct horse battery');
    expect(opened.patient).toBe('Test patient');
    expect(opened.dataset.readings[0].v).toBe(112);
    expect(opened.note).toBe('Follow-up in 3 months');
  });

  test('rejects the wrong passphrase', async () => {
    const sealed = await encryptPayload(payload, 'correct horse battery');
    await expect(decryptPayload(sealed, 'wrong passphrase')).rejects.toThrow();
  });
});
