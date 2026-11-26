import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { parseFile } from '../src/lib/parse';
import { extractPdfText } from '../src/lib/pdf';

interface CorpusEntry {
  file: string;
  pages?: number;
  readings?: number;
  unit?: string;
  source?: string;
  warningsInclude?: string;
  summary?: boolean;
}

const root = fileURLToPath(new URL('./fixtures/pdf/corpus/', import.meta.url));
const entries = (await Bun.file(`${root}manifest.json`).json()) as CorpusEntry[];

describe('anonymised PDF corpus', () => {
  test('manifest is not empty', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  for (const entry of entries) {
    test(entry.file, async () => {
      const path = `${root}${entry.file}`;
      const bytes = await Bun.file(path).arrayBuffer();
      const extracted = await extractPdfText(bytes);

      if (entry.pages !== undefined) expect(extracted.pages).toHaveLength(entry.pages);

      const file = new File([bytes], entry.file.split('/').pop() ?? entry.file, {
        type: 'application/pdf',
      });
      const outcome = await parseFile(file);

      if (entry.summary) {
        expect(outcome.ok).toBe(true);
        if (!outcome.ok || !('summary' in outcome)) return;
        expect(outcome.summary.tir).toBeGreaterThan(0);
        return;
      }

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      if (entry.readings !== undefined) {
        expect(outcome.dataset.readings).toHaveLength(entry.readings);
      }
      if (entry.unit) expect(outcome.dataset.meta.unit).toBe(entry.unit);
      if (entry.source) expect(outcome.dataset.meta.source).toBe(entry.source);
      if (entry.warningsInclude) {
        expect(outcome.warnings.join(' ')).toContain(entry.warningsInclude);
      }
    }, 20_000);
  }
});
