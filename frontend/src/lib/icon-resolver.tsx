import type { LucideIcon, LucideProps } from "lucide-react";
import AlertCircle from "lucide-react/dist/esm/icons/alert-circle";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import ArrowDownRight from "lucide-react/dist/esm/icons/arrow-down-right";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import ArrowLeftRight from "lucide-react/dist/esm/icons/arrow-left-right";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3";
import Bell from "lucide-react/dist/esm/icons/bell";
import Calendar from "lucide-react/dist/esm/icons/calendar";
import CalendarClock from "lucide-react/dist/esm/icons/calendar-clock";
import Camera from "lucide-react/dist/esm/icons/camera";
import Check from "lucide-react/dist/esm/icons/check";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import CheckSquare from "lucide-react/dist/esm/icons/check-square";
import Circle from "lucide-react/dist/esm/icons/circle";
import Clock from "lucide-react/dist/esm/icons/clock";
import Command from "lucide-react/dist/esm/icons/command";
import Construction from "lucide-react/dist/esm/icons/construction";
import CreditCard from "lucide-react/dist/esm/icons/credit-card";
import Download from "lucide-react/dist/esm/icons/download";
import Eye from "lucide-react/dist/esm/icons/eye";
import EyeOff from "lucide-react/dist/esm/icons/eye-off";
import Folder from "lucide-react/dist/esm/icons/folder";
import Globe from "lucide-react/dist/esm/icons/globe";
import Grid3x3 from "lucide-react/dist/esm/icons/grid-3x3";
import HelpCircle from "lucide-react/dist/esm/icons/help-circle";
import History from "lucide-react/dist/esm/icons/history";
import Home from "lucide-react/dist/esm/icons/home";
import Keyboard from "lucide-react/dist/esm/icons/keyboard";
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import List from "lucide-react/dist/esm/icons/list";
import ListTodo from "lucide-react/dist/esm/icons/list-todo";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import LogOut from "lucide-react/dist/esm/icons/log-out";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle";
import Monitor from "lucide-react/dist/esm/icons/monitor";
import Moon from "lucide-react/dist/esm/icons/moon";
import Package from "lucide-react/dist/esm/icons/package";
import Palette from "lucide-react/dist/esm/icons/palette";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import PieChart from "lucide-react/dist/esm/icons/pie-chart";
import PlayCircle from "lucide-react/dist/esm/icons/play-circle";
import Plus from "lucide-react/dist/esm/icons/plus";
import Puzzle from "lucide-react/dist/esm/icons/puzzle";
import Receipt from "lucide-react/dist/esm/icons/receipt";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Repeat from "lucide-react/dist/esm/icons/repeat";
import Search from "lucide-react/dist/esm/icons/search";
import Send from "lucide-react/dist/esm/icons/send";
import Settings from "lucide-react/dist/esm/icons/settings";
import Shield from "lucide-react/dist/esm/icons/shield";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Store from "lucide-react/dist/esm/icons/store";
import Sun from "lucide-react/dist/esm/icons/sun";
import Sunrise from "lucide-react/dist/esm/icons/sunrise";
import Tag from "lucide-react/dist/esm/icons/tag";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import TrendingDown from "lucide-react/dist/esm/icons/trending-down";
import TrendingUp from "lucide-react/dist/esm/icons/trending-up";
import User from "lucide-react/dist/esm/icons/user";
import Users from "lucide-react/dist/esm/icons/users";
import Wallet from "lucide-react/dist/esm/icons/wallet";
import X from "lucide-react/dist/esm/icons/x";
import Zap from "lucide-react/dist/esm/icons/zap";

const ICONS = {
  alertcircle: AlertCircle,
  alerttriangle: AlertTriangle,
  arrowdownright: ArrowDownRight,
  arrowleft: ArrowLeft,
  arrowleftright: ArrowLeftRight,
  arrowright: ArrowRight,
  arrowupright: ArrowUpRight,
  barchart3: BarChart3,
  bell: Bell,
  calendar: Calendar,
  calendarclock: CalendarClock,
  camera: Camera,
  check: Check,
  checkcircle2: CheckCircle2,
  checksquare: CheckSquare,
  circle: Circle,
  clock: Clock,
  command: Command,
  construction: Construction,
  creditcard: CreditCard,
  download: Download,
  eye: Eye,
  eyeoff: EyeOff,
  folder: Folder,
  globe: Globe,
  grid3x3: Grid3x3,
  helpcircle: HelpCircle,
  history: History,
  home: Home,
  keyboard: Keyboard,
  layoutdashboard: LayoutDashboard,
  layoutgrid: LayoutGrid,
  list: List,
  listtodo: ListTodo,
  loader2: Loader2,
  logout: LogOut,
  messagecircle: MessageCircle,
  monitor: Monitor,
  moon: Moon,
  package: Package,
  palette: Palette,
  pencil: Pencil,
  piechart: PieChart,
  playcircle: PlayCircle,
  plus: Plus,
  puzzle: Puzzle,
  receipt: Receipt,
  refreshcw: RefreshCw,
  repeat: Repeat,
  search: Search,
  send: Send,
  settings: Settings,
  shield: Shield,
  sparkles: Sparkles,
  store: Store,
  sun: Sun,
  sunrise: Sunrise,
  tag: Tag,
  trash2: Trash2,
  trendingdown: TrendingDown,
  trendingup: TrendingUp,
  user: User,
  users: Users,
  wallet: Wallet,
  x: X,
  zap: Zap,
} as const satisfies Record<string, LucideIcon>;

function normalizeIconName(iconName: string): string {
  return iconName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function fallbackIconFor(iconName: string | undefined | null): LucideIcon {
  const normalized = normalizeIconName(iconName ?? "");

  if (!normalized) return Circle;
  if (normalized.includes("wallet") || normalized.includes("money") || normalized.includes("dollar")) return Wallet;
  if (normalized.includes("check") || normalized.includes("task") || normalized.includes("todo")) return CheckSquare;
  if (normalized.includes("calendar") || normalized.includes("date") || normalized.includes("clock")) return Calendar;
  if (normalized.includes("chart") || normalized.includes("graph")) return BarChart3;
  if (normalized.includes("setting") || normalized.includes("config")) return Settings;
  if (normalized.includes("user") || normalized.includes("person")) return User;
  if (normalized.includes("home") || normalized.includes("house")) return Home;
  if (normalized.includes("search") || normalized.includes("find")) return Search;
  if (normalized.includes("message") || normalized.includes("chat")) return MessageCircle;
  if (normalized.includes("billing") || normalized.includes("card")) return CreditCard;
  if (normalized.includes("store") || normalized.includes("shop")) return Store;
  if (normalized.includes("admin") || normalized.includes("shield")) return Shield;
  if (normalized.includes("theme") || normalized.includes("paint")) return Palette;
  if (normalized.includes("download") || normalized.includes("install")) return Download;
  if (normalized.includes("delete") || normalized.includes("remove") || normalized.includes("trash")) return Trash2;
  if (normalized.includes("plugin") || normalized.includes("extension")) return Puzzle;
  if (normalized.includes("world") || normalized.includes("timezone")) return Globe;
  if (normalized.includes("camera") || normalized.includes("photo") || normalized.includes("avatar")) return Camera;
  if (normalized.includes("reload") || normalized.includes("sync")) return RefreshCw;
  if (normalized.includes("grid")) return LayoutGrid;
  if (normalized.includes("list")) return List;
  if (normalized.includes("edit") || normalized.includes("pencil")) return Pencil;
  if (normalized.includes("morning") || normalized.includes("sunrise")) return Sunrise;
  if (normalized.includes("gain") || normalized.includes("uparrow")) return TrendingUp;
  if (normalized.includes("loss") || normalized.includes("downarrow")) return TrendingDown;
  if (normalized.includes("folder")) return Folder;
  if (normalized.includes("package")) return Package;
  if (normalized.includes("receipt")) return Receipt;
  if (normalized.includes("history")) return History;
  if (normalized.includes("tag")) return Tag;

  return Sparkles;
}

export function resolveIcon(iconName: string | undefined | null): LucideIcon {
  if (!iconName) return Circle;

  const normalized = normalizeIconName(iconName);
  return ICONS[normalized as keyof typeof ICONS] ?? fallbackIconFor(iconName);
}

export interface DynamicIconProps extends Omit<LucideProps, "ref"> {
  name?: string;
  className?: string;
}

export function DynamicIcon({ name, ...props }: DynamicIconProps) {
  const Icon = resolveIcon(name);
  return <Icon {...props} />;
}

export function preloadIcons(_iconNames: string[]): void {}
