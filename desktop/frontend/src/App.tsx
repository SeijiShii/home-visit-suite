import { useMemo } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { I18nProvider } from "./contexts/I18nContext";
import { TipsProvider } from "./contexts/TipsContext";
import { Layout } from "./components/Layout";
import { TipStack } from "./components/TipStack";
import { DashboardPage } from "./pages/DashboardPage";
import { MapPage } from "./pages/MapPage";
import { AreaDetailEditPage } from "./pages/AreaDetailEditPage";
import { UsersPage } from "./pages/UsersPage";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { CoveragePage } from "./pages/CoveragePage";
import { RequestsPage } from "./pages/RequestsPage";
import { RegionManagementPage } from "./pages/RegionManagementPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SettingsService } from "./services/settings-service";
import * as SettingsBinding from "../wailsjs/go/binding/SettingsBinding";

export function App() {
  const settingsService = useMemo(
    () => new SettingsService(SettingsBinding),
    [],
  );

  return (
    <HashRouter>
      <I18nProvider service={settingsService}>
        <TipsProvider service={settingsService}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="map" element={<MapPage />} />
              <Route
                path="map/area/:areaId/detail"
                element={<AreaDetailEditPage />}
              />
              <Route path="regions" element={<RegionManagementPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="activities" element={<ActivitiesPage />} />
              <Route path="coverage" element={<CoveragePage />} />
              <Route path="requests" element={<RequestsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
          <TipStack />
        </TipsProvider>
      </I18nProvider>
    </HashRouter>
  );
}
