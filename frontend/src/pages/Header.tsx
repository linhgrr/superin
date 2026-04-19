/**
 * Header — top navigation with user menu and tour trigger.
 */

import { UserMenu, TourMenu } from "@/pages/header-menus";
import { DynamicIcon } from "@/lib/icon-resolver";
import { platformUiSelectors, usePlatformUiStore } from "@/stores/platform/platformUiStore";

interface HeaderProps {
  title?: string;
  showTourTrigger?: boolean;
}

const HEADER_GIF_PATH = "/branding/header-title.gif";

export default function Header({ title, showTourTrigger = true }: HeaderProps) {
  const openCommandPalette = usePlatformUiStore(platformUiSelectors.openCommandPalette);

  return (
    <header className="app-header">
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        <img
          src={HEADER_GIF_PATH}
          alt={title ?? "Dashboard"}
          loading="eager"
          style={{
            height: "42px",
            width: "auto",
            maxWidth: "min(100%, 220px)",
            objectFit: "contain",
            borderRadius: "10px",
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {/* Command Palette trigger */}
        <button
          className="btn btn-ghost btn-icon"
          onClick={openCommandPalette}
          title="Command Palette (Cmd+K)"
        >
          <DynamicIcon name="Command" size={16} />
        </button>

        {showTourTrigger && <TourMenu />}

        <UserMenu />
      </div>
    </header>
  );
}
