import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/pages/dashboard";
import { MonitorDetailPage } from "@/pages/monitor-detail";
import { StatusPage } from "@/pages/status";
import { SettingsPage } from "@/pages/settings";
import { DashboardsPage } from "@/pages/dashboards";
import { DashboardDetailPage } from "@/pages/dashboard-detail";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/monitors/:id" element={<MonitorDetailPage />} />
        <Route path="/dashboards" element={<DashboardsPage />} />
        <Route path="/dashboards/:id" element={<DashboardDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      {/* Standalone, unauthenticated route (specs/017) — no AppShell/Sidebar. */}
      <Route path="/status" element={<StatusPage />} />
    </Routes>
  );
}
