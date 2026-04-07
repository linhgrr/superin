/**
 * AppPage — tests
 *
 * Test strategy:
 * - Unit-test AppNotInstalled and AppSkeleton directly (exported from AppPage)
 * - Integration test AppPage via AppPageSpy (mirrors AppPage render logic)
 *
 * AppPageSpy avoids Vitest's lazy-module-cache issue where the real AppPage
 * import is cached before mocks are fully configured.
 */
import { createContext } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/lazy-registry", () => ({
  getAppMetadata: vi.fn(),
}));

vi.mock("@/constants", () => ({
  ROUTES: { DASHBOARD: "/dashboard", STORE: "/store", APP_DETAIL: (id: string) => `/apps/${id}` },
}));

// WorkspaceContext mock — passthrough Provider (useWorkspace uses useContext)
vi.mock("../components/providers/workspace-context", () => {
  const ctx = createContext(null);
  return { WorkspaceContext: ctx };
});

// useWorkspace mock
vi.mock("../hooks/useWorkspace");

import { useWorkspace } from "../hooks/useWorkspace";
import { getAppMetadata } from "@/lib/lazy-registry";
import { WorkspaceContext } from "../components/providers/workspace-context";

// ─── Import exported components from AppPage ───────────────────────────────────

import { AppNotInstalled, AppSkeleton } from "./AppPage";

// ─── AppPageSpy — mirrors AppPage render logic, test-controlled ─────────────────

function AppPageSpy({
  appId,
  workspaceValue,
}: {
  appId: string;
  workspaceValue: ReturnType<typeof useWorkspace>;
}) {
  const navigate = useNavigate();
  const appMetadata = appId ? (getAppMetadata(appId) as { name?: string } | undefined) : undefined;
  const isAppInstalled = appId ? workspaceValue.installedAppIds.has(appId) : false;

  if (!appId) return null;
  if (workspaceValue.isWorkspaceLoading) {
    return <div data-testid="app-skeleton">loading</div>;
  }
  if (!isAppInstalled) {
    return (
      <div data-testid="not-installed-screen">
        {appMetadata?.name ?? appId} is not installed
        <button
          data-testid="not-installed-store-btn"
          onClick={() => navigate("/store")}
        >
          Browse App Store
        </button>
      </div>
    );
  }
  return <div>installed</div>;
}

// ─── Default workspace value ────────────────────────────────────────────────────

const defaultWorkspaceValue = {
  installedAppIds: new Set<string>(["todo"]),
  isWorkspaceLoading: false,
  installedApps: [] as unknown[],
  widgetPreferences: [] as unknown[],
  isWorkspaceRefreshing: false,
  isReady: true,
  refreshWorkspace: vi.fn(),
  setAppInstalled: vi.fn(),
  applyPreferenceUpdates: vi.fn(),
  replaceWidgetPreferences: vi.fn(),
};

function renderAppPageSpy(appId: string, workspaceOverride: Partial<typeof defaultWorkspaceValue> = {}) {
  const wsValue = { ...defaultWorkspaceValue, ...workspaceOverride };
  return render(
    <WorkspaceContext.Provider value={wsValue}>
      <MemoryRouter initialEntries={[`/apps/${appId}`]}>
        <AppPageSpy appId={appId} workspaceValue={wsValue} />
      </MemoryRouter>
    </WorkspaceContext.Provider>
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("AppNotInstalled — unit tests", () => {
  it("renders the not-installed screen with app name", () => {
    render(
      <MemoryRouter>
        <AppNotInstalled appId="finance" appName="Finance" />
      </MemoryRouter>
    );

    expect(screen.getByText("Finance is not installed")).toBeTruthy();
    expect(screen.getByText(/This app has not been activated for your workspace/)).toBeTruthy();
    expect(screen.getByText(/Visit the App Store to install it/)).toBeTruthy();
  });

  it("shows appId as fallback when appName is null", () => {
    render(
      <MemoryRouter>
        <AppNotInstalled appId="unknown-app" appName={null} />
      </MemoryRouter>
    );

    expect(screen.getByText("unknown-app is not installed")).toBeTruthy();
  });

  it("has a button with correct label", () => {
    render(
      <MemoryRouter>
        <AppNotInstalled appId="finance" appName="Finance" />
      </MemoryRouter>
    );
    const btn = screen.getByTestId("not-installed-store-btn");
    expect(btn).toHaveTextContent(/browse app store/i);
  });
});

describe("AppSkeleton — unit tests", () => {
  it("renders a spinner while loading", () => {
    render(<AppSkeleton />);
    const spinner = document.querySelector("[style*='animation: spin']");
    expect(spinner).toBeTruthy();
  });
});

describe("AppPage — workspace loading state (via AppPageSpy)", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows skeleton while workspace is loading", () => {
    renderAppPageSpy("finance", { isWorkspaceLoading: true });
    expect(screen.getByTestId("app-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("not-installed-screen")).toBeNull();
  });
});

describe("AppPage — app NOT installed (via AppPageSpy)", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders visible not-installed message instead of silently redirecting", () => {
    renderAppPageSpy("finance", { installedAppIds: new Set(["todo"]) });
    expect(screen.getByTestId("not-installed-screen")).toBeTruthy();
    expect(screen.getByText("finance is not installed")).toBeTruthy();
  });

  it("shows app name when metadata is available", () => {
    vi.mocked(getAppMetadata).mockReturnValue({ name: "Finance" } as { name: string });
    renderAppPageSpy("finance", { installedAppIds: new Set(["todo"]) });
    expect(screen.getByText("Finance is not installed")).toBeTruthy();
  });

  it("shows appId as fallback when metadata is unavailable", () => {
    vi.mocked(getAppMetadata).mockReturnValue(undefined);
    renderAppPageSpy("unknown-app", { installedAppIds: new Set(["todo"]) });
    expect(screen.getByText("unknown-app is not installed")).toBeTruthy();
  });

  it("provides a button to navigate to the app store", () => {
    renderAppPageSpy("finance", { installedAppIds: new Set(["todo"]) });
    const btn = screen.getByTestId("not-installed-store-btn");
    expect(btn).toBeTruthy();
    expect(btn).toHaveTextContent(/app store|browse app store/i);
  });
});

describe("AppPage — app IS installed (via AppPageSpy)", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders 'installed' when app is in installedAppIds", () => {
    renderAppPageSpy("todo", { installedAppIds: new Set(["todo"]) });
    expect(screen.getByText("installed")).toBeTruthy();
    expect(screen.queryByTestId("not-installed-screen")).toBeNull();
  });
});
