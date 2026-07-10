// ドメインリポジトリの localStorage 永続化テスト（代表として RegionRepository）。
// storagePrefix 指定時は別インスタンス（再読み込み相当）で保持され、
// 未指定（テスト既定）は永続化しないことを検証する。

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryRegionRepository } from "../inmemory/inmemory-region-repository";
import type { Region } from "../../domain/models/region";

function region(id: string, name: string): Region {
  return {
    id,
    name,
    symbol: "NRT",
    approved: true,
    geometry: null,
    order: 0,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("RegionRepository の永続化", () => {
  it("storagePrefix 指定時は別インスタンスでも領域が保持される", async () => {
    const a = new InMemoryRegionRepository("hvs:region");
    await a.saveRegion(region("r1", "成田市"));

    const b = new InMemoryRegionRepository("hvs:region");
    const got = await b.getRegion("r1");
    expect(got?.name).toBe("成田市");
  });

  it("論理削除（deletedAt 付与）も別インスタンスへ永続化される", async () => {
    const a = new InMemoryRegionRepository("hvs:region");
    await a.saveRegion(region("r1", "成田市"));
    await a.deleteRegion("r1");

    const b = new InMemoryRegionRepository("hvs:region");
    // フィルタ付き取得では見えない
    expect(await b.getRegion("r1")).toBeNull();
    // raw では deletedAt が付いた状態で残る（in-place 変更も write-through される）
    const raw = await b.getRegionRaw("r1");
    expect(raw?.deletedAt).toBeTruthy();
  });

  it("物理削除（removeRegion）も永続化される", async () => {
    const a = new InMemoryRegionRepository("hvs:region");
    await a.saveRegion(region("r1", "成田市"));
    await a.removeRegion("r1");

    const b = new InMemoryRegionRepository("hvs:region");
    expect(await b.getRegionRaw("r1")).toBeNull();
  });

  it("storagePrefix 未指定（テスト既定）は永続化しない", async () => {
    const a = new InMemoryRegionRepository();
    await a.saveRegion(region("r1", "成田市"));

    const b = new InMemoryRegionRepository();
    expect(await b.getRegion("r1")).toBeNull();
    // localStorage も汚さない
    expect(localStorage.length).toBe(0);
  });
});
