// 申請管理 /requests。仕様 docs/wants/07_通知と申請.md「申請一覧」:
// 全区域の申請を単一リスト＋ステータスバッジで表示し、ステータス（初期=未処理のみ）・
// 区域ID/区域名・申請日/処理日の期間で絞り込む。行内操作でステータスを変更できる。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { useServices } from "../contexts/ServicesContext";
import type {
  Request,
  RequestStatus,
  RequestType,
} from "../domain/models/request";
import { useSharedApplied } from "../hooks/useSharedApplied";
import {
  AREA_TREE_TABLES,
  REQUEST_TABLES,
} from "../lib/linkself/shared-events";
import {
  buildRegionTreeIndex,
  type RegionTreeIndex,
} from "../lib/region-tree-index";

const STATUSES: readonly RequestStatus[] = ["pending", "on_hold", "resolved"];

/** ISO 日時 → ローカル日付（YYYY-MM-DD）。期間絞り込みは表示と同じローカル日付で判定する。 */
function localDateStr(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(iso: string): string {
  return localDateStr(iso).replaceAll("-", "/");
}

export function RequestsPage() {
  const { t } = useI18n();
  const r = t.requests;
  const services = useServices();
  const { currentActorID } = useIdentity();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<Request[] | null>(null);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [tree, setTree] = useState<RegionTreeIndex | null>(null);

  // フィルタ。初期表示は未処理のみ（docs/wants/07「申請一覧」）
  const [statusFilter, setStatusFilter] = useState<Set<RequestStatus>>(
    () => new Set(["pending"]),
  );
  const [search, setSearch] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [resolvedFrom, setResolvedFrom] = useState("");
  const [resolvedTo, setResolvedTo] = useState("");

  const reload = useCallback(() => {
    void (async () => {
      try {
        const [reqs, users, index] = await Promise.all([
          services.notificationRepo.listAllRequests(),
          services.userRepo.listUsers(),
          buildRegionTreeIndex(services.regionRepo),
        ]);
        setRequests(
          [...reqs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
        setUserNames(new Map(users.map((u) => [u.id, u.name])));
        setTree(index);
      } catch (e) {
        console.error("[RequestsPage] load failed", e);
      }
    })();
  }, [services]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 受信同期の自動反映（requests に加え、申請者名・区域ラベルの元データも購読）
  useSharedApplied([...REQUEST_TABLES, "users", ...AREA_TREE_TABLES], reload);

  // areaId → 検索対象文字列（区域識別子 + 領域名 + 親番名、小文字化済み）
  const areaSearchText = useMemo(() => {
    const m = new Map<string, string>();
    if (!tree) return m;
    const regionNames = new Map(tree.regions.map((rg) => [rg.id, rg.name]));
    const parentAreaNames = new Map<string, string>();
    for (const pas of tree.parentAreasByRegion.values()) {
      for (const pa of pas) parentAreaNames.set(pa.id, pa.name);
    }
    for (const [areaId, label] of tree.displayIndex) {
      const meta = tree.areaMeta.get(areaId);
      const parts = [
        label,
        meta ? (regionNames.get(meta.regionId) ?? "") : "",
        meta ? (parentAreaNames.get(meta.parentAreaId) ?? "") : "",
      ];
      m.set(areaId, parts.join(" ").toLowerCase());
    }
    return m;
  }, [tree]);

  const filtered = useMemo(() => {
    if (!requests) return [];
    const q = search.trim().toLowerCase();
    return requests.filter((req) => {
      if (!statusFilter.has(req.status)) return false;
      if (q) {
        const hay = areaSearchText.get(req.areaId) ?? req.areaId.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const created = localDateStr(req.createdAt);
      if (createdFrom && created < createdFrom) return false;
      if (createdTo && created > createdTo) return false;
      if (resolvedFrom || resolvedTo) {
        if (!req.resolvedAt) return false;
        const resolved = localDateStr(req.resolvedAt);
        if (resolvedFrom && resolved < resolvedFrom) return false;
        if (resolvedTo && resolved > resolvedTo) return false;
      }
      return true;
    });
  }, [
    requests,
    statusFilter,
    search,
    createdFrom,
    createdTo,
    resolvedFrom,
    resolvedTo,
    areaSearchText,
  ]);

  const statusLabel = (s: RequestStatus): string => {
    switch (s) {
      case "pending":
        return r.statusPending;
      case "on_hold":
        return r.statusOnHold;
      case "resolved":
        return r.statusResolved;
    }
  };

  const setStatusLabel = (s: RequestStatus): string => {
    switch (s) {
      case "pending":
        return r.setPending;
      case "on_hold":
        return r.setOnHold;
      case "resolved":
        return r.setResolved;
    }
  };

  const typeLabel = (ty: RequestType): string => {
    switch (ty) {
      case "place_delete":
        return r.types.placeDelete;
      case "place_move":
        return r.types.placeMove;
      case "place_info_modify":
        return r.types.placeInfoModify;
      case "map_update":
        return r.types.mapUpdate;
      case "do_not_visit":
        return r.types.doNotVisit;
    }
  };

  const toggleStatus = (s: RequestStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  // ステータス変更。処理済みで resolvedAt/resolvedBy を記録し、戻すと消去する
  const changeStatus = async (req: Request, status: RequestStatus) => {
    const updated: Request = {
      ...req,
      status,
      resolvedAt: status === "resolved" ? new Date().toISOString() : null,
      resolvedBy: status === "resolved" ? currentActorID : "",
    };
    try {
      await services.notificationRepo.saveRequest(updated);
    } catch (e) {
      console.error("[RequestsPage] saveRequest failed", e);
    }
    reload();
  };

  // 申請対象の訪問記録画面へ遷移（placeId 保持時は場所を選択状態で開く。
  // docs/wants/07「申請一覧 / 申請対象への遷移」）
  const openVisitPage = async (req: Request) => {
    let placeId = req.placeId;
    if (placeId) {
      try {
        // 部屋はマーカー・場所一覧の行を持たないため、親の集合住宅に読み替える
        const place = await services.placeService.getPlace(placeId);
        if (place?.type === "room" && place.parentId) {
          placeId = place.parentId;
        }
      } catch (e) {
        console.error("[RequestsPage] getPlace failed", e);
      }
    }
    const search = placeId ? `?place=${encodeURIComponent(placeId)}` : "";
    navigate(`/visits/${encodeURIComponent(req.areaId)}${search}`);
  };

  return (
    <>
      <h1>{r.title}</h1>

      <div className="requests-filters">
        <input
          type="search"
          className="requests-search-input"
          aria-label={r.searchPlaceholder}
          placeholder={r.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div
          className="requests-status-filter"
          role="group"
          aria-label={r.statusLabel}
        >
          <span className="requests-filter-label">{r.statusLabel}</span>
          {STATUSES.map((s) => (
            <label key={s} className="requests-status-option">
              <input
                type="checkbox"
                checked={statusFilter.has(s)}
                onChange={() => toggleStatus(s)}
              />
              {statusLabel(s)}
            </label>
          ))}
        </div>
        <div className="requests-date-filters">
          <div className="requests-date-filter">
            <span className="requests-filter-label">{r.createdDateLabel}</span>
            <input
              type="date"
              aria-label={r.createdFromLabel}
              value={createdFrom}
              onChange={(e) => setCreatedFrom(e.target.value)}
            />
            <span>{r.dateRangeSeparator}</span>
            <input
              type="date"
              aria-label={r.createdToLabel}
              value={createdTo}
              onChange={(e) => setCreatedTo(e.target.value)}
            />
          </div>
          <div className="requests-date-filter">
            <span className="requests-filter-label">{r.resolvedDateLabel}</span>
            <input
              type="date"
              aria-label={r.resolvedFromLabel}
              value={resolvedFrom}
              onChange={(e) => setResolvedFrom(e.target.value)}
            />
            <span>{r.dateRangeSeparator}</span>
            <input
              type="date"
              aria-label={r.resolvedToLabel}
              value={resolvedTo}
              onChange={(e) => setResolvedTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {requests === null ? (
        <p className="requests-empty">{r.loading}</p>
      ) : requests.length === 0 ? (
        <p className="requests-empty">{r.empty}</p>
      ) : filtered.length === 0 ? (
        <p className="requests-empty">{r.noMatch}</p>
      ) : (
        <ul className="requests-list" role="list">
          {filtered.map((req) => (
            <li key={req.id} className="requests-row" data-testid="request-row">
              <div className="requests-row-head">
                <span className="requests-type">{typeLabel(req.type)}</span>
                <span className="requests-area">
                  {tree?.displayIndex.get(req.areaId) ?? req.areaId}
                </span>
                <span className="requests-submitter">
                  {userNames.get(req.submitterId) ?? req.submitterId}
                </span>
                <span className="requests-date">
                  {formatDate(req.createdAt)}
                </span>
                <span
                  data-testid="request-status-badge"
                  className={`requests-status-badge requests-status-${req.status}`}
                >
                  {statusLabel(req.status)}
                </span>
              </div>
              {req.description && (
                <p className="requests-description">{req.description}</p>
              )}
              <div className="requests-row-footer">
                {req.resolvedAt && (
                  <span className="requests-resolved-at">
                    {r.resolvedDateLabel} {formatDate(req.resolvedAt)}
                  </span>
                )}
                <div className="requests-row-actions">
                  {req.areaId && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void openVisitPage(req)}
                    >
                      {r.openVisitPage}
                    </button>
                  )}
                  {STATUSES.filter((s) => s !== req.status).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void changeStatus(req, s)}
                    >
                      {setStatusLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
