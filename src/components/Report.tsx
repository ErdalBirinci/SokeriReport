import { useState } from 'react';
import AgpChart from './AgpChart';
import ComparisonPanel, { type Comparison } from './ComparisonPanel';
import DataQualityPanel from './DataQualityPanel';
import DawnPanel from './DawnPanel';
import DayTraces from './DayTraces';
import DaysTable from './DaysTable';
import HypoHeatmap from './HypoHeatmap';
import HypoHistogram from './HypoHistogram';
import HypoSafetyPanel from './HypoSafetyPanel';
import ImportReceipt from './ImportReceipt';
import InsightList from './InsightList';
import KpiGrid from './KpiGrid';
import QuestionCard from './QuestionCard';
import {
  DAWN_THRESHOLD,
  PROFILE_OPTIONS,
  VERY_HIGH,
  type Metrics,
  type TargetProfileId,
} from '../lib/metrics';
import type { Dataset, DateOrder, ParseDiagnostics } from '../lib/types';
import { clockLabel, dateLong, fmt1, fmtInt } from '../lib/format';
import { UNIT_OPTIONS, fmtGlucose, rangeLabel, type GlucoseUnit } from '../lib/glucose';
import { REPORT_PERIODS, type ReportPeriod } from '../lib/period';
import type { PrintOptions } from '../lib/printOptions';

interface Props {
  dataset: Dataset;
  /** Full imported dataset; the report may be sliced to the selected period. */
  receiptDataset?: Dataset;
  period: ReportPeriod;
  onPeriod: (period: ReportPeriod) => void;
  availablePeriods: ReportPeriod[];
  metrics: Metrics;
  warnings: string[];
  patient: string;
  note: string;
  summary: string;
  onPatient: (value: string) => void;
  onNote: (value: string) => void;
  onSummaryChange: (value: string) => void;
  onSummaryReset: () => void;
  onDateOrder: (order: DateOrder) => void;
  dateOrderEnabled: boolean;
  profile: TargetProfileId;
  onProfile: (profile: TargetProfileId) => void;
  unit: GlucoseUnit;
  onUnit: (unit: GlucoseUnit) => void;
  comparison: Comparison | null;
  onComparePick: () => void;
  onClearComparison: () => void;
  printOptions: PrintOptions;
  diagnostics?: ParseDiagnostics | null;
  excluded: ReadonlySet<string>;
  onExcludedChange: (next: Set<string>) => void;
}

export default function Report({
  dataset,
  receiptDataset = dataset,
  period,
  onPeriod,
  availablePeriods,
  metrics,
  warnings,
  patient,
  note,
  summary,
  onPatient,
  onNote,
  onSummaryChange,
  onSummaryReset,
  onDateOrder,
  dateOrderEnabled,
  profile,
  onProfile,
  unit,
  onUnit,
  comparison,
  onComparePick,
  onClearComparison,
  printOptions,
  diagnostics,
  excluded,
  onExcludedChange,
}: Props) {
  const days = Math.max(1, Math.round(metrics.spanDays));
  const [copied, setCopied] = useState(false);
  const targets = metrics.targets;

  const { date } = dataset.meta;
  const dateSourceLabel =
    date.source === 'override' ? 'manually set' : date.source === 'detected' ? 'detected' : 'assumed';
  const riskyDateOrder = date.uncertain;
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  const offsetMinutes = -new Date(metrics.start).getTimezoneOffset();
  const utcOffset = `UTC${offsetMinutes >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0')}:${String(Math.abs(offsetMinutes) % 60).padStart(2, '0')}`;
  const goalsLabel =
    `TIR >${targets.tirGoal}%, TBR <${targets.lowGoal}%, ` +
    `TAR >${fmtGlucose(targets.high, unit)} <${targets.tarGoal}%` +
    (targets.veryHighGoal !== undefined
      ? `, >${fmtGlucose(VERY_HIGH, unit)} <${targets.veryHighGoal}%`
      : '') +
    ', CV <36%';

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary);
    } catch {
      const helper = document.createElement('textarea');
      helper.value = summary;
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      document.body.removeChild(helper);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <article className={`report${printOptions.grayscale ? ' print-grayscale' : ''}`}>
      <header className="report-head">
        <div className="report-id">
          {printOptions.institution.trim() && (
            <p className="report-clinic">{printOptions.institution.trim()}</p>
          )}
          <p className="report-kicker">SokeriReport · Glycemic control summary</p>
          <h1 className="report-title">Endocrinology Consultation Report</h1>
          <p className="report-sub">
            <span className="report-source">{dataset.meta.source}</span>
            <span className="dot">·</span>
            {dateLong(metrics.start)} – {dateLong(metrics.end)}
            <span className="dot">·</span>
            {days} {days === 1 ? 'day' : 'days'} of data
            <span className="dot">·</span>
            {fmtInt(metrics.count)} readings
            <span className="dot">·</span>
            {metrics.intervalMin} min interval
          </p>
        </div>

        <div className="report-fields">
          <label className="meta-field">
            <span>Patient</span>
            {printOptions.anonymise ? (
              <span className="meta-redacted">Hidden for sharing</span>
            ) : (
              <input
                className="meta-input"
                value={patient}
                onChange={(event) => onPatient(event.target.value)}
                placeholder="Full name"
                aria-label="Patient name"
              />
            )}
          </label>
          <label className="meta-field">
            <span>Clinical note</span>
            {printOptions.anonymise ? (
              <span className="meta-redacted">Hidden for sharing</span>
            ) : (
              <input
                className="meta-input"
                value={note}
                onChange={(event) => onNote(event.target.value)}
                placeholder="Optional"
                aria-label="Clinical note"
              />
            )}
          </label>
        </div>
      </header>

      {warnings.length > 0 && (
        <div className="warnbar">
          {warnings.map((warning) => (
            <span className="warn-chip" key={warning}>
              {warning}
            </span>
          ))}
        </div>
      )}

      <ImportReceipt
        dataset={receiptDataset}
        diagnostics={diagnostics}
        excluded={excluded}
        onExcludedChange={onExcludedChange}
        anonymise={printOptions.anonymise}
      />

      <div className="formatbar">
        {dataset.meta.time.absolute ? (
          <span className="format-chip">
            <span className="format-key">Time</span>
            <b>absolute timestamp</b>
            <span className="format-src">
              converted to local time{dataset.meta.time.utc ? ' · source UTC' : ''}
            </span>
          </span>
        ) : (
          <span className={`format-chip${riskyDateOrder ? ' is-warn' : ''}`}>
            <span className="format-key">Date format</span>
            <b>{date.order === 'DMY' ? 'DD.MM.YYYY' : 'MM.DD.YYYY'}</b>
            <span className="format-src">
              {dateSourceLabel}
              {date.sample ? ` · ${date.sample}` : ''}
            </span>
          </span>
        )}

        {!dataset.meta.time.absolute && dateOrderEnabled && (
          <button
            className="btn btn-ghost btn-xs no-print"
            type="button"
            onClick={() => onDateOrder(date.order === 'DMY' ? 'MDY' : 'DMY')}
          >
            {date.order === 'DMY' ? 'Read as MM/DD' : 'Read as DD/MM'}
          </button>
        )}

        <span className="format-chip">
          <span className="format-key">Time</span>
          <b>{tzName}</b>
          <span className="format-src">{utcOffset}</span>
        </span>

        <label className="format-select">
          <span className="format-key">Targets</span>
          <select
            value={profile}
            onChange={(event) => onProfile(event.target.value as TargetProfileId)}
            aria-label="Glucose target profile"
          >
            {PROFILE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="format-src">{rangeLabel(targets.low, targets.high, unit)}</span>
        </label>

        <label className="format-select">
          <span className="format-key">Units</span>
          <select
            value={unit}
            onChange={(event) => onUnit(event.target.value as GlucoseUnit)}
            aria-label="Glucose display unit"
          >
            {UNIT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <span className="format-src">{unit === 'mmol/L' ? '÷ 18.0182' : 'source-normalised'}</span>
        </label>

        <label className="format-select">
          <span className="format-key">Report period</span>
          <select
            value={period}
            onChange={(event) => onPeriod(event.target.value as ReportPeriod)}
            aria-label="Report period"
          >
            {REPORT_PERIODS.map((option) => (
              <option
                key={option.id}
                value={option.id}
                disabled={!availablePeriods.includes(option.id)}
                title={
                  availablePeriods.includes(option.id)
                    ? `${option.days} days ending at the latest reading`
                    : `Needs at least ${option.days} days of CGM data`
                }
              >
                {option.label}
              </option>
            ))}
          </select>
          <span className="format-src">
            {days} {days === 1 ? 'day' : 'days'}
          </span>
        </label>

        {comparison ? (
          <button className="btn btn-ghost btn-xs no-print" type="button" onClick={onClearComparison}>
            Clear comparison
          </button>
        ) : (
          <button className="btn btn-ghost btn-xs no-print" type="button" onClick={onComparePick}>
            Compare previous
          </button>
        )}
      </div>

      <KpiGrid metrics={metrics} unit={unit} />

      <section
        className={`section quality-section print-optional${printOptions.showQuality ? '' : ' print-hide'}`}
      >
        <div className="section-head">
          <h2>Data quality</h2>
          <p>Sensor coverage, gaps and per-day completeness</p>
        </div>
        <div className="card">
          <DataQualityPanel metrics={metrics} />
        </div>
      </section>

      {comparison && (
        <section
          className={`section comparison-section print-optional${printOptions.showComparison ? '' : ' print-hide'}`}
        >
          <div className="section-head">
            <h2>Since the previous report</h2>
            <p>Direction of change, not a substitute for the clinical picture</p>
          </div>
          <div className="card">
            <ComparisonPanel
              comparison={comparison}
              current={metrics}
              unit={unit}
              anonymise={printOptions.anonymise}
            />
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>24-hour glucose profile (AGP)</h2>
          <p>Hourly median with 5th–95th and 25th–75th percentile bands</p>
        </div>
        <div className="card">
          <AgpChart hourly={metrics.hourly} unit={unit} targets={targets} />
        </div>
      </section>

      <div className="grid-2">
        <section className="section">
          <div className="section-head">
            <h2>Hypoglycemia by hour</h2>
            <p>Readings below {fmtGlucose(targets.low, unit)} {unit}</p>
          </div>
          <div className="card">
            <HypoHistogram
              counts={metrics.hypoByHour}
              windowStart={metrics.hypoWindow.start}
              threshold={targets.low}
              unit={unit}
            />
            {metrics.hypoWindow.meaningful && (
              <div className="callout">
                Lows cluster at{' '}
                <b>
                  {clockLabel(metrics.hypoWindow.start)}–{clockLabel(metrics.hypoWindow.end)}
                </b>{' '}
                · {fmt1(metrics.hypoWindow.share)}% of {metrics.hypoReadings} lows · night share{' '}
                {fmt1(metrics.nightHypoShare)}%
              </div>
            )}
            <div className={printOptions.showHypoSafety ? undefined : 'print-hide'}>
              <HypoSafetyPanel metrics={metrics} unit={unit} />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Dawn phenomenon</h2>
            <p>
              Morning rise · +{fmtGlucose(DAWN_THRESHOLD, unit)} {unit} threshold
            </p>
          </div>
          <div className="card">
            <DawnPanel dawn={metrics.dawn} unit={unit} nightHypoShare={metrics.nightHypoShare} />
          </div>
        </section>
      </div>

      <section className="section print-hide">
        <div className="section-head">
          <h2>Lows by day and hour</h2>
          <p>Where hypoglycemia clusters across the reporting period</p>
        </div>
        <div className="card">
          <HypoHeatmap matrix={metrics.hypoMatrix} threshold={targets.low} unit={unit} />
        </div>
      </section>

      {metrics.questions.length > 0 && (
        <section
          className={`section question-section print-optional${printOptions.showQuestions ? '' : ' print-hide'}`}
        >
          <div className="section-head">
            <h2>Questions for your clinician</h2>
            <p>Discussion prompts derived from this report</p>
          </div>
          <QuestionCard questions={metrics.questions} />
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Clinical summary</h2>
          <p className="no-print">Edit it, copy it to the clipboard</p>
        </div>

        <div className="print-hide">
          <InsightList insights={metrics.insights} />
        </div>

        <div className="card summary-card">
          <div className="summary-head no-print">
            <span className="summary-label">Summary for the clipboard</span>
            <span className="summary-meta">{summary.length} characters</span>
          </div>
          <textarea
            className="summary-edit no-print"
            value={summary}
            onChange={(event) => onSummaryChange(event.target.value)}
            spellCheck={false}
            aria-label="Clinical summary text"
          />
          <pre className="summary-print">{summary}</pre>
          <div className="summary-actions no-print">
            <button className="btn btn-primary btn-sm" type="button" onClick={copySummary}>
              {copied ? 'Copied ✓' : 'Copy summary'}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={onSummaryReset}>
              Reset to automatic summary
            </button>
            <span className="summary-meta">
              {printOptions.anonymise
                ? 'Sharing mode: identifiers and the clinical note are left out of the printed summary'
                : 'Includes patient name and clinical note'}
            </span>
          </div>
        </div>
      </section>

      <section className="section print-hide">
        <div className="section-head">
          <h2>Daily glucose traces</h2>
          <p>Day-by-day course</p>
        </div>
        <div className="card">
          <DayTraces readings={dataset.readings} hourly={metrics.hourly} unit={unit} targets={targets} />
        </div>
      </section>

      <section className="section print-hide">
        <div className="section-head">
          <h2>Daily table</h2>
          <p>
            {metrics.days.length} {metrics.days.length === 1 ? 'calendar day' : 'calendar days'}
          </p>
        </div>
        <div className="card table-card">
          <DaysTable days={metrics.days} unit={unit} targets={targets} />
        </div>
      </section>

      {printOptions.signature && (
        <div className="signature-block">
          <div className="signature-line">
            <span>Signature</span>
            <i>{printOptions.preparedBy.trim()}</i>
          </div>
          <div className="signature-line">
            <span>Date</span>
            <i>{new Date().toLocaleDateString('en-GB')}</i>
          </div>
        </div>
      )}

      <footer className="report-foot">
        <span>
          {new Date().toLocaleDateString('en-GB')} · SokeriReport ·{' '}
          {printOptions.anonymise ? 'file name hidden' : dataset.meta.fileName}
          {printOptions.preparedBy.trim() ? ` · Prepared by ${printOptions.preparedBy.trim()}` : ''}
        </span>
        <span>
          Data processed in the browser; no reading was sent to a server. Targets: {targets.label} ·{' '}
          {goalsLabel} (International Consensus).
        </span>
      </footer>
    </article>
  );
}
