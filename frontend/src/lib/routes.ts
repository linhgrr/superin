import { ROUTE_NAMES, ROUTES } from "@/constants/routes";
import type { AppRuntimeEntry } from "@/types/generated";

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getShellRouteTitle(
  pathname: string,
  installedApps: AppRuntimeEntry[]
): string {
  const [, firstSegment = "", secondSegment] = pathname.split("/");

  if (firstSegment === "apps" && secondSegment) {
    return installedApps.find((app) => app.id === secondSegment)?.name ?? toTitleCase(secondSegment);
  }

  const routeName = ROUTE_NAMES[`/${firstSegment}`];
  if (routeName) {
    return routeName;
  }

  if (firstSegment) {
    return toTitleCase(firstSegment);
  }

  return ROUTE_NAMES[ROUTES.DASHBOARD];
}

export function isChatRoute(pathname: string): boolean {
  return pathname === ROUTES.CHAT;
}
