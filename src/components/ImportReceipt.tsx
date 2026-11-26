import { useMemo, useState } from 'react';
import { dayKey, readingKey } from '../lib/exclusions';
import { clockLabel, dateLong, fmtInt } from '../lib/format';
import { fmtGlucose } from '../lib/glucose';
import type { Dataset, ParseDiagnostics } from '../lib/types';

interface Props {
  dataset: Dataset;
  diagnostics?: ParseDiagnostics | null;
  excluded: ReadonlySet<string>;
  onExcludedChange: (next: Set<string>) => void;
  anonymise?: boolean;
}

const ROW_LIMIT = 1_200;

export default function ImportReceipt({
  dataset,
  diagnostics,
  excluded,
  onExcludedChange,
  anonymise = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const readings = dataset.readings;
  const days = useMemo(() => {
    const groups = new Map<string, typeof readings>();
    for (const reading of readings) {
      const key = dayKey(reading.t);
      const group = groups.get(key);
      if (group) group.push(reading);
      else groups.set(key, [reading]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [readings]);

  const toggleReading = (key: string) => {
    const next = new Set(excluded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onExcludedChange(next);
  };

  const toggleDay = (group: typeof readings) => {
    const keys = group.map(readingKey);
    const allExcluded = keys.every((key) => excluded.has(key));
    const next = new Set(excluded);
    for (const key of keys) {
      if (allExcluded) next.delete(key);
      else next.add(key);
    }
    onExcludedChange(next);
  };

  const files = dataset.meta.files ?? [dataset.meta.fileName];
  const kept = readings.length;
  const excludedCount = readings.reduce(
    (count, reading) => count + (excluded.has(readingKey(reading)) ? 1 : 0),
    0,
  );
  const date = dataset.meta.date;
  const assumptions = [
    `${dataset.meta.source} · ${dataset.meta.unit} source`,
    date.source === 'override'
      ? 'date order set manually'
      : date.order === 'DMY'
        ? 'day-first dates'
        : 'month-first dates',
    dataset.meta.time.absolute ? 'absolute timestamps' : 'wall-clock timestamps',
  ];
  if (!date.uncertain) assumptions.push(`date ${date.source}`);
  else assumptions.push('date order uncertain');
  if (files.length > 1) assumptions.push(`${files.length} merged sources`);
  if (diagnostics?.notes.some((note) => /graph|Max\/Min/i.test(note))) {
    assumptions.push('hourly graph approximation');
  }

  return (
    <details
      className="receipt no-print"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="receipt-title">Import receipt</span>
        <span className="receipt-summary">
          {fmtInt(kept)} readings · {days.length} {days.length === 1 ? 'day' : 'days'} ·{' '}
          {anonymise
            ? 'file name hidden'
            : files.length > 1
              ? `${files.length} files`
              : files[0]}
          {excludedCount > 0 ? ` · ${fmtInt(excludedCount)} excluded` : ''}
        </span>
        <span className="receipt-open">{open ? 'Hide details' : 'Review what was read'}</span>
      </summary>

      <div className="receipt-body">
        <div className="receipt-stats">
          <span>
            <b>{fmtInt(diagnostics?.rows ?? readings.length)}</b>
            <small>candidate rows</small>
          </span>
          <span>
            <b>{fmtInt(kept)}</b>
            <small>readings kept</small>
          </span>
          <span>
            <b>{fmtInt(excludedCount)}</b>
            <small>excluded manually</small>
          </span>
        </div>

        <div className="receipt-chips" aria-label="Import assumptions">
          {assumptions.map((item) => (
            <span className="receipt-chip" key={item}>
              {item}
            </span>
          ))}
        </div>

        {diagnostics && diagnostics.removed.length > 0 && (
          <div className="receipt-removed">
            <h3>Dropped before the report</h3>
            <ul>
              {diagnostics.removed.map((item) => (
                <li key={`${item.label}-${item.count}`}>
                  <b>{fmtInt(item.count)}</b> {item.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="receipt-days">
          <div className="receipt-days-head">
            <h3>Readings by day</h3>
            <div className="receipt-actions">
              {excludedCount > 0 && (
                <button
                  className="btn btn-ghost btn-xs"
                  type="button"
                  onClick={() => onExcludedChange(new Set())}
                >
                  Restore {fmtInt(excludedCount)} readings
                </button>
              )}
            </div>
          </div>
          <ul className="receipt-day-list">
            {days.map(([key, group]) => {
              const allExcluded = group.every((reading) => excluded.has(readingKey(reading)));
              return (
                <li key={key} className={allExcluded ? 'is-excluded' : undefined}>
                  <span className="receipt-day-label">
                    {dateLong(group[0].t)}
                    <small>
                      {fmtInt(group.length)} readings · min{' '}
                      {fmtGlucose(Math.min(...group.map((reading) => reading.v)), 'mg/dL')} · max{' '}
                      {fmtGlucose(Math.max(...group.map((reading) => reading.v)), 'mg/dL')}
                    </small>
                  </span>
                  <button
                    className="btn btn-ghost btn-xs"
                    type="button"
                    onClick={() => toggleDay(group)}
                  >
                    {allExcluded ? 'Include day' : 'Exclude day'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {readings.length <= ROW_LIMIT ? (
          <div className="receipt-rows">
            <h3>
              Individual readings <small>Uncheck a suspicious row to leave it out</small>
            </h3>
            <div className="receipt-table-wrap">
              <table className="receipt-table">
                <thead>
                  <tr>
                    <th scope="col">Include</th>
                    <th scope="col">Date</th>
                    <th scope="col">Time</th>
                    <th scope="col">Glucose</th>
                    <th scope="col">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((reading) => {
                    const key = readingKey(reading);
                    return (
                      <tr key={key} className={excluded.has(key) ? 'is-excluded' : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!excluded.has(key)}
                            onChange={() => toggleReading(key)}
                            aria-label={`Include ${fmtGlucose(reading.v, 'mg/dL')} mg/dL at ${clockLabel(new Date(reading.t).getHours())}`}
                          />
                        </td>
                        <td>{dateLong(reading.t)}</td>
                        <td>{new Date(reading.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{fmtGlucose(reading.v, 'mg/dL')} mg/dL</td>
                        <td>{reading.kind}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="receipt-note">
            Individual rows are hidden for exports over {fmtInt(ROW_LIMIT)} readings. Use the day
            controls above, or re-export a shorter period.
          </p>
        )}

        <p className="receipt-note">
          Exclusions change every calculation in this report. The original file is never modified;
          saved reports keep the exclusions as applied.
        </p>
      </div>
    </details>
  );
}
