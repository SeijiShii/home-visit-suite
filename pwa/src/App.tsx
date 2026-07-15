// PWA アプリのルーティング。
// ルート構成とロール別ナビゲーションガードは docs/wants/10_画面設計.md に従う。

import { useEffect, useState } from "react";
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import { Layout } from "./components/Layout";
import { useIdentity } from "./contexts/IdentityContext";
import { useServices } from "./contexts/ServicesContext";
import {
  ASYNC_JOIN_EVENT,
  consumeAsyncJoinResult,
  type AsyncJoinResult,
} from "./lib/linkself/group-network";
import { TipsProvider } from "./contexts/TipsContext";
import { CheckoutsPage } from "./pages/CheckoutsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MapPage } from "./pages/MapPage";
import { JoinPage } from "./pages/JoinPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PairPage } from "./pages/PairPage";
import { RegionManagementPage } from "./pages/RegionManagementPage";
import { RequestsPage } from "./pages/RequestsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";
import { VisitPageContainer } from "./pages/VisitPageContainer";

/** 旧・区域詳細編集 URL を訪問記録画面へリダイレクトする（ブックマーク救済）。 */
function RedirectAreaDetailToVisits() {
  const { areaId = "" } = useParams<{ areaId: string }>();
  return <Navigate to={`/visits/${areaId}`} replace />;
}

export default function App() {
  const { settingsService } = useServices();
  const { identityReady, hasIdentity, adoptRole } = useIdentity();
  const [hash, setHash] = useState<string>(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // 非同期参加の成立時に招待ロールを自ロールへ採用する（docs/wants/04）。
  // 結果が届いた瞬間（イベント）と、届いたとき JoinPage/タブが閉じていた場合の
  // 持ち越し（起動時の未消費結果）の両方を拾う。JoinPage は表示遷移のみ担う。
  useEffect(() => {
    const apply = (result: AsyncJoinResult | null) => {
      if (result?.ok && result.role) {
        void adoptRole(result.role);
      }
    };
    apply(consumeAsyncJoinResult());
    const onDecision = () => apply(consumeAsyncJoinResult());
    window.addEventListener(ASYNC_JOIN_EVENT, onDecision);
    return () => window.removeEventListener(ASYNC_JOIN_EVENT, onDecision);
  }, [adoptRole]);

  // 起動時の identity 判定が済むまでは何も描画しない（オンボーディングのちらつき防止）。
  if (!identityReady) return null;
  // ペアリング URL（`#/pair?d=...`）はカメラアプリ/URL 入力からの起動。
  // 未登録端末は登録、登録済み端末は冪等スルーして通常起動へ。
  if (hash.startsWith("#/pair")) {
    return <PairPage onConsumed={() => setHash("#/")} />;
  }
  // グループ招待 URL（`#/join?i=...`）。別ユーザーが招待を受けて参加する。
  // ID 未作成なら JoinPage 内で「まず ID を作成」へ誘導する。
  if (hash.startsWith("#/join")) {
    return (
      <JoinPage
        onConsumed={() => {
          // 参加成立でアクティブスロット/networkId が変わり得るため、再読み込みで
          // LinkSelf の配線（同期スコープ・グループ DB）を向け直す。追加参加
          // （既所属からの別グループ参加）では新スロットへの切替がここで効く。
          window.location.hash = "#/";
          window.location.reload();
        }}
      />
    );
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
            {/* 旧 /map/area/:areaId/detail（区域詳細編集）は 2026-07-14 廃止。
                場所編集は訪問記録画面 /visits/:areaId が兼ねる（docs/wants/03）。 */}
            <Route
              path="/map/area/:areaId/detail"
              element={<RedirectAreaDetailToVisits />}
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
