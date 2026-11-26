import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { MIN_SUMMARY_SIZE, PRINT_FIT_STEPS, SAFETY } from '../src/lib/printFit';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function printBlock(source: string): string {
  const starts = [...source.matchAll(/@media\s+print\s*\{/g)];
  expect(starts).toHaveLength(1);

  const open = starts[0].index! + starts[0][0].length - 1;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }

  throw new Error('Unclosed @media print block');
}

function rule(block: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Missing print rule: ${selector}`);
  return match[1];
}

/**
 * The browser-level A4 check measured 1039 px against 1046 px of usable
 * height with a 21-day previous file and the comparison warning visible.
 * These assertions lock the compact CSS that keeps that layout in budget.
 */
describe('optional print layout', () => {
  const block = printBlock(css);

  test('keeps all print rules in one block', () => {
    expect(block).toContain('@page');
    expect(block).toContain('size: A4');
  });

  test('keeps the comparison warning inside the compact print layout', () => {
    expect(rule(block, '.comparison-grid')).toContain(
      'grid-template-columns: repeat(5, minmax(0, 1fr))',
    );
    expect(rule(block, '.comparison-warning')).toMatch(/font-size:\s*6\.8px/);
    expect(rule(block, '.comparison-warning')).toMatch(/line-height:\s*1\.25/);
    expect(rule(block, '.comparison-warning')).toMatch(/padding:\s*2px 4px/);
  });

  test('keeps the optional sections and their print-only reductions', () => {
    const optional = rule(block, '.print-optional');
    expect(optional).toContain('display: grid');
    expect(optional).toContain('grid-template-columns: 60px minmax(0, 1fr)');
    expect(block).toMatch(/\.print-optional \.quality-note[\s\S]*?display:\s*none/);
    expect(rule(block, '.chart-agp svg')).toMatch(/height:\s*170px/);
  });

  test('keeps every printed font readable', () => {
    const sizes = [...block.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(20);
    // Below roughly 5 pt a clinical printout cannot be read reliably.
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(6.5);
  });

  test('keeps the summary readable and prefers columns over shrinking', () => {
    expect(rule(block, '.summary-print')).toContain('font-size: var(--print-summary-size, 7.8px)');
    expect(PRINT_FIT_STEPS[0].size).toBeGreaterThanOrEqual(7.6);
    expect(MIN_SUMMARY_SIZE).toBeGreaterThanOrEqual(6.8);

    const twoColumnIndex = PRINT_FIT_STEPS.findIndex((step) => step.columns === 2);
    expect(twoColumnIndex).toBeGreaterThan(0);
    // Two columns must come before any step that shrinks the type further.
    expect(PRINT_FIT_STEPS[twoColumnIndex].size).toBe(PRINT_FIT_STEPS[0].size);
  });

  test('keeps a pagination safety gap under the printed content', () => {
    expect(SAFETY).toBeGreaterThanOrEqual(16);
  });

  test('does not drop the quality chip styling while merging rules', () => {
    const chip = rule(block, '.quality-chip');
    expect(chip).toContain('border: 1px solid #e3eaf3');
    expect(chip).toContain('background: #fff');
    expect(chip).toContain('box-shadow: none');
  });
});
