import { useEffect, useState } from "react";
import { getTodoSummary, type TodoSummary } from "../api";

export function useTodoSummary() {
  const [summary, setSummary] = useState<TodoSummary | null>(null);
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
