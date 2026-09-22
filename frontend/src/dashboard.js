// Shared configuration and helpers for the reconciliation dashboard.

// Every plan we reconcile. `code` is the Paycom deduction code and is what the
// backend stores as the run's "metric", so it uniquely identifies a plan.
export const PLANS = [
  { code: "dkrm", label: "Kaiser", provider: "kaiser", metric: "dkrm" },
  { code: "ddnt", label: "Dental", provider: "dental", metric: "ddnt" },
  { code: "dvsn", label: "Vision", provider: "vision", metric: "dvsn" },
  { code: "dcmp", label: "CCHP", provider: "united_cchp", metric: "dcmp" },
  { code: "duhm", label: "United Health", provider: "united_cchp", metric: "duhm" },
  { code: "dchi", label: "Landmark", provider: "landmark", metric: "dchi" },
  { code: "devl", label: "UNUM EE Life", short: "EE Life", group: "unum", provider: "unum", metric: "unum", unumType: "devl" },
  { code: "deva", label: "UNUM EE AD&D", short: "EE AD&D", group: "unum", provider: "unum", metric: "unum", unumType: "deva" },
  { code: "dsvl", label: "UNUM Spouse Life", short: "Spouse Life", group: "unum", provider: "unum", metric: "unum", unumType: "dsvl" },
  { code: "dsva", label: "UNUM Spouse AD&D", short: "Spouse AD&D", group: "unum", provider: "unum", metric: "unum", unumType: "dsva" },
  { code: "dcvl", label: "UNUM Child Life", short: "Child Life", group: "unum", provider: "unum", metric: "unum", unumType: "dcvl" },
  { code: "dcva", label: "UNUM Child AD&D", short: "Child AD&D", group: "unum", provider: "unum", metric: "unum", unumType: "dcva" },
];

export const PLAN_BY_CODE = Object.fromEntries(PLANS.map((plan) => [plan.code, plan]));

export function planLabel(code) {
  return PLAN_BY_CODE[code]?.label ?? code;
}

// Mismatch categories from the backend. Colors match the --type-* variables in App.css.
export const MISMATCH_TYPES = {
  amount_diff: {
    label: "Amounts differ",
    color: "#005baa",
    hint: "The employee is on both, but the amounts don't agree.",
  },
  payroll_only: {
    label: "Deducted, not billed",
    color: "#b45309",
    hint: "Paycom deducted it, but the employee isn't on the invoice.",
  },
  invoice_only: {
    label: "Billed, not deducted",
    color: "#be123c",
    hint: "The provider billed it, but Paycom has no deduction.",
  },
};

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthName(month) {
  return MONTHS[Number(month) - 1] ?? "";
}

export function padMonth(month) {
  return String(month).padStart(2, "0");
}

export function periodLabel(year, month) {
  return `${monthName(month)} ${year}`;
}

export function shortPeriodLabel(year, month) {
  return `${monthName(month).slice(0, 3)} ${String(year).slice(2)}`;
}

// A single number per month so periods sort and compare easily.
export function periodIndex(year, month) {
  return Number(year) * 12 + Number(month) - 1;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(value) {
  return value == null ? "—" : currency.format(value);
}

export function formatSignedMoney(value) {
  if (value == null) return "—";
  return value > 0 ? `+${currency.format(value)}` : currency.format(value);
}

export function formatCompactMoney(value) {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

// The backend stores times in UTC as "YYYY-MM-DD HH:MM:SS".
export function formatRunTime(runAt) {
  if (!runAt) return "";
  const date = new Date(`${runAt.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? runAt : date.toLocaleString();
}

// Tukey's rule: values above Q3 + 1.5 × IQR stand out from the rest.
// With fewer than four values there's no meaningful "rest", so nothing is flagged.
export function outlierThreshold(values) {
  if (values.length < 4) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (p) => {
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };
  const q1 = quantile(0.25);
  const q3 = quantile(0.75);
  return q3 + 1.5 * (q3 - q1);
}

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
