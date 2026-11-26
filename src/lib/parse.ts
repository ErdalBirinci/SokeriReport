import Papa from 'papaparse';
import type {
  CarbEntry,
  Dataset,
  DateMeta,
  DateOrder,
  InsulinDose,
  ParseOutcome,
  Reading,
  ReadingKind,
  TimeMeta,
} from './types';

const MMOL_FACTOR = 18.0182;

/**
 * Column keywords in the languages we see in real exports (EN, DE, TR, ES, FR).
 * The column order and even the delimiter differ between locales, so we match
 * on meaning instead of on a fixed header row.
 */
const TEXT = {
  time: /(timestamp|zeitstempel|date\s*\/?\s*time|datetime|zaman|tarih|fecha|horodatage|datum|uhrzeit)/i,
  recordType: /(record\s*type|datensatztyp|kay[ıi]t\s*t[üu]r[üu]|tipo\s*de\s*registro|type\s*d.?enregistrement)/i,
  glucose: /(glucose|glukose|glikoz|glucosa|glyc[ée]mie|kan\s*[şs]ekeri|[şs]eker)/i,
  scan: /(scan|tarama|escaneo|balayage)/i,
  strip: /(strip|[şs]erit|tira|bandelette|blutzucker)/i,
  historic: /(historic|historical|historisch|historik|hist[óo]ric|historique|ge[çc]mi[şs])/i,
  rapid: /(rapid|schnell|h[ıi]zl[ıi]|r[áa]pida|rapide)/i,
  long: /(long[-\s]?acting|langzeit|uzun\s*etkili|acci[óo]n\s*prolongada|action\s*prolong[ée]e|\blong\b|\bbasal\b)/i,
  insulin: /(insulin|ins[üu]lin|insulina)/i,
  carb: /(carbohydrate|\bcarb|kohlenhydrat|karbonhidrat|hidrato|glucide|karb)/i,
  nonNumeric: /(non[-\s]?numeric|nicht\s*numerisch|say[ıi]sal\s*olmayan|no\s*num[ée]ric|non\s*numerico)/i,
  eventType: /(event\s*type|ereignistyp|olay\s*t[üu]r[üu]|tipo\s*de\s*evento|type\s*d.?[ée]v[ée]nement)/i,
  eventSubtype: /(event\s*subtype|ereignisuntertyp|olay\s*alt|subtipo|sous-type)/i,
  genericValue: /(glucose|glukose|glikoz|glucosa|glyc[ée]mie|kan\s*[şs]ekeri|[şs]eker|sgv|de[ğg]er|value|mg\s*\/?\s*dl|mmol)/i,
  genericTime: /(time|date|timestamp|zaman|tarih|datum|fecha|horodatage|uhrzeit)/i,
} as const;

const fail = (error: string): ParseOutcome => ({ ok: false, error });

/** Decode an export that may be UTF-8, UTF-16 (with BOM) or a Windows code page. */
function decodeBuffer(buffer: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16LE' };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16BE' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
  } catch {
    // Turkish Excel exports are usually Windows-1254; 1252 covers the rest of the West.
    try {
      return { text: new TextDecoder('windows-1254').decode(bytes), encoding: 'Windows-1254' };
    } catch {
      return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'Windows-1252' };
    }
  }
}

/** Parse a numeric cell tolerating "5,6" decimals, unit suffixes and blanks. */
function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (/^(nan|n\/a|null|-|--)$/i.test(s)) return null;
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  else if (s.includes(',')) s = s.replace(/,/g, '');
  s = s.replace(/\s*(mg\/dl|mmol\/l|mg|mmol|u|units|einheiten|birim|g|gr|gramm)\s*$/i, '').replace(/\s/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseOne(raw: string, order: DateOrder): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const iso = s.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,3})?\s*(Z|[+-]\d{2}:?\d{2})?)?/i,
  );
  if (iso) {
    const y = +iso[1];
    const mo = +iso[2];
    const d = +iso[3];
    const h = iso[4] ? +iso[4] : 0;
    const mi = iso[5] ? +iso[5] : 0;
    const se = iso[6] ? +iso[6] : 0;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const marker = (iso[7] ?? '').toUpperCase();
      if (!marker) return new Date(y, mo - 1, d, h, mi, se).getTime();
      // An explicit zone marker means the value is an instant, not wall-clock time.
      let offsetMinutes = 0;
      if (marker !== 'Z') {
        const digits = marker.slice(1).replace(':', '');
        offsetMinutes =
          (marker.startsWith('-') ? -1 : 1) * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
      }
      return Date.UTC(y, mo - 1, d, h, mi, se) - offsetMinutes * 60_000;
    }
  }

  const m = s.match(
    /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*([AaPp][Mm])?/,
  );
  if (!m) return null;

  const a = +m[1];
  const b = +m[2];
  let y = +m[3];
  if (y < 100) y += 2000;

  let mo = order === 'DMY' ? b : a;
  let d = order === 'DMY' ? a : b;
  if (mo > 12 && d <= 12) {
    const tmp = mo;
    mo = d;
    d = tmp;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  let h = m[4] ? +m[4] : 0;
  const mi = m[5] ? +m[5] : 0;
  const se = m[6] ? +m[6] : 0;
  const ampm = (m[7] || '').toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;

  return new Date(y, mo - 1, d, h, mi, se).getTime();
}

/** Nightscout `date` is normally epoch milliseconds; a few exports use seconds. */
function normaliseEpoch(value: number): number {
  return value > 0 && value < 1e11 ? value * 1000 : value;
}

/**
 * Exports use the account locale (DD.MM.YYYY, MM/DD/YYYY, …). We scan every date
 * cell: a value above 12 in the first or second slot proves the order, while
 * dates where both slots are <= 12 remain ambiguous and get a warning.
 */
function dateSetup(
  samples: string[],
  override?: DateOrder,
): { dateOf: (raw: string) => number | null; meta: DateMeta; time: TimeMeta; warnings: string[] } {
  let dayFirstVotes = 0;
  let monthFirstVotes = 0;
  let ambiguous = 0;
  let utcMarkers = 0;
  let sample: string | undefined;
  const examples: string[] = [];

  for (const raw of samples) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[ T]\d{1,2}:\d{2}/.test(s) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) utcMarkers++;

    const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
    if (!m) continue;
    const first = +m[1];
    const second = +m[2];
    if (first < 1 || first > 31 || second < 1 || second > 31) continue;
    if (!sample) sample = s;

    if (first > 12 && second <= 12) dayFirstVotes++;
    else if (second > 12 && first <= 12) monthFirstVotes++;
    else if (first <= 12 && second <= 12) {
      ambiguous++;
      if (examples.length < 3 && !examples.includes(s)) examples.push(s);
    }
  }

  const conflict = dayFirstVotes > 0 && monthFirstVotes > 0;
  const detected: DateOrder = monthFirstVotes > dayFirstVotes ? 'MDY' : 'DMY';
  const order = override ?? detected;
  const hasEvidence = dayFirstVotes + monthFirstVotes > 0;
  // A single unambiguous date settles the whole file: 25.11 proves day-first even
  // when other rows look like 03.04. Only missing or contradictory evidence is risky.
  const uncertain = !override && (hasEvidence ? conflict : ambiguous > 0);

  const meta: DateMeta = {
    order,
    source: override ? 'override' : hasEvidence ? 'detected' : 'default',
    ambiguous,
    examples,
    conflict,
    uncertain,
    sample,
  };

  const warnings: string[] = [];
  if (uncertain) {
    const label = order === 'DMY' ? 'DD.MM.YYYY' : 'MM.DD.YYYY';
    if (conflict) {
      warnings.push(
        `The file mixes day-first and month-first dates; ${label} was used. You can switch it from the report header.`,
      );
    } else {
      warnings.push(
            `Date format is ambiguous: ${ambiguous} dates could be day/month or month/day (e.g. ${examples[0] ?? '03/04/2026'}). Assuming ${label} — switch it in the header.`,
      );
    }
  }
  if (utcMarkers > 0) {
    warnings.push('Some timestamps carried a UTC/timezone marker and were converted to local time.');
  }

  return {
    dateOf: (raw: string) => parseOne(raw, order),
    meta,
    time: { absolute: utcMarkers > 0, utc: utcMarkers > 0 },
    warnings,
  };
}

function findColumn(fields: string[], pattern: RegExp, exclude?: RegExp): string | undefined {
  return fields.find((field) => pattern.test(field) && (!exclude || !exclude.test(field)));
}

function listHeaders(fields: string[]): string {
  return fields.length ? fields.slice(0, 8).join(' · ') : '(header row could not be read)';
}

/** Read an explicit unit from the header row, if the export states one. */
function unitFromHeaders(fields: string[]): 'mg/dL' | 'mmol/L' | undefined {
  const headers = fields.join(' ');
  if (/mmol/i.test(headers)) return 'mmol/L';
  if (/mg\s*\/?\s*dl/i.test(headers)) return 'mg/dL';
  return undefined;
}

function finalize(
  readings: Reading[],
  insulin: InsulinDose[],
  carbs: CarbEntry[],
  meta: Dataset['meta'],
  warnings: string[],
  /** Unit stated by the column headers; beats guessing from the value spread. */
  unitHint?: 'mg/dL' | 'mmol/L',
): ParseOutcome {
  const valid = readings.filter((r) => Number.isFinite(r.t) && r.v > 0 && r.v < 800);
  if (!valid.length) {
    return fail(
      'No glucose readings found in the file. Try a LibreView "Glucose Data" CSV, a Dexcom Clarity CSV or a Nightscout JSON file.',
    );
  }

  valid.sort((a, b) => a.t - b.t);
  const deduped: Reading[] = [];
  for (const r of valid) {
    const last = deduped[deduped.length - 1];
    if (last && last.t === r.t) {
      if (r.kind === 'cgm' && last.kind !== 'cgm') deduped[deduped.length - 1] = r;
      continue;
    }
    deduped.push(r);
  }

  if (deduped.length < 8) {
    return fail('Not enough readings to analyze (at least 8 glucose values are required).');
  }

  const sorted = deduped.map((r) => r.v).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // A header that names the unit is authoritative; otherwise mmol/L values are
  // far below 40 while mg/dL values are almost never centred that low.
  const isMmol =
    unitHint === 'mmol/L' ? true : unitHint === 'mg/dL' ? false : median > 0 && median < 40;

  const normalised: Reading[] = deduped.map((r) => ({
    ...r,
    v: Math.round(isMmol ? r.v * MMOL_FACTOR : r.v),
  }));

  const spanDays = (normalised[normalised.length - 1].t - normalised[0].t) / 86_400_000;
  if (spanDays < 1) {
    warnings.push('Data spans less than 1 day; results have limited representativeness.');
  } else if (spanDays < 10) {
    warnings.push('Data is shorter than the 14-day minimum for a standard CGM report.');
  }
  if (isMmol) {
    warnings.push('Glucose values were read as mmol/L and converted to mg/dL.');
  }

  const dataset: Dataset = {
    readings: normalised,
    insulin: insulin.slice().sort((a, b) => a.t - b.t),
    carbs: carbs.slice().sort((a, b) => a.t - b.t),
    meta: { ...meta, unit: isMmol ? 'mmol/L' : 'mg/dL' },
  };

  return { ok: true, dataset, warnings };
}

function parseLibreView(text: string, fileName: string, override?: DateOrder): ParseOutcome {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    if (line.split(/[;,\t]/).length < 4) return false;
    return (TEXT.recordType.test(line) || TEXT.time.test(line)) && TEXT.glucose.test(line);
  });
  if (start < 0)   return fail('LibreView header not found (no time and glucose columns).');

  const parsed = Papa.parse<Record<string, string>>(lines.slice(start).join('\n'), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  const fields = parsed.meta.fields ?? [];
  const timeCol = findColumn(fields, TEXT.time);
  if (!timeCol) {
    return fail(`Time column not found. Headers found: ${listHeaders(fields)}`);
  }

  const typeCol = findColumn(fields, TEXT.recordType);
  const scanCol = findColumn(fields, TEXT.scan);
  const stripCol = findColumn(fields, TEXT.strip, TEXT.historic);
  const historicCol =
    findColumn(fields, TEXT.historic) ??
    findColumn(fields, TEXT.glucose, new RegExp(`${TEXT.scan.source}|${TEXT.strip.source}`, 'i'));
  const rapidCol =
    findColumn(fields, TEXT.rapid, TEXT.nonNumeric) ??
    findColumn(fields, TEXT.insulin, new RegExp(`${TEXT.long.source}|${TEXT.nonNumeric.source}`, 'i'));
  const longCol = findColumn(fields, TEXT.long, TEXT.nonNumeric);
  const carbCol = findColumn(fields, TEXT.carb);

  if (!historicCol && !scanCol && !stripCol) {
    return fail(`Glucose column not found. Headers found: ${listHeaders(fields)}`);
  }

  const rows = parsed.data;
  const dateInfo = dateSetup(rows.map((row) => row[timeCol] ?? ''), override);
  const dateOf = dateInfo.dateOf;

  const readings: Reading[] = [];
  const insulin: InsulinDose[] = [];
  const carbs: CarbEntry[] = [];
  let skipped = 0;

  for (const row of rows) {
    const t = dateOf(row[timeCol] ?? '');
    if (t === null) {
      if (Object.values(row).some((value) => (value ?? '').trim())) skipped++;
      continue;
    }

    const typeRaw = (typeCol ? row[typeCol] ?? '' : '').trim();
    const typeNum = typeRaw ? Number(typeRaw) : NaN;
    const label = typeRaw.toLowerCase();

    let value: number | null = null;
    let kind: ReadingKind = 'cgm';

    if (typeNum === 1 || TEXT.scan.test(label)) {
      value = scanCol ? toNumber(row[scanCol]) : null;
      kind = 'scan';
    } else if (typeNum === 2 || TEXT.strip.test(label)) {
      value = stripCol ? toNumber(row[stripCol]) : null;
      kind = 'bg';
    } else if (typeNum === 0 || !typeCol || TEXT.historic.test(label) || TEXT.glucose.test(label)) {
      value = (historicCol ? toNumber(row[historicCol]) : null) ?? (scanCol ? toNumber(row[scanCol]) : null);
      kind = 'cgm';
    }

    if (value !== null && value > 0) readings.push({ t, v: value, kind });

    if (rapidCol) {
      const units = toNumber(row[rapidCol]);
      if (units !== null && units > 0) insulin.push({ t, units, kind: 'rapid' });
    }
    if (longCol) {
      const units = toNumber(row[longCol]);
      if (units !== null && units > 0) insulin.push({ t, units, kind: 'long' });
    }
    if (carbCol) {
      const grams = toNumber(row[carbCol]);
      if (grams !== null && grams > 0) carbs.push({ t, grams });
    }
  }

  const warnings: string[] = [...dateInfo.warnings];
  if (skipped > 0) warnings.push(`${skipped} rows skipped because the date could not be read.`);
  const unitHint = unitFromHeaders(fields);

  return finalize(
    readings,
    insulin,
    carbs,
    {
      source: 'LibreView',
      fileName,
      unit: unitHint ?? 'mg/dL',
      date: dateInfo.meta,
      time: dateInfo.time,
    },
    warnings,
    unitHint,
  );
}

function parseDexcom(text: string, fileName: string, override?: DateOrder): ParseOutcome {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line.split(/[;,\t]/).length >= 4 && TEXT.eventType.test(line) && TEXT.glucose.test(line),
  );
  if (start < 0)   return fail('Dexcom Clarity header not found (no Event Type column).');

  const parsed = Papa.parse<Record<string, string>>(lines.slice(start).join('\n'), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  const fields = parsed.meta.fields ?? [];
  const timeCol = findColumn(fields, TEXT.time);
  const typeCol = findColumn(fields, TEXT.eventType);
  const subtypeCol = findColumn(fields, TEXT.eventSubtype);
  const glucoseCol = findColumn(fields, TEXT.glucose) ?? findColumn(fields, /value/i);
  const insulinCol = findColumn(fields, TEXT.insulin);
  const carbCol = findColumn(fields, TEXT.carb);

  if (!timeCol || !typeCol || !glucoseCol) {
    return fail(`The Dexcom file is missing a time, event type or glucose column. Headers found: ${listHeaders(fields)}`);
  }

  const rows = parsed.data;
  const dateInfo = dateSetup(rows.map((row) => row[timeCol] ?? ''), override);
  const dateOf = dateInfo.dateOf;

  const readings: Reading[] = [];
  const insulin: InsulinDose[] = [];
  const carbs: CarbEntry[] = [];
  let skipped = 0;

  for (const row of rows) {
    const t = dateOf(row[timeCol] ?? '');
    if (t === null) {
      if (Object.values(row).some((value) => (value ?? '').trim())) skipped++;
      continue;
    }
    const eventType = (row[typeCol] ?? '').trim().toLowerCase();

    if (/egv|glucose|glukose|glikoz|glucosa|glyc[ée]mie/.test(eventType)) {
      const value = toNumber(row[glucoseCol]);
      if (value !== null && value > 0) readings.push({ t, v: value, kind: 'cgm' });
    } else if (/calib|kalibrier/.test(eventType)) {
      const value = toNumber(row[glucoseCol]);
      if (value !== null && value > 0) readings.push({ t, v: value, kind: 'bg' });
    } else if (/insulin|ins[üu]lin/.test(eventType)) {
      const units = insulinCol ? toNumber(row[insulinCol]) : null;
      if (units !== null && units > 0) {
        const subtype = subtypeCol ? row[subtypeCol] ?? '' : '';
        insulin.push({ t, units, kind: /long|basal|lang|uzun/i.test(subtype) ? 'long' : 'rapid' });
      }
    } else if (/carb|kohlenhydrat|karbonhidrat|hidrato|glucide/.test(eventType) && carbCol) {
      const grams = toNumber(row[carbCol]);
      if (grams !== null && grams > 0) carbs.push({ t, grams });
    }
  }

  const warnings: string[] = [...dateInfo.warnings];
  if (skipped > 0) warnings.push(`${skipped} rows skipped because the date could not be read.`);
  const unitHint = unitFromHeaders(fields);

  return finalize(
    readings,
    insulin,
    carbs,
    {
      source: 'Dexcom Clarity',
      fileName,
      unit: unitHint ?? 'mg/dL',
      date: dateInfo.meta,
      time: dateInfo.time,
    },
    warnings,
    unitHint,
  );
}

function parseNightscout(text: string, fileName: string): ParseOutcome {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail('Could not read the JSON file. Upload the Nightscout export as-is.');
  }

  const root = json as Record<string, unknown>;
  const entries = Array.isArray(json)
    ? (json as Record<string, unknown>[])
    : Array.isArray(root?.entries)
      ? (root.entries as Record<string, unknown>[])
      : Array.isArray(root?.glucose)
        ? (root.glucose as Record<string, unknown>[])
        : null;
  const treatments = !Array.isArray(json) && Array.isArray(root?.treatments)
    ? (root.treatments as Record<string, unknown>[])
    : [];

  if (!entries) {
    return fail('No "entries" array found in the JSON. A Nightscout or generic JSON export is expected.');
  }

  const readings: Reading[] = [];
  let skipped = 0;
  let absolute = false;
  let utc = false;
  let wallClock = false;

  for (const entry of entries) {
    const raw = entry?.sgv ?? entry?.glucose ?? entry?.value ?? entry?.mbg;
    const value = toNumber(raw);
    if (value === null || value <= 0) continue;

    let t: number | null = null;
    const dateField = entry?.date ?? entry?.dateMillis;
    if (typeof dateField === 'number' && Number.isFinite(dateField)) {
      t = normaliseEpoch(dateField);
      absolute = true;
    } else if (typeof dateField === 'string' && /^\d+$/.test(dateField.trim())) {
      t = normaliseEpoch(Number(dateField));
      absolute = true;
    }
    if (t === null) {
      const dateString = String(entry?.dateString ?? entry?.created_at ?? entry?.time ?? '').trim();
      if (dateString.includes('T') || /Z$/.test(dateString)) {
        const parsedDate = new Date(dateString);
        if (!Number.isNaN(parsedDate.getTime())) {
          t = parsedDate.getTime();
          absolute = true;
          if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateString)) utc = true;
        }
      }
      if (t === null) {
        t = parseOne(dateString, 'DMY');
        if (t !== null) wallClock = true;
      }
    }
    if (t === null) {
      skipped++;
      continue;
    }

    const type = String(entry?.type ?? '').toLowerCase();
    readings.push({ t, v: value, kind: type === 'mbg' ? 'bg' : 'cgm' });
  }

  const insulin: InsulinDose[] = [];
  const carbs: CarbEntry[] = [];

  for (const treatment of treatments) {
    const eventType = String(treatment?.eventType ?? '').toLowerCase();
    let t: number | null = null;
    if (typeof treatment?.created_at === 'string') {
      const parsedDate = new Date(treatment.created_at);
      if (!Number.isNaN(parsedDate.getTime())) t = parsedDate.getTime();
    }
    if (t === null) {
      const raw = treatment?.date ?? treatment?.created_at;
      if (typeof raw === 'number') t = normaliseEpoch(raw);
    }
    if (t === null) continue;

    if (/insulin|bolus|basal|long/.test(eventType)) {
      const units = toNumber(treatment?.insulin ?? treatment?.units);
      if (units !== null && units > 0) {
        insulin.push({ t, units, kind: /basal|long/i.test(eventType) ? 'long' : 'rapid' });
      }
    }
    // A Nightscout meal bolus carries both insulin and carbohydrates.
    if (/carb|meal/.test(eventType)) {
      const grams = toNumber(treatment?.carbs);
      if (grams !== null && grams > 0) carbs.push({ t, grams });
    }
  }

  const warnings: string[] = [];
  if (skipped > 0) warnings.push(`${skipped} Nightscout entries had a timestamp that could not be read.`);

  return finalize(
    readings,
    insulin,
    carbs,
    {
      source: 'Nightscout',
      fileName,
      unit: 'mg/dL',
      date: { order: 'DMY', source: 'detected', ambiguous: 0, examples: [], conflict: false, uncertain: false },
      time: { absolute: absolute && !wallClock, utc },
    },
    warnings,
  );
}

function parseGenericCsv(
  text: string,
  fileName: string,
  override?: DateOrder,
  source = 'Generic CSV',
): ParseOutcome {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  const fields = parsed.meta.fields ?? [];
  const timeCol = findColumn(fields, TEXT.genericTime);
  const valueCol = findColumn(fields, TEXT.genericValue);

  if (!timeCol || !valueCol) {
    return fail(
      `Columns not recognized. A time and a glucose column are required; found: ${listHeaders(fields)}. Supported formats: LibreView CSV, Dexcom Clarity CSV, Nightscout JSON, a CSV with time + glucose columns, or a PDF containing a glucose readings table.`,
    );
  }

  const rows = parsed.data;
  const dateInfo = dateSetup(rows.map((row) => row[timeCol] ?? ''), override);
  const dateOf = dateInfo.dateOf;
  const readings: Reading[] = [];
  let skipped = 0;

  for (const row of rows) {
    const t = dateOf(row[timeCol] ?? '');
    const value = toNumber(row[valueCol]);
    if (t === null || value === null) {
      skipped++;
      continue;
    }
    if (value > 0) readings.push({ t, v: value, kind: 'cgm' });
  }

  const warnings: string[] = [...dateInfo.warnings];
  if (skipped > 0) warnings.push(`${skipped} rows skipped (date or value could not be read).`);
  const unitHint = unitFromHeaders(fields);

  return finalize(
    readings,
    [],
    [],
    {
      source,
      fileName,
      unit: unitHint ?? 'mg/dL',
      date: dateInfo.meta,
      time: dateInfo.time,
    },
    warnings,
    unitHint,
  );
}

const PDF_READINGS_TITLE = /glucose readings|sensor glucose readings|glucose values|readings report/i;
const PDF_SUMMARY =
  /average glucose|mean glucose|time in range|glucose management indicator|ambulatory glucose profile|\bAGP\b/i;

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function pdfUnit(text: string): 'mg/dL' | 'mmol/L' | undefined {
  // Read the unit from the glucose header, not from any target/legend line:
  // LibreView reports often mention mmol/L in a footnote while the table is mg/dL.
  for (const line of text.split(/\r?\n/)) {
    if (!TEXT.glucose.test(line)) continue;
    if (/mmol\s*\/\s*l/i.test(line)) return 'mmol/L';
    if (/mg\s*\/\s*dl/i.test(line)) return 'mg/dL';
  }
  return undefined;
}

function pdfSummaryFacts(text: string): string {
  const facts: string[] = [];
  const average = text.match(
    /average\s+glucose[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*(mg\s*\/\s*dl|mmol\s*\/\s*l)?/i,
  );
  if (average) facts.push(`average glucose ${average[1]} ${average[2] ?? ''}`.trim());

  const tir = text.match(/time\s+in\s+range[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*%/i);
  if (tir) facts.push(`TIR ${tir[1]}%`);

  const cv = text.match(
    /(?:coefficient\s+of\s+variation|\bCV\b)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*%/i,
  );
  if (cv) facts.push(`CV ${cv[1]}%`);

  const gmi = text.match(
    /(?:glucose\s+management\s+indicator|\bGMI\b)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*%/i,
  );
  if (gmi) facts.push(`GMI ${gmi[1]}%`);

  return facts.length ? ` The PDF does report ${facts.join(', ')}, but those are summary values.` : '';
}

function pdfSummaryMessage(text: string): string {
  if (PDF_SUMMARY.test(text)) {
    return `This PDF is a summary report: it contains averages, TIR and charts, but not the individual glucose readings an analysis needs.${pdfSummaryFacts(text)} Export the raw data and upload that instead: LibreView → Download CSV; Dexcom Clarity → Export → CSV; Nightscout → JSON.`;
  }
  return 'No glucose readings table was found in this PDF. PDFs with a date/time + glucose table are supported; summary reports need the raw export instead (LibreView → Download CSV, Dexcom Clarity → Export → CSV, Nightscout → JSON).';
}

function hasPdfReadingsTable(lines: string[], text: string): boolean {
  if (PDF_READINGS_TITLE.test(text)) return true;
  return lines.some((line) => {
    if (/average|mean|median|statistics|distribution|percentile|time in range|target range/i.test(line)) {
      return false;
    }
    return TEXT.glucose.test(line) && /(date|time|timestamp|zeit|tarih|zaman|datum)/i.test(line);
  });
}

/** A line that only carries a date resets the context for daily-log tables. */
function pdfDateHeader(line: string, fallbackYear: string | null): string | null {
  const stripped = line.replace(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[,.]?\s+/i, '');

  const numeric = stripped.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (numeric) return `${numeric[1]}.${numeric[2]}.${numeric[3]}`;

  const iso = stripped.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = stripped.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month) return `${named[1]}.${month}.${named[3]}`;
  }

  const american = stripped.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (american) {
    const month = MONTHS[american[1].slice(0, 3).toLowerCase()];
    if (month) return `${american[2]}.${month}.${american[3]}`;
  }

  const short = stripped.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (short && fallbackYear) return `${short[1]}.${short[2]}.${fallbackYear}`;

  return null;
}

function pdfNumeric(raw: string): number | null {
  return toNumber(raw.replace(/^[<>]/, ''));
}

/**
 * Turn a PDF reading table back into the same time/value pairs the CSV path
 * understands. Summary reports deliberately fail here: their averages and
 * charts cannot be expanded into individual readings without inventing data.
 */
export function parsePdfLines(
  pages: string[],
  fileName: string,
  override?: DateOrder,
): ParseOutcome {
  const text = pages.join('\n').trim();
  if (!text) {
    return fail(
      'This PDF contains no selectable text, so no readings could be extracted. It may be scanned or image-only; upload the original CSV or JSON export instead.',
    );
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fallbackYear = text.match(/\b(20\d{2})\b/)?.[1] ?? null;

  if (!hasPdfReadingsTable(lines, text)) {
    return fail(pdfSummaryMessage(text));
  }

  const rows: Array<{ time: string; value: number }> = [];
  let currentDate: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/^[•·]\s*/, '');
    const headerDate = pdfDateHeader(line, fallbackYear);
    if (headerDate) {
      currentDate = headerDate;
      continue;
    }

    const full = line.match(
      /^(?:\d{1,4}\s+)?(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})[ ,T]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+([<>]?\d{1,4}(?:[.,]\d+)?)\b/i,
    );
    if (full) {
      currentDate = full[1];
      const value = pdfNumeric(full[3]);
      if (value !== null) rows.push({ time: `${full[1]} ${full[2]}`, value });
      continue;
    }

    const timed = line.match(
      /^(?:\d{1,4}\s+)?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+([<>]?\d{1,4}(?:[.,]\d+)?)\b/i,
    );
    if (timed && currentDate) {
      const value = pdfNumeric(timed[2]);
      if (value !== null) rows.push({ time: `${currentDate} ${timed[1]}`, value });
    }
  }

  if (!rows.length) return fail(pdfSummaryMessage(text));
  if (rows.length < 8) {
    if (PDF_SUMMARY.test(text)) return fail(pdfSummaryMessage(text));
    return fail(
      `Only ${rows.length} glucose readings could be read from the PDF; at least 8 are required. Use the original CSV or JSON export for a complete report.`,
    );
  }

  const unit = pdfUnit(text);
  const header = unit ? `time,glucose (${unit})` : 'time,glucose';
  const csv = `${header}\n${rows.map((row) => `${row.time},${row.value}`).join('\n')}`;
  const source = /libreview|freestyle libre/i.test(text)
    ? 'LibreView PDF'
    : /dexcom|clarity/i.test(text)
      ? 'Dexcom Clarity PDF'
      : /nightscout/i.test(text)
        ? 'Nightscout PDF'
        : 'PDF report';

  const outcome = parseGenericCsv(csv, fileName, override, source);
  if (outcome.ok) {
    outcome.warnings.unshift(
      `Read ${rows.length} glucose readings from the PDF table. Check the report against the original PDF.`,
    );
  }
  return outcome;
}

function looksLikePdf(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - 5, 1023);
  for (let index = 0; index <= limit; index += 1) {
    if (
      bytes[index] === 0x25 &&
      bytes[index + 1] === 0x50 &&
      bytes[index + 2] === 0x44 &&
      bytes[index + 3] === 0x46 &&
      bytes[index + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}

function pdfErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  const message = error instanceof Error ? error.message : '';
  if (name === 'PasswordException' || /password/i.test(message)) {
    return 'This PDF is password-protected. Remove the password, or upload the original CSV or JSON export.';
  }
  if (name === 'InvalidPDFException') {
    return 'This PDF could not be read because the file appears to be damaged. Upload the original CSV or JSON export.';
  }
  return `Could not read the PDF: ${message || 'unknown error'}`;
}

function parseText(text: string, fileName: string, override?: DateOrder): ParseOutcome {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return fail('The file looks empty.');

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseNightscout(trimmed, fileName);
  }

  const head = trimmed.slice(0, 8000);
  if (TEXT.eventType.test(head) && TEXT.glucose.test(head)) {
    return parseDexcom(trimmed, fileName, override);
  }
  if (TEXT.recordType.test(head) && TEXT.glucose.test(head)) {
    return parseLibreView(trimmed, fileName, override);
  }
  if (/device\s*timestamp|ger[äa]tezeitstempel|cihaz\s*zaman/i.test(head)) {
    return parseLibreView(trimmed, fileName, override);
  }
  return parseGenericCsv(trimmed, fileName, override);
}

export interface ParseOptions {
  /** Force a date order instead of the one inferred from the file. */
  dateOrder?: DateOrder;
}

export async function parseFile(file: File, options: ParseOptions = {}): Promise<ParseOutcome> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const pdf = looksLikePdf(bytes);
    if (pdf || file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      if (!pdf) {
        return fail(
          'This file has a .pdf name but is not a valid PDF. Upload the original CSV or JSON export instead.',
        );
      }
      try {
        const { extractPdfText } = await import('./pdf');
        const extracted = await extractPdfText(buffer);
        return parsePdfLines(extracted.pages, file.name, options.dateOrder);
      } catch (error) {
        return fail(pdfErrorMessage(error));
      }
    }

    const { text, encoding } = decodeBuffer(buffer);
    const outcome = parseText(text, file.name, options.dateOrder);
    if (outcome.ok && !encoding.startsWith('UTF-8')) {
      outcome.warnings.unshift(`File read as ${encoding} and converted to UTF-8.`);
    }
    return outcome;
  } catch (error) {
    return fail(`Could not read the file: ${(error as Error).message}`);
  }
}
