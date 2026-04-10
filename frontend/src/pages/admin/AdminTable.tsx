interface TableProps {
  columns: string[];
  rows: React.ReactNode[][];
}

export function Table({ columns, rows }: TableProps) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "16px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--color-surface)" }}>
            {columns.map((column) => (
              <th
                key={column}
                style={{
                  textAlign: "left",
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--color-foreground-muted)",
                  fontWeight: 700,
                  padding: "0.8rem 1rem",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, rowIndex) => (
            <tr key={rowIndex}>
              {cells.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{
                    padding: "0.85rem 1rem",
                    borderBottom: rowIndex < rows.length - 1 ? "1px solid var(--color-border)" : "none",
                    verticalAlign: "middle",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}