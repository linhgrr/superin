import { useEffect, useMemo, useState } from "react";

import type { LucideIcon, LucideProps } from "lucide-react";
import {
  BarChart3,
  Calendar,
  CheckSquare,
  Circle,
  Home,
  Search,
  Settings,
  Sparkles,
  User,
  Wallet,
} from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports";

type IconModuleLoader = () => Promise<{ default: LucideIcon }>;

const iconCache = new Map<string, LucideIcon>();
const iconLoadCache = new Map<string, Promise<LucideIcon | null>>();

const dynamicIconMap = dynamicIconImports as Record<string, IconModuleLoader | undefined>;

function normalizeIconName(iconName: string): string {
  return iconName
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function fallbackIconFor(iconName: string | undefined | null): LucideIcon {
  const normalized = normalizeIconName(iconName ?? "");

  if (!iconName) {
    return Circle;
  }
  if (normalized.includes("money") || normalized.includes("wallet") || normalized.includes("dollar")) {
    return Wallet;
  }
  if (normalized.includes("check") || normalized.includes("task")) {
    return CheckSquare;
  }
  if (normalized.includes("calendar") || normalized.includes("date") || normalized.includes("clock")) {
    return Calendar;
  }
  if (normalized.includes("chart") || normalized.includes("graph")) {
    return BarChart3;
  }
  if (normalized.includes("setting") || normalized.includes("config")) {
    return Settings;
  }
  if (normalized.includes("user") || normalized.includes("person")) {
    return User;
  }
  if (normalized.includes("home") || normalized.includes("house")) {
    return Home;
  }
  if (normalized.includes("search") || normalized.includes("find")) {
    return Search;
  }

  return Sparkles;
}

async function loadIconComponent(iconName: string | undefined | null): Promise<LucideIcon | null> {
  if (!iconName) {
    return null;
  }

  const normalized = normalizeIconName(iconName);
  const cached = iconCache.get(normalized);
  if (cached) {
    return cached;
  }

  const inFlight = iconLoadCache.get(normalized);
  if (inFlight) {
    return inFlight;
  }

  const loader = dynamicIconMap[normalized];
  if (!loader) {
    return null;
  }

  const request = loader()
    .then((module) => {
      const icon = module.default;
      iconCache.set(normalized, icon);
      return icon;
    })
    .catch(() => null)
    .finally(() => {
      iconLoadCache.delete(normalized);
    });

  iconLoadCache.set(normalized, request);
  return request;
}

export function resolveIcon(iconName: string | undefined | null): LucideIcon {
  if (!iconName) {
    return Circle;
  }

  return iconCache.get(normalizeIconName(iconName)) ?? fallbackIconFor(iconName);
}

export interface DynamicIconProps extends Omit<LucideProps, "ref"> {
  name: string | undefined | null;
  className?: string;
}

export function DynamicIcon({ name, ...props }: DynamicIconProps) {
  const fallbackIcon = useMemo(() => fallbackIconFor(name), [name]);
  const normalized = useMemo(() => (name ? normalizeIconName(name) : null), [name]);
  const [Icon, setIcon] = useState<LucideIcon>(() => {
    if (!normalized) {
      return fallbackIcon;
    }
    return iconCache.get(normalized) ?? fallbackIcon;
  });

  useEffect(() => {
    let cancelled = false;

    if (!normalized) {
      setIcon(() => fallbackIcon);
      return () => {
        cancelled = true;
      };
    }

    const cached = iconCache.get(normalized);
    if (cached) {
      setIcon(() => cached);
      return () => {
        cancelled = true;
      };
    }

    setIcon(() => fallbackIcon);

    void loadIconComponent(name).then((loadedIcon) => {
      if (!cancelled && loadedIcon) {
        setIcon(() => loadedIcon);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fallbackIcon, name, normalized]);

  return <Icon {...props} />;
}

export function preloadIcons(iconNames: string[]): void {
  for (const iconName of iconNames) {
    void loadIconComponent(iconName);
  }
}
