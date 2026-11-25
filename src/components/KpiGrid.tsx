import type { Metrics } from '../lib/metrics';
import { VERY_HIGH, VERY_LOW } from '../lib/metrics';
import { fmt1, fmtInt } from '../lib/format';
import { fmtGlucose, rangeLabel, type GlucoseUnit } from '../lib/glucose';

export default function KpiGrid({ metrics, unit }: { metrics: Metrics; unit: GlucoseUnit }) {
  const t = metrics.targets;
  const lowTotal = metrics.low + metrics.veryLow;
  const highTotal = metrics.high + metrics.veryHigh;
  const cvTone = metrics.cv > 36 ? 'tone-amber' : 'tone-teal';
  const hypoNote =
    metrics.hypoEvents.length === 0
      ? 'No hypoglycemia events'
      : `${metrics.hypoEvents.length} ${metrics.hypoEvents.length === 1 ? 'event' : 'events'} · longest ${metrics.longestHypoMinutes} min · level 2: ${metrics.severeHypoCount}`;
  const griTone =
    metrics.gri < 20
      ? 'gri-low'
      : metrics.gri < 40
        ? 'gri-moderate'
        : metrics.gri < 60
          ? 'gri-high'
          : 'gri-very-high';

  const ranges = [
    { key: 'veryLow', label: `<${fmtGlucose(VERY_LOW, unit)}`, color: '#8b5cf6' },
    { key: 'low', label: `${fmtGlucose(VERY_LOW, unit)}–${fmtGlucose(t.low, unit)}`, color: '#f43f5e' },
    { key: 'target', label: `${fmtGlucose(t.low, unit)}–${fmtGlucose(t.high, unit)}`, color: '#0ea47a' },
    { key: 'high', label: `${fmtGlucose(t.high, unit)}–${fmtGlucose(VERY_HIGH, unit)}`, color: '#f59e0b' },
    { key: 'veryHigh', label: `>${fmtGlucose(VERY_HIGH, unit)}`, color: '#dc2626' },
  ] as const;

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi kpi-wide tone-teal">
          <div className="kpi-label">Time in range (TIR)</div>
          <div className="kpi-value">
            {fmt1(metrics.target)}
            <span className="kpi-unit">%</span>
          </div>

          <div className="tir-bar" role="img" aria-label="Glucose range distribution">
            {ranges.map((range) => {
              const value = metrics[range.key];
              if (value <= 0) return null;
              return (
                <span
                  key={range.key}
                  className="tir-seg"
                  style={{
                    width: `${value}%`,
                    background: `linear-gradient(180deg, ${range.color}, ${range.color}cc)`,
                  }}
                />
              );
            })}
          </div>

          <div className="legend">
            {ranges.map((range) => (
              <span className="legend-item" key={range.key}>
                <i className="swatch" style={{ background: range.color }} />
                {range.label} <b>{fmt1(metrics[range.key])}%</b>
              </span>
            ))}
          </div>

          <div className="kpi-foot kpi-clinical">
            <span className={`gri-pill ${griTone}`}>
              GRI <b>{fmtInt(metrics.gri)}</b> {metrics.griZone.toLowerCase()}
            </span>
            <span>
              TITR <b>{fmt1(metrics.titrr)}%</b> ({rangeLabel(t.tightLow, t.tightHigh, unit)})
            </span>
            <span>
              CGM active <b>{fmtInt(metrics.coverage)}%</b>
            </span>
          </div>
        </div>

        <div className="kpi tone-blue">
          <div className="kpi-label">Average glucose</div>
          <div className="kpi-value">
            {fmtGlucose(metrics.mean, unit)}
            <span className="kpi-unit">{unit}</span>
          </div>
          <div className="kpi-foot">
            SD {fmtGlucose(metrics.sd, unit)} · range {fmtGlucose(metrics.min, unit)}–
            {fmtGlucose(metrics.max, unit)}
          </div>
        </div>

        <div className={`kpi ${cvTone}`}>
          <div className="kpi-label">Variability (CV)</div>
          <div className="kpi-value">
            {fmt1(metrics.cv)}
            <span className="kpi-unit">%</span>
          </div>
          <div className="kpi-foot">
            Target &lt; 36% · GMI {fmt1(metrics.gmi)}% · GRI {fmtInt(metrics.gri)}
          </div>
        </div>

        <div className="kpi tone-violet">
          <div className="kpi-label">Low (&lt;{fmtGlucose(t.low, unit)})</div>
          <div className="kpi-value">
            {fmt1(lowTotal)}
            <span className="kpi-unit">%</span>
          </div>
          <div className="kpi-foot">
            {fmt1(metrics.veryLow)}% &lt;{fmtGlucose(VERY_LOW, unit)} · {hypoNote}
          </div>
        </div>

        <div className="kpi tone-amber">
          <div className="kpi-label">High (&gt;{fmtGlucose(t.high, unit)})</div>
          <div className="kpi-value">
            {fmt1(highTotal)}
            <span className="kpi-unit">%</span>
          </div>
          <div className="kpi-foot">
            {fmt1(metrics.veryHigh)}% &gt;{fmtGlucose(VERY_HIGH, unit)} · target &lt; 25%
          </div>
        </div>

        <div className="kpi tone-teal">
          <div className="kpi-label">GMI (estimated A1c)</div>
          <div className="kpi-value">
            {fmt1(metrics.gmi)}
            <span className="kpi-unit">%</span>
          </div>
          <div className="kpi-foot">ADAG eA1c {fmt1(metrics.ea1c)}% · derived from the mean</div>
        </div>

        <div className="kpi tone-slate">
          <div className="kpi-label">Sensor coverage</div>
          <div className="kpi-value">
            {fmtInt(metrics.coverage)}
            <span className="kpi-unit">%</span>
          </div>
          <div className="kpi-foot">
            {fmtInt(metrics.count)} readings · {metrics.intervalMin} min interval
          </div>
        </div>
      </div>

      {(metrics.insulinDaily !== null || metrics.carbsDaily !== null) && (
        <div className="therapy">
          {metrics.insulinDaily !== null && (
            <span className="therapy-chip">
              Mean insulin <b>{fmt1(metrics.insulinDaily)} U/day</b>
              {metrics.bolusDaily !== null && ` · bolus ${fmt1(metrics.bolusDaily)} U`}
              {metrics.basalDaily !== null && ` · basal ${fmt1(metrics.basalDaily)} U`}
            </span>
          )}
          {metrics.carbsDaily !== null && (
            <span className="therapy-chip">
              Mean carbohydrates <b>{fmtInt(metrics.carbsDaily)} g/day</b>
            </span>
          )}
        </div>
      )}
    </>
  );
}
