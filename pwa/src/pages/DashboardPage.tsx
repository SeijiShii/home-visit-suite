// desktop/frontend/src/pages/DashboardPage.tsx からの移植。
// Wails Binding 依存を useServices() に置き換えた。

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InviteDialog } from "../components/InviteDialog";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity, isRoleAtLeast } from "../contexts/IdentityContext";
import { areaPolygonIds } from "../domain/models/region";
import { type AppServices, useServices } from "../contexts/ServicesContext";

/**
 * ダッシュボードに表示する1行分のアクセス可能区域。
 * checkoutService.listAccessibleAreas のレスポンスを区域表示名で enrich したもの。
 */
interface AccessibleAreaRow {
  areaId: string;
  checkoutId: string;
  role: "owner" | "invitee";
  /** ISO 文字列（被招待者のみ）。担当者行では null */
  inviteExpiresAt: string | null;
  /** `領域記号-区域親番-区域番号` 形式の表示名（解決失敗時は areaId） */
  displayName: string;
}

/**
 * 区域ツリー＋表示名インデックス。
 * - displayIndex: areaId → "NRT-001-01" 形式の文字列
 * - regions / parentAreasByRegion / areasByParent: 「全ての区域一覧」のフィルタ用
 */
interface RegionTreeIndex {
  displayIndex: Map<string, string>;
  regions: { id: string; symbol: string; name: string }[];
  parentAreasByRegion: Map<
    string,
    { id: string; number: string; name: string }[]
  >;
  areasByParent: Map<
    string,
    {
      id: string;
      number: string;
      parentAreaId: string;
      regionId: string;
      /** 紐付け済みポリゴンID群（飛地対応で複数可） */
      polygonIds: string[];
    }[]
  >;
  /** id → { regionId, parentAreaId } の逆引き（フィルタ判定用） */
  areaMeta: Map<string, { regionId: string; parentAreaId: string }>;
}

async function buildRegionTreeIndex(
  regionRepo: AppServices["regionRepo"],
): Promise<RegionTreeIndex> {
  const displayIndex = new Map<string, string>();
  const regions: RegionTreeIndex["regions"] = [];
  const parentAreasByRegion: RegionTreeIndex["parentAreasByRegion"] = new Map();
  const areasByParent: RegionTreeIndex["areasByParent"] = new Map();
  const areaMeta: RegionTreeIndex["areaMeta"] = new Map();

  const regionList = await regionRepo.listRegions();
  for (const r of regionList) {
    regions.push({ id: r.id, symbol: r.symbol, name: r.name });
    const pas = await regionRepo.listParentAreas(r.id);
    parentAreasByRegion.set(
      r.id,
      pas.map((pa) => ({ id: pa.id, number: pa.number, name: pa.name })),
    );
    for (const pa of pas) {
      const areas = await regionRepo.listAreas(pa.id);
      areasByParent.set(
        pa.id,
        areas.map((a) => ({
          id: a.id,
          number: a.number,
          parentAreaId: pa.id,
          regionId: r.id,
          polygonIds: areaPolygonIds(a),
        })),
      );
      for (const a of areas) {
        displayIndex.set(a.id, `${r.symbol}-${pa.number}-${a.number}`);
        areaMeta.set(a.id, { regionId: r.id, parentAreaId: pa.id });
      }
    }
  }
  return {
    displayIndex,
    regions,
    parentAreasByRegion,
    areasByParent,
    areaMeta,
  };
}

/**
 * 鍵アイコン（担当者表記用）。仕様 docs/wants/10_画面設計.md「ロール表記」
 */
function KeyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ verticalAlign: "middle", marginRight: 4 }}
      aria-hidden="true"
    >
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15 21 2" />
      <path d="m18 5 3 3" />
      <path d="m15 8 3 3" />
    </svg>
  );
}

/**
 * 「人＋時計」アイコン（被招待者表記用）。
 */
function PersonClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ verticalAlign: "middle", marginRight: 4 }}
      aria-hidden="true"
    >
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h6" />
      <circle cx="18" cy="17" r="4" />
      <path d="M18 15v2l1 1" />
    </svg>
  );
}

/** 「全ての区域一覧」セクションの 1 行データ */
interface AllAreaRow {
  areaId: string;
  displayName: string;
  regionId: string;
  parentAreaId: string;
  /** 現アクティブチェックアウト担当者の表示用情報（無ければ null） */
  ownerDisplay: string | null;
  /** 検索ヒットさせる対象（区域 ID, 担当者名, displayName）を結合した小文字文字列 */
  searchHaystack: string;
}

/**
 * ダッシュボード。
 * 仕様 docs/wants/10_画面設計.md「5. ダッシュボード」
 *
 * - 「アクセス可能な区域」セクション（担当 + 有効招待）
 * - 「チェックアウト可能な区域」セクション（他者のアクティブなチェックアウトが無い区域）
 * - 「全ての区域一覧」セクション（editor+ のみ）。領域・区域親番フィルタ
 *   + インクリメンタル検索。進捗バーは網羅管理 API 接続まで placeholder。
 * - 通知 / 網羅進捗サマリーは別フェーズ
 */
export function DashboardPage() {
  const { t } = useI18n();
  const { currentActorID, currentRole } = useIdentity();
  const services = useServices();
  const navigate = useNavigate();

  const isEditorPlus = isRoleAtLeast(currentRole, "editor");

  const [rows, setRows] = useState<AccessibleAreaRow[]>([]);
  const [loading, setLoading] = useState(true);
  // チェックアウト可能な区域（他者のアクティブなチェックアウトが無い区域）
  const [checkoutableAreas, setCheckoutableAreas] = useState<
    { areaId: string; displayName: string }[]
  >([]);
  const [reloadTick, setReloadTick] = useState(0);
  // 残り時間表示を 1 分ごとに更新する用途の現在時刻 tick
  const [now, setNow] = useState<number>(() => Date.now());

  // 全ての区域一覧（editor+ のみ）
  const [allAreas, setAllAreas] = useState<AllAreaRow[]>([]);
  const [allAreasLoading, setAllAreasLoading] = useState(false);
  const [regionsForFilter, setRegionsForFilter] = useState<
    RegionTreeIndex["regions"]
  >([]);
  const [parentAreasByRegionForFilter, setParentAreasByRegionForFilter] =
    useState<RegionTreeIndex["parentAreasByRegion"]>(new Map());
  const [regionFilter, setRegionFilter] = useState<string>("");
  const [parentAreaFilter, setParentAreaFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 招待発行ダイアログの開閉と対象（担当者行クリック時に設定）
  const [inviteTarget, setInviteTarget] = useState<{
    checkoutId: string;
    areaDisplay: string;
  } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!currentActorID) {
      setRows([]);
      setAllAreas([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      if (isEditorPlus) setAllAreasLoading(true);
      try {
        const [accessibleAreas, tree] = await Promise.all([
          services.checkoutService.listAccessibleAreas(currentActorID),
          buildRegionTreeIndex(services.regionRepo),
        ]);
        if (cancelled) return;

        // アクセス可能な区域
        const enriched: AccessibleAreaRow[] = accessibleAreas.map((a) => {
          const role = a.role === "invitee" ? "invitee" : "owner";
          return {
            areaId: a.areaId,
            checkoutId: a.checkoutId,
            role,
            inviteExpiresAt: role === "invitee" ? a.inviteExpiresAt : null,
            displayName: tree.displayIndex.get(a.areaId) ?? a.areaId,
          };
        });
        if (!cancelled) {
          setRows(enriched);
          setRegionsForFilter(tree.regions);
          setParentAreasByRegionForFilter(tree.parentAreasByRegion);
        }

        // 編集メンバー以上は「全ての区域一覧」も組み立てる
        if (isEditorPlus && !cancelled) {
          const allAreaList: {
            id: string;
            regionId: string;
            parentAreaId: string;
          }[] = [];
          for (const [, areas] of tree.areasByParent) {
            for (const a of areas) allAreaList.push(a);
          }
          // 各区域の active checkout と全ユーザー一覧を並列取得
          const [activeCheckouts, allUsers] = await Promise.all([
            Promise.all(
              allAreaList.map((a) =>
                services.checkoutRepo.getActiveCheckout(a.id).catch(() => null),
              ),
            ),
            services.userRepo.listUsers().catch(() => []),
          ]);
          if (cancelled) return;
          const userById = new Map<string, string>();
          for (const u of allUsers) {
            userById.set(u.id, u.name || u.id);
          }
          const composed: AllAreaRow[] = allAreaList.map((a, idx) => {
            const co = activeCheckouts[idx];
            const ownerDisplay = co
              ? (userById.get(co.personInChargeId) ?? co.personInChargeId)
              : null;
            const display = tree.displayIndex.get(a.id) ?? a.id;
            return {
              areaId: a.id,
              displayName: display,
              regionId: a.regionId,
              parentAreaId: a.parentAreaId,
              ownerDisplay,
              searchHaystack: `${display} ${ownerDisplay ?? ""}`.toLowerCase(),
            };
          });
          // 区域 displayName 昇順
          composed.sort((x, y) => x.displayName.localeCompare(y.displayName));
          if (!cancelled) {
            setAllAreas(composed);
          }
        } else if (!cancelled) {
          setAllAreas([]);
        }
      } catch (e) {
        console.error("DashboardPage fetch failed", e);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setAllAreasLoading(false);
        }
      }
    }
    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [currentActorID, isEditorPlus, reloadTick, services]);

  // チェックアウト可能な区域: 他者を含めて誰もアクティブにチェックアウトしていない全区域
  // （「チェックアウト可能期間」廃止により、期間・対象区域親番による絞り込みは持たない）
  useEffect(() => {
    if (!currentActorID) {
      setCheckoutableAreas([]);
      return;
    }
    let cancelled = false;
    async function fetchCheckoutable() {
      try {
        // 全領域配下の全区域を収集（ポリゴン未紐付けの区域はチェックアウト不可のため除外）
        const tree = await buildRegionTreeIndex(services.regionRepo);
        if (cancelled) return;
        const candidateAreas: { areaId: string; displayName: string }[] = [];
        for (const [, areas] of tree.areasByParent) {
          for (const a of areas) {
            if (a.polygonIds.length === 0) continue;
            candidateAreas.push({
              areaId: a.id,
              displayName: tree.displayIndex.get(a.id) ?? a.id,
            });
          }
        }

        // 各区域の active checkout を確認し、誰もチェックアウトしていないもののみ残す
        const activeStatuses = await Promise.all(
          candidateAreas.map((a) =>
            services.checkoutRepo.getActiveCheckout(a.areaId).catch(() => null),
          ),
        );
        if (cancelled) return;
        const filtered = candidateAreas.filter((_a, i) => !activeStatuses[i]);
        filtered.sort((x, y) => x.displayName.localeCompare(y.displayName));
        setCheckoutableAreas(filtered);
      } catch (e) {
        console.error("checkoutable areas fetch failed", e);
      }
    }
    void fetchCheckoutable();
    return () => {
      cancelled = true;
    };
  }, [currentActorID, reloadTick, services]);

  const handleCheckout = async (areaId: string) => {
    try {
      await services.checkoutService.checkout(
        currentActorID,
        areaId,
        currentActorID,
      );
      setReloadTick((t) => t + 1);
    } catch (e) {
      window.alert(String(e));
    }
  };

  // 領域フィルタ変更時、選択中の区域親番を invalidate（別領域の親番を保持しない）
  useEffect(() => {
    setParentAreaFilter("");
  }, [regionFilter]);

  // 全ての区域一覧を領域・親番・検索で絞り込む
  const filteredAllAreas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allAreas.filter((a) => {
      if (regionFilter && a.regionId !== regionFilter) return false;
      if (parentAreaFilter && a.parentAreaId !== parentAreaFilter) return false;
      if (q && !a.searchHaystack.includes(q)) return false;
      return true;
    });
  }, [allAreas, regionFilter, parentAreaFilter, searchQuery]);

  const visibleParentAreas: { id: string; number: string; name: string }[] =
    regionFilter ? (parentAreasByRegionForFilter.get(regionFilter) ?? []) : [];

  const formatRoleCell = useMemo(() => {
    return (row: AccessibleAreaRow): React.ReactNode => {
      if (row.role === "owner") {
        return (
          <span>
            <KeyIcon />
            {t.dashboard.roleOwner}
          </span>
        );
      }
      // invitee: 残り時間を表示
      if (!row.inviteExpiresAt) {
        return (
          <span>
            <PersonClockIcon />
            {t.dashboard.inviteRoleExpired}
          </span>
        );
      }
      const remainingMs = new Date(row.inviteExpiresAt).getTime() - now;
      if (remainingMs <= 0) {
        return (
          <span>
            <PersonClockIcon />
            {t.dashboard.inviteRoleExpired}
          </span>
        );
      }
      const remainingHours = Math.max(
        1,
        Math.floor(remainingMs / (1000 * 60 * 60)),
      );
      return (
        <span>
          <PersonClockIcon />
          {t.dashboard.roleInvitee(remainingHours)}
        </span>
      );
    };
  }, [t.dashboard, now]);

  const handleVisit = (areaId: string) => {
    navigate(`/visits/${areaId}`);
  };

  const handleInvite = (row: AccessibleAreaRow) => {
    setInviteTarget({
      checkoutId: row.checkoutId,
      areaDisplay: row.displayName,
    });
  };

  const handleReturn = async (row: AccessibleAreaRow) => {
    if (!window.confirm(t.dashboard.confirmReturn({ area: row.displayName }))) {
      return;
    }
    try {
      await services.checkoutService.return(currentActorID, row.checkoutId);
      setReloadTick((tick) => tick + 1);
    } catch (e) {
      window.alert(String(e));
    }
  };

  return (
    <>
      <h1>{t.dashboard.title}</h1>

      <section>
        <h2>{t.dashboard.accessibleAreas}</h2>
        <p className="dashboard-section-note">
          {t.dashboard.accessibleAreasNote}
        </p>
        {loading ? (
          <p className="dashboard-empty">{t.dashboard.loading}</p>
        ) : rows.length === 0 ? (
          <p className="dashboard-empty">{t.dashboard.noAccessibleAreas}</p>
        ) : (
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>{t.dashboard.colArea}</th>
                <th>{t.dashboard.colRole}</th>
                <th>{t.dashboard.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.checkoutId}>
                  <td className="dashboard-cell-area">{row.displayName}</td>
                  <td>{formatRoleCell(row)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleVisit(row.areaId)}
                    >
                      {t.dashboard.gotoVisit}
                    </button>
                    {row.role === "owner" && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => handleInvite(row)}
                        >
                          {t.dashboard.invite}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => void handleReturn(row)}
                        >
                          {t.dashboard.returnAction}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>{t.dashboard.checkoutableAreas}</h2>
        {checkoutableAreas.length === 0 ? (
          <p className="dashboard-empty">{t.dashboard.noCheckoutableAreas}</p>
        ) : (
          <>
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>{t.dashboard.colArea}</th>
                  <th>{t.dashboard.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {checkoutableAreas.map((a) => (
                  <tr key={a.areaId}>
                    <td className="dashboard-cell-area">{a.displayName}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void handleCheckout(a.areaId)}
                      >
                        {t.dashboard.checkoutAction}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {isEditorPlus && (
        <section>
          <h2>{t.dashboard.allAreas}</h2>
          <p className="dashboard-section-note">{t.dashboard.allAreasNote}</p>

          <div className="dashboard-filter-row">
            <select
              className="dashboard-filter-select"
              aria-label={t.dashboard.filterAllRegions}
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
            >
              <option value="">{t.dashboard.filterAllRegions}</option>
              {regionsForFilter.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.symbol} {r.name}
                </option>
              ))}
            </select>
            <select
              className="dashboard-filter-select"
              aria-label={t.dashboard.filterAllParentAreas}
              value={parentAreaFilter}
              onChange={(e) => setParentAreaFilter(e.target.value)}
              disabled={!regionFilter}
            >
              <option value="">{t.dashboard.filterAllParentAreas}</option>
              {visibleParentAreas.map((pa) => (
                <option key={pa.id} value={pa.id}>
                  {pa.number}
                  {pa.name ? ` ${pa.name}` : ""}
                </option>
              ))}
            </select>
            <input
              type="search"
              className="dashboard-filter-input"
              aria-label={t.dashboard.searchPlaceholder}
              placeholder={t.dashboard.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {allAreasLoading ? (
            <p className="dashboard-empty">{t.dashboard.loading}</p>
          ) : filteredAllAreas.length === 0 ? (
            <p className="dashboard-empty">{t.dashboard.noAreasMatch}</p>
          ) : (
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>{t.dashboard.colArea}</th>
                  <th>{t.dashboard.colOwner}</th>
                  <th>{t.dashboard.colProgress}</th>
                  <th>{t.dashboard.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAllAreas.map((row) => (
                  <tr key={row.areaId}>
                    <td className="dashboard-cell-area">{row.displayName}</td>
                    <td>
                      {row.ownerDisplay
                        ? t.dashboard.ownerLabel(row.ownerDisplay)
                        : t.dashboard.notCheckedOut}
                    </td>
                    <td className="dashboard-cell-progress">
                      {/* 進捗バー: 網羅管理 API 接続まで placeholder（仕様 06 / Q21 / Q22） */}
                      {t.dashboard.progressPlaceholder}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleVisit(row.areaId)}
                      >
                        {t.dashboard.gotoVisit}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {inviteTarget && (
        <InviteDialog
          checkoutId={inviteTarget.checkoutId}
          ownerId={currentActorID}
          areaDisplay={inviteTarget.areaDisplay}
          actorId={currentActorID}
          onClose={() => setInviteTarget(null)}
          onIssued={() => setInviteTarget(null)}
          onError={(msg) => {
            console.error("invite failed", msg);
            setInviteTarget(null);
          }}
        />
      )}
    </>
  );
}
