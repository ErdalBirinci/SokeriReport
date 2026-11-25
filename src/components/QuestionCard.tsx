export default function QuestionCard({ questions }: { questions: string[] }) {
  if (!questions.length) return null;

  return (
    <div className="card question-card">
      <ol className="question-list">
        {questions.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ol>
      <p className="question-note">
        Questions generated from this report. They are discussion prompts, not treatment advice.
      </p>
    </div>
  );
}
