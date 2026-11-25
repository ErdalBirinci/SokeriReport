import type { Insight } from '../lib/metrics';

const GLYPH: Record<Insight['tone'], string> = {
  good: '✓',
  warn: '!',
  danger: '!',
  info: 'i',
};

export default function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <div className="insights">
      {insights.map((insight) => (
        <div className={`insight tone-${insight.tone}`} key={`${insight.tone}-${insight.title}`}>
          <span className="insight-icon" aria-hidden="true">
            {GLYPH[insight.tone]}
          </span>
          <div>
            <div className="insight-title">{insight.title}</div>
            <div className="insight-body">{insight.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
