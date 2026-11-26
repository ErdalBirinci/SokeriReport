/**
 * PDF text extraction for report imports.
 *
 * pdf.js is loaded lazily so the app shell stays small and PDF support only
 * downloads when a PDF is actually opened. The worker URL is imported through
 * a browser-only module: Node/Bun tests fall back to pdf.js's fake worker.
 */

export interface PdfText {
  /** Text of each page, already reconstructed into lines. */
  pages: string[];
  pageCount: number;
}

interface RawItem {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

const LIGATURES: Record<string, string> = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'ft',
  '\uFB06': 'st',
};

function clean(value: string): string {
  return value
    .replace(/\u00ad/g, '')
    .replace(/[\uFB00-\uFB06]/g, (char) => LIGATURES[char] ?? char)
    .replace(/\u00a0/g, ' ')
    .replace(/\u2212/g, '-')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Rebuild visual lines from positioned text. PDF producers frequently emit
 * cells in content order rather than reading order, so grouping by the y
 * coordinate is what makes a table row readable again.
 */
function buildPageLines(items: unknown[]): string[] {
  const parts: RawItem[] = [];

  for (const entry of items) {
    const item = entry as {
      str?: unknown;
      transform?: unknown;
      width?: unknown;
      height?: unknown;
    };
    if (typeof item.str !== 'string' || !item.str.trim() || !Array.isArray(item.transform)) continue;
    const transform = item.transform as number[];
    if (transform.length < 6) continue;

    const size = Math.hypot(transform[2], transform[3]) || (typeof item.height === 'number' ? item.height : 10);
    parts.push({
      str: item.str,
      x: transform[4],
      y: transform[5],
      width: typeof item.width === 'number' ? item.width : 0,
      size: size > 0 ? size : 10,
    });
  }

  parts.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: RawItem[][] = [];
  for (const part of parts) {
    const row = rows[rows.length - 1];
    const tolerance = Math.max(1.2, Math.min(part.size, row?.[0].size ?? part.size) * 0.35);
    if (row && Math.abs(row[0].y - part.y) <= tolerance) row.push(part);
    else rows.push([part]);
  }

  const lines: string[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let line = '';
    let end = Number.NEGATIVE_INFINITY;
    for (const part of row) {
      const gap = part.x - end;
      if (line && gap > Math.max(1, part.size * 0.16)) line += ' ';
      line += part.str;
      end = part.x + part.width;
    }
    const cleaned = clean(line);
    if (cleaned) lines.push(cleaned);
  }

  return lines;
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<PdfText> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof document !== 'undefined') {
    const { default: workerSrc } = await import('./pdfWorkerUrl');
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  const loading = pdfjs.getDocument({
    data: new Uint8Array(buffer.slice(0)),
    useSystemFonts: false,
    disableFontFace: true,
    // Text extraction does not need pdf.js to resolve every standard font;
    // keep the console free of that warning while still surfacing errors.
    verbosity: 0,
  });
  const doc = await loading.promise;
  const pageCount = doc.numPages;
  const pages: string[] = [];

  try {
    for (let index = 1; index <= pageCount; index += 1) {
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      pages.push(buildPageLines(content.items).join('\n'));
      page.cleanup();
    }
  } finally {
    await loading.destroy();
  }

  return { pages, pageCount };
}
