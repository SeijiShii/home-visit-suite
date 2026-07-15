// 区域ツリー＋表示名インデックスの構築。
// ダッシュボード（アクセス可能な区域の表示名解決）と区域一覧 `/areas`
// （親番→区域の俯瞰）が共用する読み取り専用インデックス。
// 仕様: docs/wants/10_画面設計.md「5. ダッシュボード」「区域一覧 /areas」

import { areaPolygonIds } from "../domain/models/region";
import type { RegionRepository } from "../domain/repositories/region-repository";

/**
 * 区域ツリー＋表示名インデックス。
 * - displayIndex: areaId → "NRT-001-01" 形式の文字列
 * - regions / parentAreasByRegion / areasByParent: 一覧・フィルタ用
 */
export interface RegionTreeIndex {
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

export async function buildRegionTreeIndex(
  regionRepo: RegionRepository,
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
