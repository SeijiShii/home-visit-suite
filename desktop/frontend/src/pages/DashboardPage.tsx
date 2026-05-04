import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import * as CheckoutBinding from "../../wailsjs/go/binding/CheckoutBinding";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";

/**
 * ダッシュボードに表示する1行分のアクセス可能区域。
 * CheckoutBinding.ListAccessibleAreas のレスポンスを区域表示名で enrich したもの。
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
 * 区域 ID から「領域記号-区域親番-区域番号」形式の表示名を解決するためのインデックス。
 * RegionBinding.ListRegions / ListParentAreas / ListAreas を辿って構築する。
 */
type AreaDisplayIndex = Map<string, string>;

async function buildAreaDisplayIndex(): Promise<AreaDisplayIndex> {
  const map: AreaDisplayIndex = new Map();
  const regions = (await RegionBinding.ListRegions()) ?? [];
  for (const r of regions) {
    const pas = (await RegionBinding.ListParentAreas(r.id)) ?? [];
    for (const pa of pas) {
      const areas = (await RegionBinding.ListAreas(pa.id)) ?? [];
      for (const a of areas) {
        map.set(a.id, `${r.symbol}-${pa.number}-${a.number}`);
      }
    }
  }
  return map;
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

/**
 * ダッシュボード。
 * 仕様 docs/wants/10_画面設計.md「5. ダッシュボード」
 *
 * Phase G3:
 *   - 「アクセス可能な区域」セクションを実装（担当 + 有効招待）
 *   - 「全ての区域一覧」（editor+）は Phase G4
 *   - 通知 / 網羅進捗サマリーは別フェーズ
 *   - 「招待」ボタンの発行ダイアログは Phase G6（現状はプレースホルダー）
 */
export function DashboardPage() {
  const { t } = useI18n();
  const { currentActorID } = useIdentity();
  const navigate = useNavigate();

  const [rows, setRows] = useState<AccessibleAreaRow[]>([]);
  const [loading, setLoading] = useState(true);
  // 残り時間表示を 1 分ごとに更新する用途の現在時刻 tick
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!currentActorID) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchAccessibleAreas() {
      setLoading(true);
      try {
        const [accessibleAreas, displayIndex] = await Promise.all([
          CheckoutBinding.ListAccessibleAreas(currentActorID),
          buildAreaDisplayIndex(),
        ]);
        if (cancelled) return;
        const enriched: AccessibleAreaRow[] = (accessibleAreas ?? []).map(
          (a) => {
            const role = a.role === "invitee" ? "invitee" : "owner";
            // Wails の time.Time は JSON 上は ISO 文字列。型は struct 風だが
            // ランタイムでは文字列として届くので、String 化してから ISO に正規化する。
            const inviteExpiresAtISO =
              role === "invitee" && a.inviteExpiresAt
                ? new Date(String(a.inviteExpiresAt)).toISOString()
                : null;
            return {
              areaId: a.areaId,
              checkoutId: a.checkoutId,
              role,
              inviteExpiresAt: inviteExpiresAtISO,
              displayName: displayIndex.get(a.areaId) ?? a.areaId,
            };
          },
        );
        if (!cancelled) {
          setRows(enriched);
        }
      } catch (e) {
        console.error("DashboardPage fetch failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchAccessibleAreas();
    return () => {
      cancelled = true;
    };
  }, [currentActorID]);

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

  const handleInvite = () => {
    // 招待発行ダイアログは Phase G6 で実装。当面はプレースホルダー。
    // eslint-disable-next-line no-alert
    window.alert(t.dashboard.invitePending);
  };

  return (
    <>
      <h1>{t.dashboard.title}</h1>

      <section>
        <h2>{t.dashboard.accessibleAreas}</h2>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>
          {t.dashboard.accessibleAreasNote}
        </p>
        {loading ? (
          <p>{t.dashboard.loading}</p>
        ) : rows.length === 0 ? (
          <p>{t.dashboard.noAccessibleAreas}</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              maxWidth: 720,
            }}
          >
            <thead>
              <tr
                style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}
              >
                <th style={{ padding: "8px" }}>{t.dashboard.colArea}</th>
                <th style={{ padding: "8px" }}>{t.dashboard.colRole}</th>
                <th style={{ padding: "8px" }}>{t.dashboard.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.checkoutId}
                  style={{ borderBottom: "1px solid #f1f5f9" }}
                >
                  <td style={{ padding: "8px", fontFamily: "monospace" }}>
                    {row.displayName}
                  </td>
                  <td style={{ padding: "8px" }}>{formatRoleCell(row)}</td>
                  <td style={{ padding: "8px" }}>
                    <button
                      type="button"
                      onClick={() => handleVisit(row.areaId)}
                      style={{ marginRight: 6 }}
                    >
                      {t.dashboard.gotoVisit}
                    </button>
                    {row.role === "owner" && (
                      <button type="button" onClick={handleInvite}>
                        {t.dashboard.invite}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
