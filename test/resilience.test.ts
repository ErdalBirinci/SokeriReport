import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PRINT_OPTIONS, loadPrintOptions, parsePrintOptions } from '../src/lib/printOptions';

const sw = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

describe('service worker cache ownership', () => {
  test('only deletes this app\'s own shell caches on activate', () => {
    const activate = sw.slice(sw.indexOf("addEventListener('activate'"), sw.indexOf("addEventListener('fetch'"));
    expect(activate).toContain('CACHE_PREFIX');
    expect(activate).toContain('key.startsWith(CACHE_PREFIX)');
    // The pending-share cache and other projects on the origin must survive.
    expect(activate).not.toContain('filter((key) => key !== CACHE)');
    expect(sw).toContain("const SHARE_CACHE = 'sokerireport-share'");
  });

  test('refreshes unhashed assets instead of serving them from cache forever', () => {
    expect(sw).toContain('assets/');
    expect(sw).toContain('cached ?? network');
  });

  test('does not fail the install when one optional asset is missing', () => {
    expect(sw).toContain('cache.add(url).catch(() => {})');
  });
});

describe('print setup storage', () => {
  test('falls back to defaults for missing or invalid storage', () => {
    expect(parsePrintOptions(null)).toEqual(DEFAULT_PRINT_OPTIONS);
    expect(parsePrintOptions('not json')).toEqual(DEFAULT_PRINT_OPTIONS);
    expect(parsePrintOptions('[]')).toEqual(DEFAULT_PRINT_OPTIONS);
    expect(parsePrintOptions('{"showQuality":"yes","institution":4}')).toEqual(
      DEFAULT_PRINT_OPTIONS,
    );
  });

  test('keeps valid stored values and fills missing keys', () => {
    const parsed = parsePrintOptions(
      JSON.stringify({ institution: 'Clinic', showQuality: true, signature: true }),
    );
    expect(parsed.institution).toBe('Clinic');
    expect(parsed.showQuality).toBe(true);
    expect(parsed.signature).toBe(true);
    expect(parsed.grayscale).toBe(false);
    expect(parsed.preparedBy).toBe('');
  });

  test('loads defaults when no browser storage is available', () => {
    expect(loadPrintOptions()).toEqual(DEFAULT_PRINT_OPTIONS);
  });
});
