import type { Metrics } from '../lib/metrics';
import type { Dataset } from '../lib/types';
import { dateLong, fmt1, fmtInt } from '../lib/format';
import { fmtGlucose, fmtGlucoseDelta, type GlucoseUnit } from '../lib/glucose';

export interface Comparison {
  fileName: string;
  dataset: Dataset;
  metrics: Metrics;
}

interface Props {
  comparison: Comparison;
  current: Metrics;
  unit: GlucoseUnit;
}

type Tone = 'good' | 'bad' | 'flat';

function deltaTone(delta: number, goodDirection: 'up' | 'down', flat = 0.5): Tone {
  if (Math.abs(delta) < flat) return 'flat';
  const good = goodDirection === 'up' ? delta > 0 : delta < 0;
  return good ? 'good' : 'bad';
}

export default function ComparisonPanel({ comparison, current, unit }: Props) {
  const previous = comparison.metrics;
  const currentDays = Math.max(1, Math.round(current.spanDays));
  const previousDays = Math.max(1, Math.round(previous.spanDays));
  const windowsDiffer = currentDays !== previousDays;
  const deltaTir = current.target - previous.target;
  const deltaCv = current.cv - previous.cv;
  const deltaLow = current.low + current.veryLow - (previous.low + previous.veryLow);
  const deltaMean = current.mean - previous.mean;
  const deltaGri = current.gri - previous.gri;

  const rows = [
    { label: 'TIR', value: `${deltaTir >= 0 ? '+' : '−'}${fmt1(Math.abs(deltaTir))} pp`, tone: deltaTone(deltaTir, 'up') },
    { label: 'CV', value: `${deltaCv >= 0 ? '+' : '−'}${fmt1(Math.abs(deltaCv))} pp`, tone: deltaTone(deltaCv, 'down') },
    { label: 'Time < target', value: `${deltaLow >= 0 ? '+' : '−'}${fmt1(Math.abs(deltaLow))} pp`, tone: deltaTone(deltaLow, 'down') },
    { label: 'Mean', value: `${fmtGlucoseDelta(deltaMean, unit)} ${unit}`, tone: deltaTone(deltaMean, 'down', unit === 'mmol/L' ? 0.2 : 2) },
    { label: 'GRI', value: `${deltaGri >= 0 ? '+' : '−'}${fmtInt(Math.abs(deltaGri))}`, tone: deltaTone(deltaGri, 'down', 1) },
  ];

  return (
    <div className="comparison-card">
      <div className="comparison-head">
        <span className="comparison-title">Compared with previous export</span>
        <span className="comparison-meta">
          {comparison.fileName} · {dateLong(previous.start)} – {dateLong(previous.end)}
        </span>
      </div>
      {windowsDiffer && (
        <p className="comparison-warning" role="status">
          <b>Different window lengths.</b> This report covers {currentDays} days; the previous
          file covers {previousDays} days. Deltas are direction-only — choose a period supported by
          both files for a like-for-like comparison.
        </p>
      )}
      <div className="comparison-grid">
        {rows.map((row) => (
          <div className={`comparison-cell comparison-${row.tone}`} key={row.label}>
            <span>{row.label}</span>
            <b>{row.value}</b>
          </div>
        ))}
      </div>
      <p className="comparison-note">
        Current period {dateLong(current.start)} – {dateLong(current.end)} · differences are
        current minus previous.
      </p>
    </div>
  );
}
