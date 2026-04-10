import useSWR from "swr";
import { swrConfig } from "@/lib/swr";
import { getFinanceSummary, type SummaryResponse } from "../api";

export function useFinanceSummary() {
  return useSWR<SummaryResponse>("finance/summary", getFinanceSummary, swrConfig);
}
