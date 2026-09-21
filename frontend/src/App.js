import React, { useState } from "react";
import FileDrop from "./DragAndDrop";
import YearMonthSelector from "./YearMonthSelector";
import HealthProviderButton from "./HealthProvider";
import MisMatchTable from "./MisMatchTable";
import UnumMetric from "./UnumMetric";
import YearInput from "./YearInput";
import "./App.css";
console.log("CSS file should be loading");
function FileUpload() {
  const [paycom1, setPaycom1] = useState(null);
  const [paycom2, setPaycom2] = useState(null);
  const [health, setHealth] = useState(null);
  const [mismatches, setMismatches] = useState([]);

  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [provider, setProvider] = useState("");
  const [unumType, setUnumType] = useState("");
  const [metric, setMetric] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  //AI constants
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  const askOllama = async () => {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer("");
  
    try {
      const response = await fetch("http://localhost:5000/ask-ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          context: { mismatches, year, month, provider, metric },
        }),
      });
  
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed.");
  
      setAnswer(data.answer || "No response.");
    } catch (err) {
      console.error("Ollama request failed:", err);
      setAnswer(err.message || "Something went wrong asking the model.");
    } finally {
      setAsking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!paycom1 || !paycom2 || !health) {
      setError("Please upload all three files.");
      return;
    }

    if (!year || !month) {
      setError("Please enter the year and month for the health provider file.");
      return;
    }

    if (!provider) {
      setError("Please select a health provider.");
      return;
    }

    if (provider === "unum" && !unumType) {
      setError("Please select a UNUM type.");
      return;
    }

    const formData = new FormData();
    formData.append("paycom1", paycom1);
    formData.append("paycom2", paycom2);
    formData.append("health", health);
    formData.append("year", year);
    formData.append("month", month);
    formData.append("provider", provider);
    formData.append("metric", metric);
    formData.append("unumType", unumType);

    try {
      setIsLoading(true);

      const response = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed. Please check your files and try again.");
      }

      const data = await response.json();

      const renamedOrderedData = data.map((row) => {
        const payrollKey = Object.keys(row).find(
          (key) =>
            key !== "eecode" &&
            key !== "Name" &&
            key !== "Invoice" &&
            key !== "difference"
        );

        return {
          eecode: row.eecode,
          Name: row.Name,
          payroll: row[payrollKey],
          Invoice: row.Invoice,
          difference: row.difference,
        };
      });

      setMismatches(renamedOrderedData);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="container">
      <section className="app-header">
        <img src="/kai-ming-logo.jpeg" alt="Kai Ming Logo" className="logo" />

        <div>
          <p className="eyebrow">Benefits Reconciliation</p>
          <h1>Kai Ming Benefits Reconciliation</h1>
          <p>
            Upload Paycom payroll reports and provider invoices to compare
            employee benefit deductions.
          </p>
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit}>
        <section className="section-card">
          <h2>Upload Files</h2>

          <FileDrop
            label="Paycom Check Register: Days 1–15"
            onFileSelect={setPaycom1}
            file={paycom1}
          />
          {paycom1 && <p className="file-name">{paycom1.name}</p>}

          <FileDrop
            label="Paycom Check Register: Days 16–31"
            onFileSelect={setPaycom2}
            file={paycom2}
          />
          {paycom2 && <p className="file-name">{paycom2.name}</p>}

          <FileDrop
            label="Health Provider Data File"
            onFileSelect={setHealth}
            file={health}
          />
          {health && <p className="file-name">{health.name}</p>}
        </section>

        <section className="section-card">
          <h2>Select Health Provider</h2>

          <HealthProviderButton
            provider={provider}
            setProvider={setProvider}
            metric={metric}
            setMetric={setMetric}
          />
        </section>

        {provider === "unum" && (
          <section className="section-card">
            <h2>UNUM Plan Selection</h2>

            <UnumMetric
              metric={metric}
              setMetric={setMetric}
              unumType={unumType}
              setUnumType={setUnumType}
            />
          </section>
        )}

        <section className="section-card">
          <h2>Period Selection</h2>

          <YearInput year={year} setYear={setYear} />

          <YearMonthSelector
            year={year}
            month={month}
            setYear={setYear}
            setMonth={setMonth}
          />
        </section>

        <div className="action-bar">
          <button className="compare-button" type="submit" disabled={isLoading}>
            {isLoading ? "Comparing..." : "Compare Files"}
          </button>
        </div>
      </form>

{/* AI Textbox */}
        

  <section className="section-card">
    <div className="section-heading">
      <h2>Ask about the data</h2>
      <p>Ask a question about the comparison results below.</p>
    </div>

    <textarea
      className="question-input"
      rows={3}
      value={question}
      onChange={(e) => setQuestion(e.target.value)}
      placeholder="e.g. Which employees have the largest differences? What's the total difference?"
    />

    <button
      type="button"
      className="primary-button"
      onClick={askOllama}
      disabled={asking || !question.trim() || mismatches.length === 0}
    >
      {asking ? "Asking..." : "Ask"}
    </button>

    {answer && (
      <div className="answer-box">
        <strong>Answer:</strong>
        <p>{answer}</p>
      </div>
    )}
  </section>

      <section className="section-card">
        <h2>Mismatches</h2>
        <p className="helper-text">Differences less than $0.05 are ignored.</p>

        <MisMatchTable mismatches={mismatches} />
      </section>
    </main>
  );
}

export default FileUpload;