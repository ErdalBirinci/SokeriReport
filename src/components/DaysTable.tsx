import type { DayStat, TargetProfile } from '../lib/metrics';
import { fmt1, fmtInt } from '../lib/format';
import { fmtGlucose, type GlucoseUnit } from '../lib/glucose';

interface Props {
  days: DayStat[];
  unit: GlucoseUnit;
  targets: TargetProfile;
}

export default function DaysTable({ days, unit, targets }: Props) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Readings</th>
            <th>Mean</th>
            <th>TIR</th>
            <th>&lt;{fmtGlucose(targets.low, unit)}</th>
            <th>&gt;{fmtGlucose(targets.high, unit)}</th>
            <th>CV</th>
            <th>Min–max</th>
          </tr>
        </thead>
        <tbody>
          {days
            .slice()
            .reverse()
            .map((day) => (
              <tr key={day.key}>
                <td>{day.label}</td>
                <td>{fmtInt(day.count)}</td>
                <td>{fmtGlucose(day.mean, unit)}</td>
                <td>{fmt1(day.tir)}%</td>
                <td>{fmt1(day.low)}%</td>
                <td>{fmt1(day.high)}%</td>
                <td>{fmt1(day.cv)}%</td>
                <td>
                  {fmtGlucose(day.min, unit)}–{fmtGlucose(day.max, unit)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
