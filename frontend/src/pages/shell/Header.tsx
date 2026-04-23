/**
 * Header — top navigation with user menu and tour trigger.
 */

import { DynamicIcon } from "@/lib/icon-resolver";
import { platformUiSelectors, usePlatformUiStore } from "@/stores/platform/platformUiStore";

import { TourMenu, UserMenu } from "./header-menus";

interface HeaderProps {
  title?: string;
  showTourTrigger?: boolean;
}

const HEADER_GIF_PATH = "/branding/header-title.gif";

export default function Header({ title, showTourTrigger = true }: HeaderProps) {
  const openCommandPalette = usePlatformUiStore(platformUiSelectors.openCommandPalette);

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <img
          aria-hidden="true"
          src={HEADER_GIF_PATH}
          alt=""
          width="220"
          height="42"
          loading="eager"
          className="app-header-brand-gif"
        />
        {title ? <span className="app-header-route-title">{title}</span> : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <button
          className="btn btn-ghost btn-icon"
          onClick={openCommandPalette}
          title="Command Palette (Cmd+K)"
          aria-label="Open command palette"
        >
          <DynamicIcon name="Command" size={16} />
        </button>

        {showTourTrigger ? <TourMenu /> : null}
        <UserMenu />
      </div>
    </header>
  );
}
