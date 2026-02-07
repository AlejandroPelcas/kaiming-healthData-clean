const styles = {
  card: {
    background: "#ffffff",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 6px 16px rgba(0,0,0,0.06)",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: "14px",
  },
  th: {
    textAlign: "left",
    padding: "12px",
    background: "#f9fafb",
    color: "#374151",
    fontWeight: 600,
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid #f1f5f9",
    color: "#111827",
    whiteSpace: "nowrap",
  },
  tr: {
    transition: "background 0.15s ease",
  },
  empty: {
    color: "#6b7280",
    padding: "12px",
  },
};

function MisMatchTable({ mismatches }) {
  if (!mismatches || mismatches.length === 0) {
    return <p style={styles.empty}>No mismatches found.</p>;
  }

  return (
    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            {Object.keys(mismatches[0]).map((key) => (
              <th key={key} style={styles.th}>
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mismatches.map((row, i) => (
            <tr key={i} style={styles.tr}>
              {Object.values(row).map((val, j) => (
                <td key={j} style={styles.td}>
                  {val ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default MisMatchTable;
