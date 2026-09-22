import { useEffect, useState } from "react";
import { api } from "./api";
import { MISMATCH_TYPES, monthName, planLabel } from "./dashboard";

function AskPanel({ run, rows }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  // A new comparison makes the old answer stale.
  useEffect(() => setAnswer(""), [run.id]);

  const ask = async () => {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer("");
    try {
      const data = await api.ask(question, {
        mismatches: rows.map((row) => ({
          eecode: row.eecode,
          Name: row.name,
          payroll: row.payroll,
          Invoice: row.invoice,
          difference: row.difference,
          type: MISMATCH_TYPES[row.mismatch_type]?.label ?? row.mismatch_type,
          matches_one_paycheck: row.one_paycheck,
        })),
        year: run.year,
        month: monthName(run.month),
        provider: planLabel(run.metric),
        metric: run.metric,
      });
      setAnswer(data.answer || "No response.");
    } catch (err) {
      setAnswer(err.message);
    } finally {
      setAsking(false);
    }
  };

  return (
    <section className="section-card">
      <h2>Ask about this comparison</h2>
      <textarea
        className="question-input"
        rows={2}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
        }}
        placeholder="e.g. Which employees were billed but not deducted?"
        aria-label="Question about this comparison"
      />
      <div className="card-actions">
        <button
          type="button"
          className="compare-button"
          onClick={ask}
          disabled={asking || !question.trim() || rows.length === 0}
        >
          {asking ? "Asking..." : "Ask"}
        </button>
      </div>
      {rows.length === 0 && <p className="helper-text">Nothing to ask about. Everything matched.</p>}
      {answer && <div className="answer-box">{answer}</div>}
    </section>
  );
}

export default AskPanel;
