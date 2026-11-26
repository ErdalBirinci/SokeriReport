import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

/**
 * Real-browser regression test. Chrome is skipped locally only when it is
 * unavailable; CI sets A4_TEST_REQUIRE_CHROME=1 so a missing browser is fatal.
 */
const TEST_NAME = 'keeps the A4 print layout to one page across comparison and section variants';
const A4_WIDTH_PT = 594.96;
const A4_HEIGHT_PT = 841.92;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type PrintToggles = {
  quality: boolean;
  comparison: boolean;
  questions: boolean;
};

interface Scenario {
  slug: string;
  previousDays: number;
  warning: boolean;
  options: PrintToggles;
  periods: Array<'1m' | '3m'>;
}

const allSections: PrintToggles = { quality: true, comparison: true, questions: true };
const onlyQuality: PrintToggles = { quality: true, comparison: false, questions: false };
const onlyComparison: PrintToggles = { quality: false, comparison: true, questions: false };
const onlyQuestions: PrintToggles = { quality: false, comparison: false, questions: true };
const noSections: PrintToggles = { quality: false, comparison: false, questions: false };

const scenarios: Scenario[] = [
  { slug: 'warning-all', previousDays: 21, warning: true, options: allSections, periods: ['1m', '3m'] },
  { slug: 'no-warning-all', previousDays: 90, warning: false, options: allSections, periods: ['1m', '3m'] },
  { slug: 'warning-quality-only', previousDays: 21, warning: true, options: onlyQuality, periods: ['1m'] },
  { slug: 'warning-comparison-only', previousDays: 21, warning: true, options: onlyComparison, periods: ['1m'] },
  { slug: 'warning-questions-only', previousDays: 21, warning: true, options: onlyQuestions, periods: ['1m'] },
  { slug: 'warning-no-sections', previousDays: 21, warning: true, options: noSections, periods: ['1m'] },
];

const artifactDir = join(process.cwd(), 'test-results', 'a4');
const pdftotext = Bun.which('pdftotext');

function enabledSections(options: PrintToggles): number {
  return Object.values(options).filter(Boolean).length;
}

function findChrome(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
}

function mediaBox(pdf: Buffer): [number, number] | null {
  const match = pdf
    .toString('latin1')
    .match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function makePreviousCsv(days: number): string {
  const start = Date.UTC(2026, 6, 9);
  const rows = ['Timestamp,Glucose'];
  for (let index = 0; index < days * 24; index += 1) {
    const date = new Date(start + index * 3_600_000);
    const pad = (value: number) => String(value).padStart(2, '0');
    rows.push(
      `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
        `${pad(date.getUTCHours())}:00,${100 + (index % 40)}`,
    );
  }
  return rows.join('\n');
}

function readPdfText(path: string): string | null {
  if (!pdftotext) {
    if (process.env.A4_REQUIRE_PDF_TEXT === '1') {
      throw new Error(
        'pdftotext is required for PDF content checks. Install poppler-utils or unset A4_REQUIRE_PDF_TEXT.',
      );
    }
    return null;
  }

  const result = Bun.spawnSync([pdftotext, '-layout', path, '-']);
  if (result.exitCode !== 0) {
    throw new Error(`pdftotext failed for ${path}`);
  }
  return result.stdout.toString();
}

interface Cdp {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  evaluate(expression: string): Promise<any>;
  close(): void;
}

async function connectCdp(port: number): Promise<Cdp> {
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as Array<{
    type: string;
    webSocketDebuggerUrl: string;
  }>;
  const target = targets.find((candidate) => candidate.type === 'page');
  if (!target) throw new Error('Chrome did not expose a page target');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket failed')), { once: true });
  });

  let nextId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (typeof message.id !== 'number') return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message ?? 'CDP error'));
    else waiter.resolve(message.result);
  });

  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return {
    send,
    async evaluate(expression: string) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(
          result.result?.description ?? result.exceptionDetails.text ?? 'Page evaluation failed',
        );
      }
      return result.result?.value;
    },
    close() {
      socket.close();
    },
  };
}

function isNavigationRace(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Execution context was destroyed|Cannot find context|Inspected target navigated|Target closed/i.test(
    message,
  );
}

async function waitForPage(
  cdp: Cdp,
  expression: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      if (await cdp.evaluate(expression)) return;
    } catch (error) {
      if (!isNavigationRace(error)) throw error;
      lastError = error;
    }
    await sleep(100);
  }

  const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
  throw new Error(`Chrome page did not become ready within ${timeoutMs} ms.${detail}`);
}

async function waitForDebugPort(profile: string): Promise<number> {
  const file = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const port = Number(readFileSync(file, 'utf8').split(/\r?\n/)[0]);
      if (Number.isFinite(port) && port > 0) return port;
    } catch {
      // Chrome writes this file after opening its debugging socket.
    }
    await sleep(100);
  }
  throw new Error('Chrome did not expose a DevTools port');
}

const sampleReady = `(() => {
  const button = Array.from(document.querySelectorAll('#main button')).find((candidate) =>
    candidate.textContent?.includes('Try with sample data'),
  );
  return document.readyState === 'complete' && Boolean(button);
})()`;

const reportReady = `Boolean(document.querySelector('select[aria-label="Report period"]'))`;
const printOptionsReady = `Boolean(document.querySelector('.print-options-modal'))`;

async function uploadPrevious(cdp: Cdp, scenario: Scenario): Promise<void> {
  const fileName = `previous-${scenario.slug}.csv`;
  const csv = JSON.stringify(makePreviousCsv(scenario.previousDays));
  await cdp.evaluate(`(() => {
    const csv = ${csv};
    const file = new File([csv], ${JSON.stringify(fileName)}, { type: 'text/csv' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector('input[accept*=".tsv"]');
    if (!input) throw new Error('Comparison input not found');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitForPage(
    cdp,
    `(() => {
      const meta = document.querySelector('.comparison-meta')?.textContent ?? '';
      const warning = Boolean(document.querySelector('.comparison-warning'));
      return meta.includes(${JSON.stringify(fileName)}) && warning === ${scenario.warning};
    })()`,
    10_000,
  );
}

async function setPrintOptions(cdp: Cdp, options: PrintToggles): Promise<void> {
  await cdp.evaluate(`(() => {
    const printSetup = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.trim() === 'Print setup',
    );
    if (!printSetup) throw new Error('Print setup button not found');
    printSetup.click();
  })()`);
  await waitForPage(cdp, printOptionsReady, 5_000);

  await cdp.evaluate(`(() => {
    const desired = ${JSON.stringify(options)};
    const labelToKey = {
      'Data quality': 'quality',
      'Previous report': 'comparison',
      'Questions': 'questions',
    };
    for (const toggle of document.querySelectorAll('.print-options-modal .option-toggle')) {
      const label = Object.keys(labelToKey).find((candidate) => toggle.textContent?.includes(candidate));
      if (!label) continue;
      const checkbox = toggle.querySelector('input[type="checkbox"]');
      const key = labelToKey[label];
      if (checkbox && checkbox.checked !== desired[key]) checkbox.click();
    }
    const apply = document.querySelector('.print-options-modal .btn-primary');
    if (!apply) throw new Error('Print setup Apply button not found');
    apply.click();
  })()`);
  await waitForPage(
    cdp,
    `document.querySelectorAll('.print-optional:not(.print-hide)').length === ${enabledSections(options)}`,
    5_000,
  );
}

async function selectPeriod(cdp: Cdp, scenario: Scenario, period: '1m' | '3m'): Promise<void> {
  const expectedDays = period === '1m' ? 30 : 90;
  await cdp.evaluate(`(() => {
    const select = document.querySelector('select[aria-label="Report period"]');
    if (!select) throw new Error('Report period selector not found');
    select.value = '${period}';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitForPage(
    cdp,
    `(() => {
      const select = document.querySelector('select[aria-label="Report period"]');
      const sub = document.querySelector('.report-sub')?.textContent ?? '';
      const warning = Boolean(document.querySelector('.comparison-warning'));
      return select?.value === '${period}' &&
        sub.includes('${expectedDays} days') &&
        warning === ${scenario.warning};
    })()`,
    10_000,
  );
}

async function runA4Test(chromePath: string): Promise<void> {
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  let chrome: ReturnType<typeof Bun.spawn> | undefined;
  let cdp: Cdp | undefined;
  const profile = mkdtempSync(join(tmpdir(), 'sokerireport-a4-'));
  mkdirSync(artifactDir, { recursive: true });

  try {
    server = await createServer({
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    const appUrl = server.resolvedUrls?.local?.[0];
    if (!appUrl) throw new Error('Vite did not expose a local URL');

    chrome = Bun.spawn(
      [
        chromePath,
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--no-proxy-server',
        '--proxy-bypass-list=*',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
        `--user-data-dir=${profile}`,
        appUrl,
      ],
      { stdout: 'ignore', stderr: 'inherit' },
    );
    const port = await waitForDebugPort(profile);
    cdp = await connectCdp(port);
    await cdp.send('Page.navigate', { url: appUrl });
    try {
      await waitForPage(cdp, sampleReady);
    } catch (error) {
      const diagnostics = await cdp
        .evaluate(`JSON.stringify({
          url: location.href,
          title: document.title,
          body: (document.body?.innerText ?? '').slice(0, 1200),
        })`)
        .catch((diagnosticError) => `diagnostics failed: ${String(diagnosticError)}`);
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
      if (screenshot?.data) {
        writeFileSync(join(artifactDir, 'failure.png'), Buffer.from(screenshot.data, 'base64'));
      }
      throw new Error(`${error instanceof Error ? error.message : String(error)} Page: ${diagnostics}`);
    }

    await cdp.evaluate(`(() => {
      const sample = Array.from(document.querySelectorAll('#main button')).find((button) =>
        button.textContent?.includes('Try with sample data'),
      );
      if (!sample) throw new Error('Sample data button not found');
      sample.click();
    })()`);
    await waitForPage(cdp, reportReady, 10_000);

    for (const scenario of scenarios) {
      await uploadPrevious(cdp, scenario);
      await setPrintOptions(cdp, scenario.options);

      for (const period of scenario.periods) {
        await selectPeriod(cdp, scenario, period);
        const expectedDays = period === '1m' ? 30 : 90;
        const state = await cdp.evaluate(`(() => {
          const select = document.querySelector('select[aria-label="Report period"]');
          return {
            period: select?.value,
            reportSub: document.querySelector('.report-sub')?.textContent?.replace(/\\s+/g, ' ').trim(),
            warningText: document.querySelector('.comparison-warning')?.textContent?.replace(/\\s+/g, ' ').trim(),
            optionalSections: document.querySelectorAll('.print-optional:not(.print-hide)').length,
          };
        })()`);

        expect(state.period).toBe(period);
        expect(state.reportSub).toContain(`${expectedDays} days`);
        expect(state.optionalSections).toBe(enabledSections(scenario.options));
        expect(Boolean(state.warningText)).toBe(scenario.warning);
        if (scenario.warning) {
          expect(state.warningText).toContain('Different window lengths.');
        }

        const preflight = await cdp.evaluate(`(async () => {
          const module = await import(new URL('src/lib/printFit.ts', document.baseURI).href);
          return module.prepareReportForPrint();
        })()`);
        expect(preflight?.fits, JSON.stringify(preflight)).toBe(true);
        expect(preflight.height).toBeLessThanOrEqual(preflight.pageHeight - 16);
        // Fitting must not be bought with unreadable print type.
        expect(preflight.summarySize).toBeGreaterThanOrEqual(6.8);
        expect(preflight.scalePercent).toBeGreaterThanOrEqual(87);

        const result = await cdp.send('Page.printToPDF', {
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: false,
        });
        const pdf = Buffer.from(result.data, 'base64');
        expect(pageCount(pdf)).toBe(1);

        const box = mediaBox(pdf);
        expect(box).not.toBeNull();
        expect(box![0]).toBeCloseTo(A4_WIDTH_PT, 1);
        expect(box![1]).toBeCloseTo(A4_HEIGHT_PT, 1);

        const pdfPath = join(artifactDir, `${scenario.slug}-${period}.pdf`);
        writeFileSync(pdfPath, pdf);
        const text = readPdfText(pdfPath);
        if (text !== null) {
          if (scenario.options.quality) expect(text).toContain('Data quality');
          if (scenario.options.comparison) expect(text).toContain('Compared with previous export');
          if (scenario.options.questions) expect(text).toContain('Night-to-morning');
          if (scenario.options.comparison) {
            if (scenario.warning) expect(text).toContain('Different window lengths.');
            else expect(text).not.toContain('Different window lengths.');
          }
        }
      }
    }
  } finally {
    cdp?.close();
    chrome?.kill();
    await server?.close();
    await sleep(200);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome can briefly hold its profile on Windows; the OS temp directory
      // will clean it up if this attempt races process exit.
    }
  }
}

const executable = findChrome();
const requireChrome = process.env.A4_TEST_REQUIRE_CHROME === '1';

if (process.env.A4_TEST_SKIP === '1') {
  test.skip(`${TEST_NAME} (A4_TEST_SKIP=1)`, () => {});
} else if (!executable && requireChrome) {
  test(TEST_NAME, () => {
    throw new Error(
      'Chrome is required for the A4 print regression in this environment. ' +
        'Install Chrome or set CHROME_PATH.',
    );
  });
} else if (!executable) {
  test.skip(`${TEST_NAME} (Chrome not found)`, () => {});
} else {
  test(TEST_NAME, () => runA4Test(executable), 180_000);
}
