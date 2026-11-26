import type { PrintOptions } from '../lib/printOptions';
import type { SummaryImport } from '../lib/types';
import { fmt1, fmtInt } from '../lib/format';

interface Props {
  summary: SummaryImport;
  patient: string;
  onPatient: (value: string) => void;
  printOptions: PrintOptions;
}

const pct = (value: number | undefined): string => (value === undefined ? '—' : `${fmt1(value)}%`);

export default function SummaryReport({ summary, patient, onPatient, printOptions }: Props) {
  const days = summary.days;
  const readings = summary.readings;
  const kpiLabels = new Set([
    'Time in range',
    'Time below range',
    'Time above range',
    'Average glucose',
    'CV',
    'GMI',
  ]);
  const extraValues = summary.values.filter(
    (item) => !kpiLabels.has(item.label) && !/^sensor active/i.test(item.label),
  );
  const tir = summary.tir ?? 0;
  const tbr = summary.tbr;
  const tar = summary.tar;
  const hasSplit = tbr !== undefined && tar !== undefined;
  const total = Math.max(1, (tbr ?? 0) + tir + (tar ?? 0));
  const sizes = [(tbr ?? 0) / total, tir / total, (tar ?? 0) / total];

  return (
    <article className={`report summary-report${printOptions.grayscale ? ' print-grayscale' : ''}`}>
      <header className="report-head">
        <div className="report-id">
          {printOptions.institution.trim() && (
            <p className="report-clinic">{printOptions.institution.trim()}</p>
          )}
          <p className="report-kicker">SokeriReport · Summary PDF</p>
          <h1 className="report-title">Glycemic Summary</h1>
          <p className="report-sub">
            <span className="report-source">{summary.source}</span>
            <span className="dot">·</span>
            {printOptions.anonymise ? 'file name hidden' : summary.fileName}
            {summary.periodText && (
              <>
                <span className="dot">·</span>
                {summary.periodText}
              </>
            )}
            {days !== undefined && (
              <>
                <span className="dot">·</span>
                {days} {days === 1 ? 'day' : 'days'}
              </>
            )}
            {readings !== undefined && (
              <>
                <span className="dot">·</span>
                {fmtInt(readings)} readings
              </>
            )}
          </p>
        </div>

        <div className="report-fields">
          <div className="meta-field">
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
          </div>
        </div>
      </header>

      <div className="summary-pdf-note">
        <b>Summary-only import.</b> These values are printed in the PDF; no individual readings
        were available. The AGP curve, hypoglycemia episodes, dawn phenomenon and sensor gaps cannot
        be calculated from this file. For the full report, open the raw CSV or JSON export instead.
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Control at a glance</h2>
          <p>Values as printed in the source report</p>
        </div>
        <div className="summary-kpis">
          <div className="summary-kpi summary-kpi-primary">
            <span>Time in range</span>
            <b>{pct(summary.tir)}</b>
          </div>
          <div className="summary-kpi">
            <span>Below range</span>
            <b>{pct(summary.tbr)}</b>
          </div>
          <div className="summary-kpi">
            <span>Above range</span>
            <b>{pct(summary.tar)}</b>
          </div>
          <div className="summary-kpi">
            <span>Average glucose</span>
            <b>
              {summary.mean === undefined
                ? '—'
                : `${summary.mean.toLocaleString('en-GB')} ${summary.unit}`}
            </b>
          </div>
          <div className="summary-kpi">
            <span>CV</span>
            <b>{pct(summary.cv)}</b>
          </div>
          <div className="summary-kpi">
            <span>GMI</span>
            <b>{pct(summary.gmi)}</b>
          </div>
        </div>

        {hasSplit ? (
          <>
            <div
              className="summary-bar"
              role="img"
              aria-label={`Printed range distribution: ${pct(tbr)} below, ${pct(tir)} in range, ${pct(tar)} above`}
            >
              <span className="summary-bar-low" style={{ width: `${sizes[0] * 100}%` }} />
              <span className="summary-bar-target" style={{ width: `${sizes[1] * 100}%` }} />
              <span className="summary-bar-high" style={{ width: `${sizes[2] * 100}%` }} />
            </div>
            <div className="summary-legend">
              <span>Below {pct(tbr)}</span>
              <span>In range {pct(tir)}</span>
              <span>Above {pct(tar)}</span>
            </div>
          </>
        ) : (
          <p className="summary-pdf-note">
            The below/above split was not printed on this page; only the time-in-range value is
            shown.
          </p>
        )}
      </section>

      {(extraValues.length > 0 || summary.coverage !== undefined) && (
        <section className="section">
          <div className="section-head">
            <h2>Other printed values</h2>
            <p>Read from the PDF, not recalculated</p>
          </div>
          <div className="card">
            <table className="summary-values">
              <tbody>
                {extraValues.map((item) => (
                  <tr key={item.label}>
                    <th scope="row">{item.label}</th>
                    <td>{item.value}</td>
                  </tr>
                ))}
                {summary.coverage !== undefined && (
                  <tr>
                    <th scope="row">Sensor active</th>
                    <td>{pct(summary.coverage)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>What this file supports</h2>
          <p>Read this before using the summary in a consultation</p>
        </div>
        <div className="summary-pdf-columns">
          <div>
            <h3>Reliable here</h3>
            <ul>
              <li>The printed TIR and range values where present</li>
              <li>Average glucose, CV and GMI as reported</li>
              <li>Sensor-active share, when printed</li>
            </ul>
          </div>
          <div>
            <h3>Not available</h3>
            <ul>
              <li>Hourly AGP percentiles and day traces</li>
              <li>Hypoglycemia episodes, duration and level 2 count</li>
              <li>Dawn phenomenon, gaps and sensor sessions</li>
            </ul>
          </div>
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
          {printOptions.anonymise ? 'file name hidden' : summary.fileName}
          {printOptions.preparedBy.trim() ? ` · Prepared by ${printOptions.preparedBy.trim()}` : ''}
        </span>
        <span>
          Data processed in the browser; summary values were read locally from the PDF. This is not
          a diagnosis or a treatment recommendation.
        </span>
      </footer>
    </article>
  );
}
