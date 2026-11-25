const locale = 'en-GB';

export const fmtInt = (n: number): string =>
  Number.isFinite(n) ? n.toLocaleString(locale, { maximumFractionDigits: 0 }) : '—';

export const fmt1 = (n: number): string =>
  Number.isFinite(n)
    ? n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : '—';

const pad2 = (n: number): string => String(n).padStart(2, '0');

export const dateLong = (t: number): string =>
  new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric' }).format(
    new Date(t),
  );

export const clockLabel = (hour: number): string => `${pad2(((hour % 24) + 24) % 24)}:00`;
