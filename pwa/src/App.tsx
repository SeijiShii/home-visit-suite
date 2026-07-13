// PWA アプリのルーティング。
// ルート構成とロール別ナビゲーションガードは docs/wants/10_画面設計.md に従う。

import { useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useIdentity } from "./contexts/IdentityContext";
import { useServices } from "./contexts/ServicesContext";
import { TipsProvider } from "./contexts/TipsContext";
import { AreaDetailEditPageContainer } from "./pages/AreaDetailEditPageContainer";
import { CheckoutsPage } from "./pages/CheckoutsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MapPage } from "./pages/MapPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PairPage } from "./pages/PairPage";
import { RegionManagementPage } from "./pages/RegionManagementPage";
import { RequestsPage } from "./pages/RequestsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";
import { VisitPageContainer } from "./pages/VisitPageContainer";

export default function App() {
  const { settingsService } = useServices();
  const { identityReady, hasIdentity } = useIdentity();
  const [hash, setHash] = useState<string>(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // 起動時の identity 判定が済むまでは何も描画しない（オンボーディングのちらつき防止）。
  if (!identityReady) return null;
  // ペアリング URL（`#/pair?d=...`）はカメラアプリ/URL 入力からの起動。
  // 未登録端末は登録、登録済み端末は冪等スルーして通常起動へ。
  if (hash.startsWith("#/pair")) {
    return <PairPage onConsumed={() => setHash("#/")} />;
  }
  // 自分の ID が未保存なら全ルートに優先してオンボーディングへ誘導する。
  if (!hasIdentity) return <OnboardingPage />;

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
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </TipsProvider>
    </HashRouter>
  );
}
