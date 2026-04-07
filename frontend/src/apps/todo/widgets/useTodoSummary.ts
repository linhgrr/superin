import { useEffect, useState } from "react";
import { getTodoSummary, type SummaryResponse } from "../api";

export function useTodoSummary() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTodoSummary()
      .then(setSummary)
      .catch((error: unknown) => {
        console.error("Failed to load todo summary", error);
      })
      .finally(() => setLoading(false));
  }, []);

  return { summary, loading };
}
