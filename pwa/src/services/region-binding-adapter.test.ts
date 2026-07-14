// 区域⇔ポリゴン紐付けの複数化（飛地対応）: 追加紐付け・個別解除・一括解除・旧形式移行。
// 仕様: docs/wants/03_地図機能.md「ポリゴン一覧での区域紐付け・紐付け解除」

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryRegionRepository } from "../data/inmemory/inmemory-region-repository";
import { RegionRepositoryBindingAdapter } from "./region-binding-adapter";
import { areaPolygonIds } from "../domain/models/region";

describe("RegionRepositoryBindingAdapter のポリゴン紐付け（飛地対応）", () => {
  let repo: InMemoryRegionRepository;
  let adapter: RegionRepositoryBindingAdapter;

  beforeEach(async () => {
    repo = new InMemoryRegionRepository();
    adapter = new RegionRepositoryBindingAdapter(repo);
    await repo.saveArea({
      id: "NRT-001-05",
      parentAreaId: "NRT-001",
      number: "05",
      geometry: null,
    });
  });

  it("BindPolygonToArea は複数回呼ぶとポリゴンを追加紐付けする", async () => {
    await adapter.BindPolygonToArea("NRT-001-05", "poly-1");
    await adapter.BindPolygonToArea("NRT-001-05", "poly-2");
    const a = await repo.getAreaRaw("NRT-001-05");
    expect(areaPolygonIds(a!)).toEqual(["poly-1", "poly-2"]);
  });

  it("同じポリゴンの二重紐付けは冪等（重複しない）", async () => {
    await adapter.BindPolygonToArea("NRT-001-05", "poly-1");
    await adapter.BindPolygonToArea("NRT-001-05", "poly-1");
    const a = await repo.getAreaRaw("NRT-001-05");
    expect(areaPolygonIds(a!)).toEqual(["poly-1"]);
  });

  it("UnbindPolygonFromArea に polygonId を渡すと当該ポリゴンだけ解除する", async () => {
    await adapter.BindPolygonToArea("NRT-001-05", "poly-1");
    await adapter.BindPolygonToArea("NRT-001-05", "poly-2");
    await adapter.UnbindPolygonFromArea("NRT-001-05", "poly-1");
    const a = await repo.getAreaRaw("NRT-001-05");
    expect(areaPolygonIds(a!)).toEqual(["poly-2"]);
  });

  it("UnbindPolygonFromArea を polygonId 省略で呼ぶと全ポリゴンを一括解除する", async () => {
    await adapter.BindPolygonToArea("NRT-001-05", "poly-1");
    await adapter.BindPolygonToArea("NRT-001-05", "poly-2");
    await adapter.UnbindPolygonFromArea("NRT-001-05");
    const a = await repo.getAreaRaw("NRT-001-05");
    expect(areaPolygonIds(a!)).toEqual([]);
  });

  it("旧形式（単一 polygonId）に追加紐付けすると配列へ移行される", async () => {
    await repo.saveArea({
      id: "NRT-001-06",
      parentAreaId: "NRT-001",
      number: "06",
      polygonId: "poly-legacy",
      geometry: null,
    });
    await adapter.BindPolygonToArea("NRT-001-06", "poly-new");
    const a = await repo.getAreaRaw("NRT-001-06");
    expect(areaPolygonIds(a!)).toEqual(["poly-legacy", "poly-new"]);
    // 旧フィールドは書き込み時に除去され二重管理しない
    expect(a!.polygonId).toBeUndefined();
  });

  it("旧形式（単一 polygonId）を個別解除できる", async () => {
    await repo.saveArea({
      id: "NRT-001-07",
      parentAreaId: "NRT-001",
      number: "07",
      polygonId: "poly-legacy",
      geometry: null,
    });
    await adapter.UnbindPolygonFromArea("NRT-001-07", "poly-legacy");
    const a = await repo.getAreaRaw("NRT-001-07");
    expect(areaPolygonIds(a!)).toEqual([]);
    expect(a!.polygonId).toBeUndefined();
  });
});
