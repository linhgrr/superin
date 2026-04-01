import { useEffect, useState } from "react";
import { getFinanceSummary, type FinanceSummary } from "../api";

export function useFinanceSummary() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFinanceSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { summary, loading };
}
