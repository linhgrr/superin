import * as Lucide from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Dynamic Lucide icon resolver.
 *
 * Maps icon names (from backend manifest) to Lucide icon components.
 * This allows the backend to specify icons and frontend renders them dynamically
 * without needing to hardcode imports.
 *
 * Usage:
 *   const Icon = resolveIcon("Wallet");
 *   return <Icon size={18} />;
 */

// Cache for resolved icons
const iconCache = new Map<string, LucideIcon>();

/**
 * Resolve an icon name to a Lucide icon component.
 * Returns a fallback icon if the name is not found.
 */
export function resolveIcon(iconName: string | undefined | null): LucideIcon {
  if (!iconName) {
    return Lucide.Circle;
  }

  // Check cache first
  if (iconCache.has(iconName)) {
    return iconCache.get(iconName)!;
  }

  // Try to get icon from Lucide namespace
  const icon = (Lucide as Record<string, LucideIcon | undefined>)[iconName];

  if (icon) {
    iconCache.set(iconName, icon);
    return icon;
  }

  // Fallback to generic icons
  console.warn(`[IconResolver] Icon "${iconName}" not found in Lucide, using fallback`);

  // Try common fallbacks based on name patterns
  if (iconName.toLowerCase().includes("money") || iconName.toLowerCase().includes("wallet") || iconName.toLowerCase().includes("dollar")) {
    return Lucide.Wallet;
  }
  if (iconName.toLowerCase().includes("check") || iconName.toLowerCase().includes("task")) {
    return Lucide.CheckSquare;
  }
  if (iconName.toLowerCase().includes("calendar") || iconName.toLowerCase().includes("date") || iconName.toLowerCase().includes("clock")) {
    return Lucide.Calendar;
  }
  if (iconName.toLowerCase().includes("chart") || iconName.toLowerCase().includes("graph")) {
    return Lucide.BarChart3;
  }
  if (iconName.toLowerCase().includes("setting") || iconName.toLowerCase().includes("config")) {
    return Lucide.Settings;
  }
  if (iconName.toLowerCase().includes("user") || iconName.toLowerCase().includes("person")) {
    return Lucide.User;
  }
  if (iconName.toLowerCase().includes("home") || iconName.toLowerCase().includes("house")) {
    return Lucide.Home;
  }
  if (iconName.toLowerCase().includes("search") || iconName.toLowerCase().includes("find")) {
    return Lucide.Search;
  }

  // Generic fallback
  return Lucide.Sparkles;
}

/**
 * Component wrapper that dynamically renders an icon by name.
 * Use this when you need JSX element directly.
 */
export interface DynamicIconProps {
  name: string | undefined | null;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function DynamicIcon({ name, size = 18, className, strokeWidth = 2 }: DynamicIconProps) {
  const Icon = resolveIcon(name);
  return <Icon size={size} className={className} strokeWidth={strokeWidth} />;
}

/**
 * Preload common icons to avoid runtime resolution overhead.
 * Call this in your app initialization if needed.
 */
export function preloadIcons(iconNames: string[]): void {
  for (const name of iconNames) {
    resolveIcon(name);
  }
}
