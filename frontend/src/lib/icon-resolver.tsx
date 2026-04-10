import { useEffect, useMemo, useState } from "react";

// Direct per-icon imports — avoids barrel cost (~50–100 KB) of lucide-react entry.
// Each fallback icon is ~200–400 bytes vs ~1.5 MB for the full barrel.
// dynamicIconImports handles all runtime-dynamic icons lazily via code-split chunks.
import type { LucideIcon, LucideProps } from "lucide-react";
import Circle from "lucide-react/dist/esm/icons/circle";
import Wallet from "lucide-react/dist/esm/icons/wallet";
import CheckSquare from "lucide-react/dist/esm/icons/check-square";
import Calendar from "lucide-react/dist/esm/icons/calendar";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3";
import Settings from "lucide-react/dist/esm/icons/settings";
import User from "lucide-react/dist/esm/icons/user";
import Home from "lucide-react/dist/esm/icons/home";
import Search from "lucide-react/dist/esm/icons/search";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import X from "lucide-react/dist/esm/icons/x";
import Bell from "lucide-react/dist/esm/icons/bell";
import Keyboard from "lucide-react/dist/esm/icons/keyboard";
import Palette from "lucide-react/dist/esm/icons/palette";
import Command from "lucide-react/dist/esm/icons/command";
import LogOut from "lucide-react/dist/esm/icons/log-out";
import HelpCircle from "lucide-react/dist/esm/icons/help-circle";
import PlayCircle from "lucide-react/dist/esm/icons/play-circle";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle";
import Eye from "lucide-react/dist/esm/icons/eye";
import EyeOff from "lucide-react/dist/esm/icons/eye-off";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard";
import Store from "lucide-react/dist/esm/icons/store";
import Shield from "lucide-react/dist/esm/icons/shield";
import CreditCard from "lucide-react/dist/esm/icons/credit-card";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import Sun from "lucide-react/dist/esm/icons/sun";
import Moon from "lucide-react/dist/esm/icons/moon";
import Monitor from "lucide-react/dist/esm/icons/monitor";
import Download from "lucide-react/dist/esm/icons/download";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Puzzle from "lucide-react/dist/esm/icons/puzzle";
import Users from "lucide-react/dist/esm/icons/users";
import Globe from "lucide-react/dist/esm/icons/globe";
import Camera from "lucide-react/dist/esm/icons/camera";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Construction from "lucide-react/dist/esm/icons/construction";
import Grid3x3 from "lucide-react/dist/esm/icons/grid-3x3";
import List from "lucide-react/dist/esm/icons/list";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Sunrise from "lucide-react/dist/esm/icons/sunrise";
import TrendingUp from "lucide-react/dist/esm/icons/trending-up";
import TrendingDown from "lucide-react/dist/esm/icons/trending-down";
import Check from "lucide-react/dist/esm/icons/check";
import Plus from "lucide-react/dist/esm/icons/plus";
import ListTodo from "lucide-react/dist/esm/icons/list-todo";
import Repeat from "lucide-react/dist/esm/icons/repeat";
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
  if (normalized.includes("x") || normalized.includes("close")) {
    return X;
  }
  if (normalized.includes("bell") || normalized.includes("notification")) {
    return Bell;
  }
  if (normalized.includes("keyboard")) {
    return Keyboard;
  }
  if (normalized.includes("palette") || normalized.includes("paint") || normalized.includes("theme")) {
    return Palette;
  }
  if (normalized.includes("command") || normalized.includes("cmd")) {
    return Command;
  }
  if (normalized.includes("logout") || normalized.includes("sign-out") || normalized.includes("signout")) {
    return LogOut;
  }
  if (normalized.includes("help")) {
    return HelpCircle;
  }
  if (normalized.includes("play")) {
    return PlayCircle;
  }
  if (normalized.includes("message") || normalized.includes("chat") || normalized.includes("chatbub")) {
    return MessageCircle;
  }
  if (normalized.includes("eye-open") || normalized.includes("visible")) {
    return Eye;
  }
  if (normalized.includes("eye-off") || normalized.includes("hidden")) {
    return EyeOff;
  }
  if (normalized.includes("arrow-right") || normalized.includes("arrowright") || normalized.includes("forward")) {
    return ArrowRight;
  }
  if (normalized.includes("layout-dashboard") || normalized.includes("dashboard")) {
    return LayoutDashboard;
  }
  if (normalized.includes("store") || normalized.includes("shop")) {
    return Store;
  }
  if (normalized.includes("shield") || normalized.includes("admin")) {
    return Shield;
  }
  if (normalized.includes("credit-card") || normalized.includes("billing") || normalized.includes("card")) {
    return CreditCard;
  }
  if (normalized.includes("loader") || normalized.includes("spinner") || normalized.includes("loading")) {
    return Loader2;
  }
  if (normalized.includes("sun") || normalized.includes("light-mode")) {
    return Sun;
  }
  if (normalized.includes("moon") || normalized.includes("dark-mode")) {
    return Moon;
  }
  if (normalized.includes("monitor") || normalized.includes("system")) {
    return Monitor;
  }
  if (normalized.includes("download") || normalized.includes("install")) {
    return Download;
  }
  if (normalized.includes("trash") || normalized.includes("delete") || normalized.includes("remove")) {
    return Trash2;
  }
  if (normalized.includes("puzzle") || normalized.includes("plugin") || normalized.includes("extension")) {
    return Puzzle;
  }
  if (normalized.includes("users") || normalized.includes("user-group")) {
    return Users;
  }
  if (normalized.includes("globe") || normalized.includes("world") || normalized.includes("timezone")) {
    return Globe;
  }
  if (normalized.includes("camera") || normalized.includes("photo") || normalized.includes("avatar")) {
    return Camera;
  }
  if (normalized.includes("refresh") || normalized.includes("reload") || normalized.includes("sync")) {
    return RefreshCw;
  }
  if (normalized.includes("construction") || normalized.includes("wip") || normalized.includes("building")) {
    return Construction;
  }
  if (normalized.includes("grid") || normalized.includes("view-grid")) {
    return Grid3x3;
  }
  if (normalized.includes("list") || normalized.includes("menu")) {
    return List;
  }
  if (normalized.includes("pencil") || normalized.includes("edit")) {
    return Pencil;
  }
  if (normalized.includes("sunrise") || normalized.includes("morning")) {
    return Sunrise;
  }
  if (normalized.includes("trending-up") || normalized.includes("gain") || normalized.includes("up-arrow")) {
    return TrendingUp;
  }
  if (normalized.includes("trending-down") || normalized.includes("loss") || normalized.includes("down-arrow")) {
    return TrendingDown;
  }
  if (normalized.includes("check")) {
    return Check;
  }
  if (normalized.includes("plus") || normalized.includes("add")) {
    return Plus;
  }
  if (normalized.includes("list-todo") || normalized.includes("todo-list") || normalized.includes("tasks")) {
    return ListTodo;
  }
  if (normalized.includes("repeat") || normalized.includes("recurring") || normalized.includes("recurrence")) {
    return Repeat;
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

// eslint-disable-next-line react-refresh/only-export-components
export function resolveIcon(iconName: string | undefined | null): LucideIcon {
  if (!iconName) {
    return Circle;
  }

  return iconCache.get(normalizeIconName(iconName)) ?? fallbackIconFor(iconName);
}

export interface DynamicIconProps extends Omit<LucideProps, "ref"> {
  name?: string;
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

// eslint-disable-next-line react-refresh/only-export-components
export function preloadIcons(iconNames: string[]): void {
  for (const iconName of iconNames) {
    void loadIconComponent(iconName);
  }
}
