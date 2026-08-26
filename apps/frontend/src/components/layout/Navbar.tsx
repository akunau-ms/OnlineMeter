import { Radio, Settings as SettingsIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { strings } from "@/strings";

/**
 * Persistent top navigation (FR-001). "Status Page" links to the public
 * status page (specs/017 FR-009). "Settings" links to the notification
 * channel management page (specs/018 FR-001).
 */
export function Navbar() {
  return (
    <header className="flex min-h-14 shrink-0 items-center justify-end border-b border-border/60 bg-background/80 px-4 py-2 sm:h-14 sm:px-6 sm:py-0">
      <nav className="flex min-w-0 flex-wrap items-center justify-end gap-1 text-sm sm:flex-nowrap sm:gap-2">
        <span className="flex items-center gap-1">
          <Link
            to="/status"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3"
            aria-label={strings.navbar.statusPage}
          >
            <Radio className="h-4 w-4" />
            <span className="hidden sm:inline">{strings.navbar.statusPage}</span>
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3"
            aria-label={strings.navbar.settings}
          >
            <SettingsIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{strings.navbar.settings}</span>
          </Link>
        </span>
        <ThemeToggle />
      </nav>
    </header>
  );
}
