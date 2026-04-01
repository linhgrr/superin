import { calendarApp } from "./calendar";
import { financeApp } from "./finance";
import { todoApp } from "./todo";
import type { FrontendAppDefinition } from "./types";

export const FRONTEND_APPS = {
  calendar: calendarApp,
  finance: financeApp,
  todo: todoApp,
} as const satisfies Record<string, FrontendAppDefinition>;

export function getFrontendApp(appId: string) {
  return FRONTEND_APPS[appId as keyof typeof FRONTEND_APPS];
}
