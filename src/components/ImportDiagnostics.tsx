import type { ParseDiagnostics } from '../lib/types';

interface Props {
  diagnostics: ParseDiagnostics;
}

export default function ImportDiagnostics({ diagnostics }: Props) {
  const stats: Array<[string, number]> = [
    ['Rows read', diagnostics.rows],
    ['Dates read', diagnostics.dates],
    ['Values read', diagnostics.values],
    ['Readings kept', diagnostics.kept],
  ];

  return (
    <div className="import-diagnostics">
      <div className="diagnostics-title">Import diagnostics</div>
      <dl className="diagnostics-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {diagnostics.removed.length > 0 && (
        <ul className="diagnostics-removed">
          {diagnostics.removed.map((item) => (
            <li key={`${item.label}:${item.count}`}>
              <b>{item.count}</b> {item.label}
            </li>
          ))}
        </ul>
      )}
      {diagnostics.notes.map((note) => (
        <p className="diagnostics-note" key={note}>
          {note}
        </p>
      ))}
    </div>
  );
}
