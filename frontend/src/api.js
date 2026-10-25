// Calls to the Flask backend. Set REACT_APP_API_BASE to point somewhere else.
const API_BASE = process.env.REACT_APP_API_BASE ?? "http://localhost:5000";

async function request(path, options) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error(`Can't reach the server at ${API_BASE}. Check that the Flask backend is running.`);
  }

  let data = null;
  let unreadable = false;
  try {
    data = await response.json();
  } catch {
    unreadable = true;
  }
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status}).`);
  }
  if (unreadable) {
    throw new Error(`The server sent a response for ${path} that couldn't be read.`);
  }
  return data;
}

function postForm(path, fields) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.append(key, value ?? ""));
  return request(path, { method: "POST", body: formData });
}

export const api = {
  payrollStatus: (year, month) =>
    request(`/api/payroll?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`),

  uploadPayroll: (year, month, paycom1, paycom2) =>
    postForm("/api/payroll", { year, month, paycom1, paycom2 }),

  compare: (year, month, plan, health) =>
    postForm("/api/compare", {
      year,
      month,
      provider: plan.provider,
      metric: plan.metric,
      unumType: plan.unumType,
      health,
    }),

  runs: () => request("/api/runs"),

  run: (runId) => request(`/api/runs/${runId}`),

  repeatOffenders: () => request("/api/repeat-offenders"),

  ledgerSummary: () => request("/api/ledger/summary"),
  openBalances: () => request("/api/ledger/open"),
  ledgerGrid: (metric, months) => request(`/api/ledger/grid?metric=${encodeURIComponent(metric)}&months=${months}`),
  employeeHistory: (eecode) => request(`/api/employees/${encodeURIComponent(eecode)}/history`),

  ask: (question, context) =>
    request("/ask-ollama", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context }),
    }),
};