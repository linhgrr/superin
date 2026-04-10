import useSWR from "swr";
import { swrConfig } from "@/lib/swr";
import { getTodoSummary, type SummaryResponse } from "../api";

export function useTodoSummary() {
  return useSWR<SummaryResponse>("todo/summary", getTodoSummary, swrConfig);
}
