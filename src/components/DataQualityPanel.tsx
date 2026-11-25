import type { Metrics } from '../lib/metrics';
import { fmtInt } from '../lib/format';

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours.toLocaleString('en-GB', { maximumFractionDigits: 1 })} h`;
}

function tone(coverage: number): string {
  if (coverage >= 70) return 'quality-good';
  if (coverage >= 50) return 'quality-warn';
  return 'quality-bad';
}

export default function DataQualityPanel({ metrics }: { metrics: Metrics }) {
  const q = metrics.quality;
  const days = q.days;

  return (
    <div className="quality-card">
      <div className="quality-chips">
        <span className="quality-chip">
          <span>CGM active</span>
          <b>{fmtInt(metrics.coverage)}%</b>
        </span>
        <span className="quality-chip">
          <span>Gaps</span>
          <b>{fmtInt(q.gapCount)}</b>
        </span>
        <span className="quality-chip">
          <span>Longest gap</span>
          <b>{q.gapCount > 0 ? fmtDuration(q.longestGapMin) : '—'}</b>
        </span>
        <span className="quality-chip">
          <span>Missing</span>
          <b>{q.missingMinutes > 0 ? fmtDuration(q.missingMinutes) : '—'}</b>
        </span>
        <span className="quality-chip">
          <span>Interval</span>
          <b>{metrics.intervalMin} min</b>
        </span>
        <span className="quality-chip">
          <span>Sessions (est.)</span>
          <b>{q.sessions}</b>
        </span>
      </div>

      <div
        className="quality-strip"
        role="img"
        aria-label={`Sensor coverage for ${days.length} days`}
      >
        {days.map((day) => (
          <span className={`quality-day ${tone(day.coverage)}`} key={day.key} title={`${day.label}: ${Math.round(day.coverage)}%`}>
            <span className="quality-fill" style={{ height: `${Math.max(5, day.coverage)}%` }} />
          </span>
        ))}
      </div>

      <p className="quality-note">
        Each column is one day; height is the share of expected readings received. Sessions are
        estimated from gaps longer than 2 hours, because CGM exports do not include wear events. The
        international consensus sets 14 days and &gt;70% sensor coverage as the minimum; longer
        report periods add trend context.
      </p>
    </div>
  );
}
