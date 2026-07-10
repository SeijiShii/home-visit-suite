// PWA アプリのルーティング。
// ルート構成とロール別ナビゲーションガードは docs/wants/10_画面設計.md に従う。

import { HashRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useServices } from "./contexts/ServicesContext";
import { TipsProvider } from "./contexts/TipsContext";
import { AreaDetailEditPageContainer } from "./pages/AreaDetailEditPageContainer";
import { CheckoutsPage } from "./pages/CheckoutsPage";
import { CoveragePage } from "./pages/CoveragePage";
import { DashboardPage } from "./pages/DashboardPage";
import { MapPage } from "./pages/MapPage";
import { RegionManagementPage } from "./pages/RegionManagementPage";
import { RequestsPage } from "./pages/RequestsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";
import { VisitPageContainer } from "./pages/VisitPageContainer";

export default function App() {
  const { settingsService } = useServices();

  return (
    <HashRouter>
      <TipsProvider service={settingsService}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/visits/:areaId" element={<VisitPageContainer />} />
            <Route path="/map" element={<MapPage />} />
            <Route
              path="/map/area/:areaId/detail"
              element={<AreaDetailEditPageContainer />}
            />
            <Route path="/regions" element={<RegionManagementPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/checkouts" element={<CheckoutsPage />} />
            <Route path="/coverage" element={<CoveragePage />} />
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </TipsProvider>
    </HashRouter>
  );
}
