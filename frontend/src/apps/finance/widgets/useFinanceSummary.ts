import { useEffect, useState } from "react";
import { getFinanceSummary, type SummaryResponse } from "../api";

export function useFinanceSummary() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFinanceSummary()
      .then(setSummary)
      .catch((error: unknown) => {
        console.error("Failed to load finance summary", error);
      })
      .finally(() => setLoading(false));
  }, []);

  return { summary, loading };
}
