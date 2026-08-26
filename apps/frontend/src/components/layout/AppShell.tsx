import { Outlet } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";

/**
 * Persistent app shell (FR-001, FR-002): navbar on top, sidebar + content
 * below. Wraps every page via a layout route so neither remounts on
 * navigation between the dashboard and a monitor's detail view.
 */
export function AppShell() {
  return (
    <div className="flex h-screen min-h-0 w-full flex-col overflow-hidden bg-background lg:flex-row">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <Navbar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
