/**
 * Single-page guarantee for the A4 report.
 *
 * `prepareReportForPrint` measures the live report with the print stylesheet
 * applied (same 190 mm content width as @page A4 with 10 mm side margins),
 * reflowing the clinical summary into two columns before shrinking it, so the
 * printed text stays as large as possible on one page.
 * Nothing is printed here; the caller decides what to do with the result.
 */

const PAGE_HEIGHT = (279 / 25.4) * 96; // A4 content height with 9 mm top/bottom margins
/** px between the measured report and the page edge; Chrome's pagination needs room. */
export const SAFETY = 16;

export interface FitStep {
  size: number;
  lineHeight: number;
  columns: number;
}

/**
 * Ordered from most to least readable. Two columns come before further
 * shrinking: an 7.8 px two-column summary is easier to read than a 6.8 px
 * single-column one, and it is the same height.
 */
export const PRINT_FIT_STEPS: readonly FitStep[] = [
  { size: 7.8, lineHeight: 1.34, columns: 1 },
  { size: 7.8, lineHeight: 1.34, columns: 2 },
  { size: 7.4, lineHeight: 1.32, columns: 2 },
  { size: 7.0, lineHeight: 1.3, columns: 2 },
  { size: 6.8, lineHeight: 1.3, columns: 2 },
];

/** Smallest summary size the fit may use; below this the printout is not readable. */
export const MIN_SUMMARY_SIZE = PRINT_FIT_STEPS[PRINT_FIT_STEPS.length - 1].size;

export interface PrintPreflight {
  /** Measured print height of the report in px. */
  height: number;
  /** Usable A4 content height in px. */
  pageHeight: number;
  /** True when the measured report fits on one page with a safety margin. */
  fits: boolean;
  /** Applied fit step (0 = original typography). */
  level: number;
  /** True when a fit step was applied and the result fits. */
  scaled: boolean;
  /** Summary font size as a percentage of the original print size. */
  scalePercent: number;
  /** Summary font size in px that the printout will actually use. */
  summarySize: number;
  /** True when the summary was reflowed into two print columns. */
  columns: boolean;
}

function collectPrintCss(): string {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules) as CSSRule[]) {
      if (rule.type !== 4) continue; // CSSMediaRule
      const media = rule as CSSMediaRule;
      if (!media.conditionText || !media.conditionText.includes('print')) continue;
      for (const inner of Array.from(media.cssRules) as CSSRule[]) {
        if (inner.type === 6) continue; // @page
        css += `${inner.cssText}\n`;
      }
    }
  }
  // Screen measurement has a wider viewport; force the A4 content width.
  return `${css}
html, body { width: 190mm !important; }
.shell { width: 190mm !important; max-width: none !important; padding: 0 !important; }
`;
}

function applyStep(report: HTMLElement, level: number): void {
  const step = PRINT_FIT_STEPS[level];
  if (level === 0) {
    report.style.removeProperty('--print-summary-size');
    report.style.removeProperty('--print-summary-lh');
    report.style.removeProperty('--print-summary-cols');
    return;
  }
  report.style.setProperty('--print-summary-size', `${step.size}px`);
  report.style.setProperty('--print-summary-lh', `${step.lineHeight}`);
  report.style.setProperty('--print-summary-cols', `${step.columns}`);
}

export function resetPrintFit(): void {
  const report = document.querySelector<HTMLElement>('.report');
  if (report) applyStep(report, 0);
}

export function prepareReportForPrint(): PrintPreflight | null {
  const report = document.querySelector<HTMLElement>('.report');
  if (!report) return null;

  const style = document.createElement('style');
  style.id = 'print-preflight';
  style.textContent = collectPrintCss();
  const scrollY = window.scrollY;
  document.head.appendChild(style);

  try {
    applyStep(report, 0);
    let level = 0;
    let height = report.getBoundingClientRect().height;

    while (height > PAGE_HEIGHT - SAFETY && level < PRINT_FIT_STEPS.length - 1) {
      level += 1;
      applyStep(report, level);
      height = report.getBoundingClientRect().height;
    }

    const fits = height <= PAGE_HEIGHT - SAFETY;
    const step = PRINT_FIT_STEPS[level];
    return {
      height: Math.round(height),
      pageHeight: Math.round(PAGE_HEIGHT),
      fits,
      level,
      scaled: fits && level > 0,
      scalePercent: Math.round((step.size / PRINT_FIT_STEPS[0].size) * 100),
      summarySize: step.size,
      columns: step.columns > 1,
    };
  } finally {
    style.remove();
    window.scrollTo(0, scrollY);
  }
}
