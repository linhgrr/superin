import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateUserSettings } from "@/api/auth";
import { STORAGE_KEYS } from "@/constants/storage";
import { getWorkspaceBootstrap } from "@/api/workspace";

vi.mock("@/api/auth", () => ({
  updateUserSettings: vi.fn(),
}));

vi.mock("@/api/workspace", () => ({
  getWorkspaceBootstrap: vi.fn(),
}));

describe("settingsStore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.resetModules();
  });

  it("rolls back timezone when server sync fails", async () => {
    vi.mocked(updateUserSettings).mockRejectedValueOnce(new Error("network error"));

    const { useSettingsStore } = await import("./settingsStore");

    useSettingsStore.getState().internal_setSettings({
      animations: true,
      density: "comfortable",
      emailNotifications: true,
      marketingEmails: false,
      pushNotifications: true,
      theme: "system",
      timezone: "UTC",
    });

    const result = await useSettingsStore.getState().saveSettings({
      timezone: "Asia/Tokyo",
    });

    expect(result.timezoneSynced).toBe(false);
    expect(useSettingsStore.getState().settings.timezone).toBe("UTC");
  });

  it("rejects malformed persisted settings and falls back to defaults", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, '{"theme":42}');

    const { readStoredSettings } = await import("./settingsStore");

    expect(readStoredSettings()).toEqual({
      animations: true,
      density: "comfortable",
      emailNotifications: true,
      marketingEmails: false,
      pushNotifications: true,
      theme: "system",
      timezone: "UTC",
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe("workspaceStore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("stores workspaceError and clears loading flags when refresh fails", async () => {
    vi.mocked(getWorkspaceBootstrap).mockRejectedValueOnce(new Error("boom"));

    const { useWorkspaceStore } = await import("./workspaceStore");

    useWorkspaceStore.setState({
      isWorkspaceLoading: true,
      sessionRevision: 1,
      userId: "user-1",
      workspaceError: null,
    });

    await expect(useWorkspaceStore.getState().refreshWorkspace()).rejects.toThrow("boom");

    const state = useWorkspaceStore.getState();
    expect(state.isWorkspaceLoading).toBe(false);
    expect(state.isWorkspaceRefreshing).toBe(false);
    expect(state.workspaceError).toBe("boom");
  });
});

describe("platformUiStore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.resetModules();
  });

  it("persists desktop sidebar collapse separately from transient dialog state", async () => {
    const { usePlatformUiStore } = await import("./platformUiStore");

    usePlatformUiStore.getState().openCommandPalette();
    usePlatformUiStore.getState().toggleDesktopSidebar();

    expect(usePlatformUiStore.getState().isCommandPaletteOpen).toBe(true);
    expect(usePlatformUiStore.getState().isDesktopSidebarCollapsed).toBe(true);

    const persisted = localStorage.getItem(STORAGE_KEYS.PLATFORM_UI);
    expect(persisted).toContain('"isDesktopSidebarCollapsed":true');
    expect(persisted).not.toContain("isCommandPaletteOpen");
  });
});
