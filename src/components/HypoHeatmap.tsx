import type { Metrics } from '../lib/metrics';
import { fmtGlucose, type GlucoseUnit } from '../lib/glucose';

interface Props {
  matrix: Metrics['hypoMatrix'];
  unit: GlucoseUnit;
  threshold: number;
}

export default function HypoHeatmap({ matrix, unit, threshold }: Props) {
  const max = Math.max(1, ...matrix.flatMap((day) => day.hours));
  const total = matrix.reduce((sum, day) => sum + day.hours.reduce((a, b) => a + b, 0), 0);
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  if (!matrix.length) {
    return <p className="chart-note">No day-level data available for the heatmap.</p>;
  }

  const perHour = hours.map((hour) =>
    matrix.reduce((sum, day) => sum + (day.hours[hour] ?? 0), 0),
  );
  const peakHour = perHour.indexOf(Math.max(...perHour));
  const description =
    `Hypoglycemia heatmap: ${total} low ${total === 1 ? 'reading' : 'readings'} below ${fmtGlucose(threshold, unit)} ${unit} ` +
    `across ${matrix.length} ${matrix.length === 1 ? 'day' : 'days'}` +
    (total > 0 ? `, most often around ${String(peakHour).padStart(2, '0')}:00.` : '.');

  return (
    <div className="hypo-heatmap" role="img" aria-label={description}>
      <div className="heatmap-scroll">
        <div className="heatmap-grid" style={{ gridTemplateColumns: `54px repeat(24, minmax(18px, 1fr))` }}>
          <span className="heatmap-corner" />
          {hours.map((hour) => (
            <span className="heatmap-hour" key={hour}>
              {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
            </span>
          ))}

          {matrix.map((day) => (
            <FragmentRow key={day.key} dayKey={day.key} label={day.label} hours={day.hours} max={max} />
          ))}
        </div>
      </div>
      <div className="heatmap-legend">
        <span>
          Lows below {fmtGlucose(threshold, unit)} {unit} · {total} total · {matrix.length} days
        </span>
        <span className="heatmap-scale" aria-hidden="true">
          <i style={{ background: 'rgba(217,47,78,.08)' }} /> 0
          <i style={{ background: 'rgba(217,47,78,.45)' }} />
          <i style={{ background: 'rgba(217,47,78,.85)' }} /> {max}
        </span>
      </div>
    </div>
  );
}

function FragmentRow({
  dayKey,
  label,
  hours,
  max,
}: {
  dayKey: string;
  label: string;
  hours: number[];
  max: number;
}) {
  return (
    <>
      <span className="heatmap-day" key={`${dayKey}-label`}>
        {label}
      </span>
      {hours.map((count, hour) => {
        const opacity = count === 0 ? 0.06 : 0.2 + (count / max) * 0.72;
        return (
          <span
            className="heatmap-cell"
            key={`${dayKey}-${hour}`}
            title={`${label} ${String(hour).padStart(2, '0')}:00 — ${count} low ${count === 1 ? 'reading' : 'readings'}`}
            style={{ background: `rgba(217,47,78,${opacity.toFixed(2)})` }}
          />
        );
      })}
    </>
  );
}
