import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ArchiveDialog from './components/ArchiveDialog';
import Brand from './components/Brand';
import type { Comparison } from './components/ComparisonPanel';
import Landing from './components/Landing';
import PrintOptionsDialog from './components/PrintOptionsDialog';
import Report from './components/Report';
import {
  deleteArchive,
  listArchives,
  loadArchive,
  saveArchive,
  type ArchiveSummary,
} from './lib/archive';
import { buildDemoDataset } from './lib/demo';
import type { GlucoseUnit } from './lib/glucose';
import { computeMetrics, type TargetProfileId } from './lib/metrics';
import type { ParseOptions } from './lib/parse';
import { parseFileAsync } from './lib/parseAsync';
import {
  availablePeriods,
  defaultPeriod,
  isPeriodAvailable,
  sliceDataset,
  type ReportPeriod,
} from './lib/period';
import { prepareReportForPrint, resetPrintFit, type PrintPreflight } from './lib/printFit';
import { loadPrintOptions, savePrintOptions, type PrintOptions } from './lib/printOptions';
import { buildSummary } from './lib/summary';
import type { Dataset, DateOrder } from './lib/types';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>('14d');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [reordering, setReordering] = useState(false);
  const [patient, setPatient] = useState('');
  const [note, setNote] = useState('');
  const [summaryOverride, setSummaryOverride] = useState<string | null>(null);
  const [printCheck, setPrintCheck] = useState<PrintPreflight | null>(null);
  const [sparseFile, setSparseFile] = useState<File | null>(null);
  const [allowSparse, setAllowSparse] = useState(false);

  const [profile, setProfile] = useState<TargetProfileId>('standard');
  const [unit, setUnit] = useState<GlucoseUnit>('mg/dL');
  const [previous, setPrevious] = useState<{ fileName: string; dataset: Dataset } | null>(null);
  const [printOptions, setPrintOptions] = useState<PrintOptions>(() => loadPrintOptions());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveEntries, setArchiveEntries] = useState<ArchiveSummary[]>([]);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);
  const compareInput = useRef<HTMLInputElement>(null);
  /** Tokens make the latest file win when two parses overlap. */
  const parseToken = useRef(0);
  const compareToken = useRef(0);

  const reportDataset = useMemo(
    () => (dataset ? sliceDataset(dataset, period) : null),
    [dataset, period],
  );
  const periodOptions = useMemo(() => (dataset ? availablePeriods(dataset) : []), [dataset]);
  const metrics = useMemo(
    () => (reportDataset ? computeMetrics(reportDataset, { profile, unit }) : null),
    [reportDataset, profile, unit],
  );
  const comparison = useMemo<Comparison | null>(
    () =>
      previous
        ? {
            fileName: previous.fileName,
            dataset: previous.dataset,
            metrics: computeMetrics(sliceDataset(previous.dataset, period), { profile, unit }),
          }
        : null,
    [previous, profile, unit, period],
  );
  const autoSummary = useMemo(
    () =>
      metrics && reportDataset
        ? buildSummary(metrics, reportDataset, patient, note, unit)
        : '',
    [metrics, reportDataset, patient, note, unit],
  );
  const summary = summaryOverride ?? autoSummary;

  const handleFiles = useCallback(async (files: File[], options: ParseOptions = {}) => {
    const file = files[0];
    if (!file) return;
    const request = parseToken.current + 1;
    parseToken.current = request;
    setBusy(true);
    setReordering(false);
    setError(null);
    setSparseFile(null);
    setAllowSparse(Boolean(options.allowSparse));
    const outcome = await parseFileAsync(file, options);
    // A newer drop or a reset has taken over; do not overwrite its state.
    if (request !== parseToken.current) return;
    if (outcome.ok) {
      setDataset(outcome.dataset);
      setPeriod(defaultPeriod(outcome.dataset));
      setWarnings(outcome.warnings);
      setSourceFile(file);
      setPrevious(null);
      setPrintCheck(null);
      setPatient('');
      setNote('');
      setSummaryOverride(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setError(outcome.error);
      if (!options.allowSparse && /at least 8|fewer than 8/.test(outcome.error)) setSparseFile(file);
    }
    setBusy(false);
  }, []);

  const handleCompareFile = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const request = compareToken.current + 1;
    compareToken.current = request;
    setError(null);
    setSparseFile(null);
    setBusy(true);
    const outcome = await parseFileAsync(file);
    if (request !== compareToken.current) return;
    if (outcome.ok) {
      setPrevious({ fileName: file.name, dataset: outcome.dataset });
    } else {
      setError(`Could not read the comparison file. ${outcome.error}`);
    }
    setBusy(false);
  }, []);

  const handlePrint = useCallback(() => {
    const result = prepareReportForPrint();
    if (!result || (result.fits && !result.scaled)) {
      window.print();
      return;
    }
    setPrintCheck(result);
  }, []);

  const cancelPrint = useCallback(() => {
    setPrintCheck(null);
    resetPrintFit();
  }, []);

  const confirmPrint = useCallback(() => {
    setPrintCheck(null);
    window.print();
  }, []);

  // Printing from the browser menu (Ctrl+P) skips the button, so the same
  // one-page fit runs on every print, and is cleared when printing ends.
  useEffect(() => {
    if (!metrics) return;
    const beforePrint = () => {
      prepareReportForPrint();
    };
    const afterPrint = () => {
      resetPrintFit();
      setPrintCheck(null);
    };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, [metrics]);

  useEffect(() => {
    if (!printCheck) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelPrint();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [printCheck, cancelPrint]);

  const openArchive = useCallback(async () => {
    parseToken.current += 1;
    compareToken.current += 1;
    setBusy(false);
    setArchiveOpen(true);
    setArchiveError(null);
    setArchiveNotice(null);
    try {
      setArchiveEntries(await listArchives());
    } catch (caught) {
      setArchiveError(errorMessage(caught, 'Could not open the local archive in this browser.'));
    }
  }, []);

  const handleArchiveSave = useCallback(
    async (label: string, passphrase: string) => {
      if (!dataset) return;
      setArchiveBusy(true);
      setArchiveError(null);
      setArchiveNotice(null);
      try {
        await saveArchive(label, passphrase, {
          dataset,
          period,
          warnings,
          patient,
          note,
          summaryOverride,
          profile,
          unit,
        });
        setArchiveEntries(await listArchives());
        setArchiveNotice('Report saved to the encrypted archive.');
      } catch (caught) {
        setArchiveError(errorMessage(caught, 'Could not encrypt and save the report.'));
      } finally {
        setArchiveBusy(false);
      }
    },
    [dataset, period, warnings, patient, note, summaryOverride, profile, unit],
  );

  const handleArchiveOpen = useCallback(async (id: string, passphrase: string) => {
    parseToken.current += 1;
    compareToken.current += 1;
    setArchiveBusy(true);
    setArchiveError(null);
    setArchiveNotice(null);
    try {
      const payload = await loadArchive(id, passphrase);
      setDataset(payload.dataset);
      setPeriod(
        payload.period && isPeriodAvailable(payload.dataset, payload.period)
          ? payload.period
          : defaultPeriod(payload.dataset),
      );
      setPatient(payload.patient);
      setNote(payload.note);
      setSummaryOverride(payload.summaryOverride);
      setProfile(payload.profile);
      setUnit(payload.unit);
      setSourceFile(null);
      setPrevious(null);
      setPrintCheck(null);
      setSparseFile(null);
      setAllowSparse(false);
      const archiveNotes = ['Opened from the encrypted local archive.'];
      if (payload.dataset.meta.date.uncertain) {
        // Re-parsing needs the original export, which the archive does not hold.
        archiveNotes.push(
          'The saved date format is fixed in the archive; re-open the original export to switch it.',
        );
      }
      setWarnings(Array.from(new Set([...archiveNotes, ...(payload.warnings ?? [])])));
      setArchiveOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setArchiveError('Wrong passphrase, or the saved record is damaged.');
    } finally {
      setArchiveBusy(false);
    }
  }, []);

  const handleArchiveDelete = useCallback(async (id: string) => {
    if (!window.confirm('Delete this saved report from this browser?')) return;
    setArchiveBusy(true);
    setArchiveError(null);
    setArchiveNotice(null);
    try {
      await deleteArchive(id);
      setArchiveEntries(await listArchives());
      setArchiveNotice('Saved report deleted.');
    } catch (caught) {
      setArchiveError(errorMessage(caught, 'Could not delete the saved report.'));
    } finally {
      setArchiveBusy(false);
    }
  }, []);

  const changeDateOrder = useCallback(
    async (order: DateOrder) => {
      if (!sourceFile) return;
      const request = parseToken.current + 1;
      parseToken.current = request;
      setReordering(true);
      setError(null);
      const outcome = await parseFileAsync(sourceFile, { dateOrder: order, allowSparse });
      if (request !== parseToken.current) return;
      if (outcome.ok) {
        setDataset(outcome.dataset);
        setPeriod((current) =>
          isPeriodAvailable(outcome.dataset, current)
            ? current
            : defaultPeriod(outcome.dataset),
        );
        setWarnings(outcome.warnings);
        setSummaryOverride(null);
      } else {
        setError(outcome.error);
      }
      setReordering(false);
    },
    [sourceFile, allowSparse],
  );

  const changeProfile = useCallback((id: TargetProfileId) => {
    setProfile(id);
    setSummaryOverride(null);
    setPrintCheck(null);
  }, []);

  const changeUnit = useCallback((next: GlucoseUnit) => {
    setUnit(next);
    setSummaryOverride(null);
    setPrintCheck(null);
  }, []);

  const changePeriod = useCallback((next: ReportPeriod) => {
    setPeriod(next);
    setSummaryOverride(null);
    setPrintCheck(null);
  }, []);

  const loadDemo = useCallback(() => {
    parseToken.current += 1;
    compareToken.current += 1;
    const demo = buildDemoDataset();
    setError(null);
    setBusy(false);
    setSourceFile(null);
    setPrevious(null);
    setPrintCheck(null);
    setSparseFile(null);
    setAllowSparse(false);
    setDataset(demo);
    setPeriod(defaultPeriod(demo));
    setWarnings([
      'Sample data: 90 days of synthetic CGM readings. Use the report period selector to try 14 days, 1 month or 3 months. Not real patient data.',
    ]);
    setPatient('');
    setNote('');
    setSummaryOverride(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const reset = useCallback(() => {
    parseToken.current += 1;
    compareToken.current += 1;
    setBusy(false);
    setSourceFile(null);
    setPrevious(null);
    setPrintCheck(null);
    setSparseFile(null);
    setAllowSparse(false);
    setDataset(null);
    setPeriod('14d');
    setWarnings([]);
    setError(null);
    setPatient('');
    setNote('');
    setSummaryOverride(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadShared = async () => {
      try {
        if (!('caches' in window)) return;
        const cache = await caches.open('sokerireport-share');
        const keys = await cache.keys();
        if (!keys.length || cancelled) return;
        const request = keys[keys.length - 1];
        const response = await cache.match(request);
        await cache.delete(request);
        if (!response || cancelled) return;
        const blob = await response.blob();
        const name = decodeURIComponent(new URL(request.url).pathname.split('/').pop() || 'shared.csv');
        const file = new File([blob], name, {
          type: response.headers.get('content-type') || 'text/csv',
        });
        await handleFiles([file]);
      } catch {
        // A failed share falls back to the normal landing page.
      }
    };
    void loadShared();
    return () => {
      cancelled = true;
    };
  }, [handleFiles]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar no-print">
        <Brand />
        <div className="topbar-actions">
          <span className="pill">
            <span className="pill-dot" />
            0 bytes sent
          </span>
          {dataset ? (
            <>
              <button className="btn btn-ghost btn-sm" type="button" onClick={loadDemo}>
                Sample data
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={reset}>
                New file
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void openArchive()}>
                Saved
              </button>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => setSettingsOpen(true)}
              >
                Print setup
              </button>
              <button className="btn btn-primary btn-sm" type="button" onClick={handlePrint}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
                  <path
                    d="M7 9V4h10v5M7 18H5.5A1.5 1.5 0 0 1 4 16.5v-5A1.5 1.5 0 0 1 5.5 10h13a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 18.5 18H17"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                  <rect x="7" y="14" width="10" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
                </svg>
                Save as PDF
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void openArchive()}>
                Saved reports
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={loadDemo}>
                Try with sample data
              </button>
            </>
          )}
        </div>
      </header>

      <input
        ref={compareInput}
        type="file"
        accept=".csv,.tsv,.txt,.json,.pdf,application/pdf"
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void handleCompareFile(files);
        }}
      />

      {printCheck && (
        <div className="print-modal-backdrop no-print">
          <div
            className="print-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="print-modal-title"
            aria-describedby="print-modal-body"
          >
            <h2 id="print-modal-title">
              {printCheck.fits ? 'Summary scaled to fit one page' : 'Report may span two pages'}
            </h2>
            <p id="print-modal-body">
              {printCheck.fits
                ? `Your print sections are long, so the clinical summary was ${
                    printCheck.columns
                      ? `set in two columns${printCheck.scalePercent < 100 ? ` at ${printCheck.scalePercent}%` : ''}`
                      : `scaled to ${printCheck.scalePercent}%`
                  } to keep the report on one A4 page.`
                : 'Even with the densest layout the report is taller than one A4 page. Shorten the clinical summary, turn off optional print sections, or print anyway.'}
            </p>
            <div className="print-modal-actions">
              <button className="btn btn-ghost btn-sm" type="button" onClick={cancelPrint}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" type="button" onClick={confirmPrint} autoFocus>
                {printCheck.fits ? 'Print' : 'Print anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <PrintOptionsDialog
          initial={printOptions}
          onSave={(next) => {
            setPrintOptions(next);
            savePrintOptions(next);
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {archiveOpen && (
        <ArchiveDialog
          entries={archiveEntries}
          defaultLabel={dataset ? `${dataset.meta.fileName}` : 'Report'}
          canSave={Boolean(dataset)}
          busy={archiveBusy}
          notice={archiveNotice}
          error={archiveError}
          onSave={(label, passphrase) => void handleArchiveSave(label, passphrase)}
          onOpen={(id, passphrase) => void handleArchiveOpen(id, passphrase)}
          onDelete={(id) => void handleArchiveDelete(id)}
          onClose={() => setArchiveOpen(false)}
        />
      )}

      {error && (
        <div className="error-bar no-print" role="alert">
          <span className="error-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>Could not analyze the file.</strong> {error}
            {sparseFile && (
              <div className="error-action">
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => {
                    const file = sparseFile;
                    setSparseFile(null);
                    void handleFiles([file], { allowSparse: true });
                  }}
                >
                  Analyze this small sample
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <main id="main">
        {dataset && reportDataset && metrics ? (
          <Report
            dataset={reportDataset}
            period={period}
            onPeriod={changePeriod}
            availablePeriods={periodOptions}
            metrics={metrics}
            warnings={warnings}
            patient={patient}
            note={note}
            summary={summary}
            onPatient={setPatient}
            onNote={setNote}
            onSummaryChange={setSummaryOverride}
            onSummaryReset={() => setSummaryOverride(null)}
            onDateOrder={changeDateOrder}
            dateOrderEnabled={Boolean(sourceFile) && !reordering}
            profile={profile}
            onProfile={changeProfile}
            unit={unit}
            onUnit={changeUnit}
            comparison={comparison}
            onComparePick={() => compareInput.current?.click()}
            onClearComparison={() => setPrevious(null)}
            printOptions={printOptions}
          />
        ) : (
          <Landing onFiles={handleFiles} onDemo={loadDemo} busy={busy} />
        )}
      </main>
    </div>
  );
}
