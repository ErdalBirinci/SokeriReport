const isoDay = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Browsers use document.title as the default PDF filename, so keep it free of
 * patient identifiers and stable across prints.
 */
export function pdfTitle(start: number, end: number, anonymise = false): string {
  if (anonymise) return 'SokeriReport_summary';
  return `SokeriReport_${isoDay(start)}_${isoDay(end)}`;
}
