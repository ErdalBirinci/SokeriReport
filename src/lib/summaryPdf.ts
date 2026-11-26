import type { SummaryImport, SummaryValue } from './types';

const numberFrom = (raw: string): number | null => {
  const value = Number(raw.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
};

const countFrom = (raw: string): number | null => {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value) : null;
};

const percentNear = (lines: string[], labels: RegExp, compact: string): number | null => {
  for (const line of lines) {
    if (!labels.test(line)) continue;
    const match = line.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
    if (!match) continue;
    const value = numberFrom(match[1]);
    if (value !== null && value >= 0 && value <= 100) return value;
  }
  const match = compact.match(
    new RegExp(`(?:${labels.source})[^.%]{0,90}?(\\d{1,3}(?:[.,]\\d+)?)\\s*%`, 'i'),
  );
  if (!match) return null;
  const value = numberFrom(match[1]);
  return value !== null && value >= 0 && value <= 100 ? value : null;
};

const label = /time in (?:tight )?range|\btir\b|hedef aral[ıi]k|zielbereich/i;
const below = /(?:time )?below range|hypoglyc|düşük|niedrig|\blow\b/i;
const above = /(?:time )?above range|hyperglyc|yüksek|hoch|\bhigh\b/i;
const veryLowLabel = /level 2|very low|sehr niedrig|çok düşük/i;
const veryHighLabel = /very high|sehr hoch|çok yüksek/i;
const meanLabel = /average glucose|mean glucose|ortalama glikoz|durchschnittliche glucose|mittlere glucose/i;
const cvLabel = /\bcv\b|coefficient of variation|variabilit[äa]t|değişkenlik/i;
const gmiLabel = /\bgmi\b|glucose management indicator/i;
const coverageLabel = /sensor active|sensor coverage|sens[öo]r|sensoraktiv/i;

/**
 * A LibreView AGP/snapshot PDF prints the metrics but not the reading rows. It
 * is useful for a visit, but it cannot support event or gap analysis, so this
 * extractor returns only values it can read next to a recognised label.
 */
export function parseSummaryPdf(pages: string[], fileName: string): SummaryImport | null {
  const text = pages.join('\n');
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const compact = text.replace(/\s+/g, ' ');

  const looksLikeSummary =
    /ambulatory glucose profile|\bagp\b|glucose summary|glikoz özeti|zusammenfassung/i.test(text) ||
    (label.test(text) && (meanLabel.test(text) || gmiLabel.test(text)));
  if (!looksLikeSummary) return null;

  const meanMatch = compact.match(
    /(?:average glucose|mean glucose|ortalama glikoz|durchschnittliche glucose|mittlere glucose)[^0-9]{0,60}(\d{1,4}(?:[.,]\d+)?)\s*(mg\/dL|mmol\/L)/i,
  );
  const mean = meanMatch ? numberFrom(meanMatch[1]) : null;
  const unit: SummaryImport['unit'] =
    meanMatch?.[2]?.toLowerCase() === 'mmol/l' || (!meanMatch && /mmol\/l/i.test(text))
      ? 'mmol/L'
      : 'mg/dL';

  const tir = percentNear(lines, label, compact);
  const tbr = percentNear(lines, below, compact);
  const tar = percentNear(lines, above, compact);
  const veryLow = percentNear(lines, veryLowLabel, compact);
  const veryHigh = percentNear(lines, veryHighLabel, compact);
  const cv = percentNear(lines, cvLabel, compact);
  const gmi = percentNear(lines, gmiLabel, compact);
  const coverage = percentNear(lines, coverageLabel, compact);

  const plausibleMean =
    mean !== null && (unit === 'mmol/L' ? mean >= 1.1 && mean <= 33.3 : mean >= 20 && mean <= 600)
      ? mean
      : null;
  if (tir === null || (plausibleMean === null && gmi === null)) return null;

  const readCount = compact.match(/(\d[\d.,]{0,8})\s*(?:readings?|messwerte|ölçüm|okuma)/i);
  const readings = readCount ? countFrom(readCount[1]) ?? undefined : undefined;
  const dayCount = compact.match(/(\d{1,3})\s*(?:days?|tage|gün)/i);
  const days = dayCount ? Number(dayCount[1]) : undefined;
  const periodText = dayCount
    ? `${dayCount[1]} ${dayCount[0].replace(/^\d{1,3}\s*/, '')}`
    : undefined;

  const values: SummaryValue[] = [];
  const push = (name: string, value: number | null, suffix: string) => {
    if (value !== null) values.push({ label: name, value: `${value.toLocaleString('en-GB')}${suffix}` });
  };
  push('Time in range', tir, '%');
  push('Time below range', tbr, '%');
  push('Time above range', tar, '%');
  push('Very low', veryLow, '%');
  push('Very high', veryHigh, '%');
  push('Average glucose', plausibleMean, unit === 'mmol/L' ? ' mmol/L' : ' mg/dL');
  push('CV', cv, '%');
  push('GMI', gmi, '%');
  push('Sensor active', coverage, '%');

  if (values.length < 2) return null;

  return {
    fileName,
    source: /libreview|freestyle libre/i.test(text)
      ? 'LibreView summary PDF'
      : /dexcom|clarity/i.test(text)
        ? 'Dexcom summary PDF'
        : 'Glucose summary PDF',
    unit,
    periodText,
    days,
    readings,
    tir,
    tbr: tbr ?? undefined,
    tar: tar ?? undefined,
    veryLow: veryLow ?? undefined,
    veryHigh: veryHigh ?? undefined,
    mean: plausibleMean ?? undefined,
    cv: cv ?? undefined,
    gmi: gmi ?? undefined,
    coverage: coverage ?? undefined,
    values,
    warnings: [
      'This PDF prints summary values only; no individual readings were available.',
      'TIR, mean, CV and GMI are shown exactly as printed. AGP percentiles, hypoglycemia episodes, dawn phenomenon and sensor gaps cannot be computed.',
      'Check the values against the PDF before sharing; request the Glucose Data CSV or JSON for a full report.',
    ],
  };
}
