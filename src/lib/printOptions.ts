export interface PrintOptions {
  institution: string;
  preparedBy: string;
  signature: boolean;
  grayscale: boolean;
  /** Hide patient, note and file identifiers for sharing. */
  anonymise: boolean;
  showQuality: boolean;
  showComparison: boolean;
  showQuestions: boolean;
  showHypoSafety: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  institution: '',
  preparedBy: '',
  signature: false,
  grayscale: false,
  anonymise: false,
  showQuality: false,
  showComparison: false,
  showQuestions: false,
  showHypoSafety: false,
};

const STORAGE_KEY = 'sokerireport-print-options';

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** Validate stored JSON so an older or hand-edited entry cannot break the app. */
export function parsePrintOptions(raw: string | null): PrintOptions {
  if (!raw) return { ...DEFAULT_PRINT_OPTIONS };
  try {
    const parsed = JSON.parse(raw) as Partial<PrintOptions> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_PRINT_OPTIONS };
    }
    return {
      institution: asString(parsed.institution, ''),
      preparedBy: asString(parsed.preparedBy, ''),
      signature: asBoolean(parsed.signature, false),
      grayscale: asBoolean(parsed.grayscale, false),
      anonymise: asBoolean(parsed.anonymise, false),
      showQuality: asBoolean(parsed.showQuality, false),
      showComparison: asBoolean(parsed.showComparison, false),
      showQuestions: asBoolean(parsed.showQuestions, false),
      showHypoSafety: asBoolean(parsed.showHypoSafety, false),
    };
  } catch {
    return { ...DEFAULT_PRINT_OPTIONS };
  }
}

export function loadPrintOptions(): PrintOptions {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PRINT_OPTIONS };
  try {
    return parsePrintOptions(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_PRINT_OPTIONS };
  }
}

export function savePrintOptions(options: PrintOptions): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Private mode or a full quota: the setup simply is not remembered.
  }
}
