import type { Metrics } from '../lib/metrics';
import { fmt1, fmtInt } from '../lib/format';
import { fmtGlucose, type GlucoseUnit } from '../lib/glucose';

interface Props {
  metrics: Metrics;
  unit: GlucoseUnit;
}

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

const eventTime = (t: number): string =>
  new Date(t).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Safety-focused view of the lows: level 2 episodes, duration and time of day.
 * The clinical summary keeps the same numbers in one sentence.
 */
export default function HypoSafetyPanel({ metrics, unit }: Props) {
  const events = metrics.hypoEvents;
  const longest = [...events].sort((a, b) => b.minutes - a.minutes).slice(0, 3);

  if (!events.length) {
    return (
      <div className="hypo-safety">
        <p className="hypo-safety-lead">
          No reading fell below the {fmtGlucose(metrics.targets.low, unit)} {unit} target in this
          period.
        </p>
        <p className="hypo-safety-note">
          This reflects recorded sensor data only; it is not a substitute for a hypoglycemia action
          plan.
        </p>
      </div>
    );
  }

  return (
    <div className="hypo-safety">
      <div className="hypo-safety-stats">
        <span>
          <b>{fmtInt(events.length)}</b>
          <small>separate episodes</small>
        </span>
        <span>
          <b>{fmtInt(metrics.level2HypoCount)}</b>
          <small>level 2 (nadir &lt; {fmtGlucose(54, unit)} {unit})</small>
        </span>
        <span>
          <b>{formatDuration(metrics.longestHypoMinutes)}</b>
          <small>longest episode</small>
        </span>
        <span>
          <b>{fmt1(metrics.nightHypoShare)}%</b>
          <small>of lows overnight (00–06)</small>
        </span>
      </div>

      {metrics.level2HypoCount > 0 && (
        <p className="hypo-safety-warning">
          <b>Level 2 hypoglycemia recorded.</b> Review the episodes below with the clinical team and
          confirm the current rescue plan.
        </p>
      )}

      <div className="hypo-safety-table-wrap">
        <table className="hypo-safety-table">
          <caption>Longest low episodes</caption>
          <thead>
            <tr>
              <th scope="col">Started</th>
              <th scope="col">Duration</th>
              <th scope="col">Nadir</th>
              <th scope="col">Level</th>
            </tr>
          </thead>
          <tbody>
            {longest.map((event) => (
              <tr key={`${event.start}-${event.nadir}`}>
                <td>{eventTime(event.start)}</td>
                <td>{formatDuration(event.minutes)}</td>
                <td>
                  {fmtGlucose(event.nadir, unit)} {unit}
                </td>
                <td>{event.level2 ? 'Level 2' : 'Level 1'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hypo-safety-note">
        Episodes are inferred from consecutive readings below target and can be shortened by sensor
        gaps. Use this summary to structure the conversation, not as an emergency instruction.
      </p>
    </div>
  );
}
