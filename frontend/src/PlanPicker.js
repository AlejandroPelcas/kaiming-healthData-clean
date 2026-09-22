import { PLANS } from "./dashboard";

const MAIN_PLANS = PLANS.filter((plan) => plan.group !== "unum");
const UNUM_PLANS = PLANS.filter((plan) => plan.group === "unum");

// One button per plan. Plans already compared this month show their mismatch
// count, or a check mark if everything matched.
function PlanPicker({ planCode, onChange, monthRuns }) {
  const renderButton = (plan) => {
    const run = monthRuns[plan.code];
    const title = run
      ? run.mismatch_count
        ? `${run.mismatch_count} employee(s) with a difference this month`
        : "Everything matched this month"
      : "Not compared yet this month";

    return (
      <button
        key={plan.code}
        type="button"
        className={`plan-chip ${planCode === plan.code ? "selected" : ""}`}
        onClick={() => onChange(plan.code)}
        title={title}
        aria-pressed={planCode === plan.code}
      >
        {plan.short ?? plan.label}
        {run && (
          <span className={`plan-status ${run.mismatch_count ? "has-issues" : "clean"}`}>
            {run.mismatch_count || "✓"}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="plan-picker">
      <div className="plan-row">{MAIN_PLANS.map(renderButton)}</div>
      <div className="plan-row">
        <span className="plan-group-label">UNUM</span>
        {UNUM_PLANS.map(renderButton)}
      </div>
    </div>
  );
}

export default PlanPicker;
