import type { Metrics } from '../lib/metrics';
import { fmt1 } from '../lib/format';
import { fmtGlucose, type GlucoseUnit } from '../lib/glucose';

interface Props {
  dawn: Metrics['dawn'];
  unit: GlucoseUnit;
  nightHypoShare: number;
}

export default function DawnPanel({ dawn, unit, nightHypoShare }: Props) {
  const completeDays = dawn.days.filter((d) => d.complete);
  const visible = completeDays.slice(-6);
  const maxRise = Math.max(60, ...completeDays.map((d) => Math.abs(d.rise)));

  return (
    <div>
      <div className="dawn-stats">
        <div className="dawn-stat">
          <span>Night 00–04</span>
          <b>{fmtGlucose(dawn.meanNight, unit)}</b>
          <i>{unit}</i>
        </div>
        <div className="dawn-stat">
          <span>Morning 05–08</span>
          <b>{fmtGlucose(dawn.meanMorning, unit)}</b>
          <i>{unit}</i>
        </div>
        <div className="dawn-stat">
          <span>Avg. rise</span>
          <b>
            {dawn.avgRise >= 0 ? '+' : '−'}
            {fmtGlucose(Math.abs(dawn.avgRise), unit)}
          </b>
          <i>{unit}</i>
        </div>
        <div className="dawn-stat dawn-stat-accent">
          <span>Affected days</span>
          <b>
            {dawn.flagged}/{dawn.eligible}
          </b>
          <i>days</i>
        </div>
      </div>

      <p className="dawn-night">
        Night summary: mean <b>{fmtGlucose(dawn.meanNight, unit)} {unit}</b> ·{' '}
        <b>{fmt1(nightHypoShare)}%</b> of low readings happen overnight.
      </p>

      {visible.length > 0 ? (
        <div className="dawn-list print-hide">
          {visible.map((day) => (
            <div className={`dawn-row${day.flagged ? ' is-flag' : ''}`} key={day.key}>
              <span className="dawn-day">{day.label}</span>
              <span className="dawn-nums">
                {fmtGlucose(day.night, unit)} → {fmtGlucose(day.morning, unit)}
              </span>
              <span className="dawn-track">
                <span
                  className="dawn-bar"
                  style={{ width: `${Math.min(100, (Math.abs(day.rise) / maxRise) * 100)}%` }}
                />
              </span>
              <span className="dawn-rise">
                {day.rise >= 0 ? '+' : '−'}
                {fmtGlucose(Math.abs(day.rise), unit)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="chart-note">Not enough readings to compare night (00–04) with morning (05–08).</p>
      )}
    </div>
  );
}
