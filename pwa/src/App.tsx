// PWA アプリのルーティング。
// 画面は desktop/frontend/src/pages から順次移植する（未移植は PlaceholderPage）。
// ルート構成とロール別ナビゲーションガードは docs/wants/10_画面設計.md に従う。

import { HashRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { TipStack } from "./components/TipStack";
import { useI18n } from "./contexts/I18nContext";
import { useServices } from "./contexts/ServicesContext";
import { TipsProvider } from "./contexts/TipsContext";
import { CheckoutsPage } from "./pages/CheckoutsPage";
import { CoveragePage } from "./pages/CoveragePage";
import { DashboardPage } from "./pages/DashboardPage";
import { MapPage } from "./pages/MapPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RegionManagementPage } from "./pages/RegionManagementPage";
import { RequestsPage } from "./pages/RequestsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";

export default function App() {
  const { t } = useI18n();
  const { settingsService } = useServices();

  return (
    <HashRouter>
      <TipsProvider service={settingsService}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route
              path="/visits/:areaId"
              element={<PlaceholderPage title={t.visitRecord.dialogTitle} />}
            />
            <Route path="/map" element={<MapPage />} />
            <Route
              path="/map/area/:areaId/detail"
              element={<PlaceholderPage title={t.areaDetail.title} />}
            />
            <Route path="/regions" element={<RegionManagementPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/checkouts" element={<CheckoutsPage />} />
            <Route path="/coverage" element={<CoveragePage />} />
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
        <TipStack />
      </TipsProvider>
    </HashRouter>
  );
}
