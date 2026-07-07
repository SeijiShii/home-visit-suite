// RegionBindingAPI（region-service が要求する抽象）を RegionRepository 上に実装する。
// 旧 Wails RegionBinding（desktop/internal/binding/region.go）の
// SetParentAreaCount / UpdateRegion / ReorderRegions / Restore* / BindPolygon*
// のロジックを移植している。

import type { Area, ParentArea, Region } from "../domain/models/region";
import type { RegionRepository } from "../domain/repositories/region-repository";
import type { RegionBindingAPI } from "./region-service";
import { ServiceError } from "./errors";

export class RegionRepositoryBindingAdapter implements RegionBindingAPI {
  constructor(private repo: RegionRepository) {}

  async ListRegions(): Promise<Region[]> {
    const regions = await this.repo.listRegions();
    return [...regions].sort((a, b) => a.order - b.order);
  }

  async SaveRegion(region: Region): Promise<void> {
    await this.repo.saveRegion(region);
  }

  async DeleteRegion(id: string): Promise<void> {
    await this.repo.deleteRegion(id);
  }

  async RestoreRegion(id: string): Promise<void> {
    const r = await this.repo.getRegionRaw(id);
    if (!r) throw new ServiceError("not_found", `region not found: ${id}`);
    const { deletedAt: _deletedAt, ...rest } = r;
    await this.repo.saveRegion(rest);
  }

  // 領域の名前・記号を更新する。記号が変わった場合、配下の ParentArea・Area の
  // ID を連鎖更新する（子 → 親の順、参照整合性のため）。
  async UpdateRegion(id: string, name: string, newSymbol: string): Promise<void> {
    const r = await this.repo.getRegion(id);
    if (!r) throw new ServiceError("not_found", `region not found: ${id}`);
    const oldSymbol = r.symbol;

    // 記号が変わらない場合は名前のみ更新
    if (oldSymbol === newSymbol) {
      await this.repo.saveRegion({ ...r, name });
      return;
    }

    const parentAreas = await this.repo.listParentAreas(id);

    // 1. Area: 旧ID削除 → 新ID保存
    for (const pa of parentAreas) {
      const areas = await this.repo.listAreas(pa.id);
      const newPaId = newSymbol + pa.id.slice(oldSymbol.length);
      for (const a of areas) {
        const newAreaId = newSymbol + a.id.slice(oldSymbol.length);
        await this.repo.removeArea(a.id);
        await this.repo.saveArea({ ...a, id: newAreaId, parentAreaId: newPaId });
      }
    }

    // 2. ParentArea: 旧ID削除 → 新ID保存
    for (const pa of parentAreas) {
      const newPaId = newSymbol + pa.id.slice(oldSymbol.length);
      await this.repo.removeParentArea(pa.id);
      await this.repo.saveParentArea({ ...pa, id: newPaId, regionId: newSymbol });
    }

    // 3. Region: 旧ID削除 → 新ID保存
    await this.repo.removeRegion(id);
    await this.repo.saveRegion({ ...r, id: newSymbol, symbol: newSymbol, name });
  }

  async ListParentAreas(regionId: string): Promise<ParentArea[]> {
    return this.repo.listParentAreas(regionId);
  }

  async GetParentArea(id: string): Promise<ParentArea> {
    const pa = await this.repo.getParentArea(id);
    if (!pa) throw new ServiceError("not_found", `parent area not found: ${id}`);
    return pa;
  }

  async DeleteParentArea(id: string): Promise<void> {
    await this.repo.deleteParentArea(id);
  }

  async RestoreParentArea(id: string): Promise<void> {
    const pa = await this.repo.getParentAreaRaw(id);
    if (!pa) throw new ServiceError("not_found", `parent area not found: ${id}`);
    const { deletedAt: _deletedAt, ...rest } = pa;
    await this.repo.saveParentArea(rest);
  }

  async SaveParentArea(pa: ParentArea): Promise<void> {
    await this.repo.saveParentArea(pa);
  }

  async ListAreas(parentAreaId: string): Promise<Area[]> {
    return this.repo.listAreas(parentAreaId);
  }

  async SaveArea(area: Area): Promise<void> {
    await this.repo.saveArea(area);
  }

  async DeleteArea(id: string): Promise<void> {
    await this.repo.deleteArea(id);
  }

  async RestoreArea(id: string): Promise<void> {
    const a = await this.repo.getAreaRaw(id);
    if (!a) throw new ServiceError("not_found", `area not found: ${id}`);
    const { deletedAt: _deletedAt, ...rest } = a;
    await this.repo.saveArea(rest);
  }

  // 領域の表示順を更新する。ids は新しい順序の ID 配列。
  async ReorderRegions(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i++) {
      const r = await this.repo.getRegionRaw(ids[i]);
      if (!r) throw new ServiceError("not_found", `region not found: ${ids[i]}`);
      await this.repo.saveRegion({ ...r, order: i });
    }
  }

  // 領域配下の区域親番数を count に合わせる（増加は連番作成、減少は番号大きい順に削除）。
  async SetParentAreaCount(regionId: string, count: number): Promise<void> {
    if (count < 0) {
      throw new ServiceError("invalid_input", `count must be >= 0, got ${count}`);
    }
    if (!(await this.repo.getRegion(regionId))) {
      throw new ServiceError("not_found", `region not found: ${regionId}`);
    }

    const current = await this.repo.listParentAreas(regionId);
    if (current.length === count) return;

    if (count > current.length) {
      // 増加: 最大番号の次から連番で作成
      let maxNum = 0;
      for (const pa of current) {
        const n = parseInt(pa.number, 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
      for (let i = maxNum + 1; i <= maxNum + (count - current.length); i++) {
        const number = String(i).padStart(3, "0");
        const id = `${regionId}-${number}`;
        await this.repo.saveParentArea({
          id,
          regionId,
          number,
          name: "",
          geometry: null,
        });
      }
      return;
    }

    // 減少: 番号が大きい順に削除
    const sorted = [...current].sort((a, b) => b.number.localeCompare(a.number));
    const toDelete = current.length - count;
    for (let i = 0; i < toDelete; i++) {
      const pa = sorted[i];
      const areas = await this.repo.listAreas(pa.id);
      for (const area of areas) {
        // ポリゴン紐づき解除
        if (area.polygonId) {
          const { polygonId: _polygonId, ...rest } = area;
          await this.repo.saveArea(rest);
        }
        await this.repo.deleteArea(area.id);
      }
      await this.repo.deleteParentArea(pa.id);
    }
  }

  async BindPolygonToArea(areaId: string, polygonId: string): Promise<void> {
    const a = await this.repo.getAreaRaw(areaId);
    if (!a) throw new ServiceError("not_found", `area not found: ${areaId}`);
    await this.repo.saveArea({ ...a, polygonId });
  }

  async UnbindPolygonFromArea(areaId: string): Promise<void> {
    const a = await this.repo.getAreaRaw(areaId);
    if (!a) throw new ServiceError("not_found", `area not found: ${areaId}`);
    const { polygonId: _polygonId, ...rest } = a;
    await this.repo.saveArea(rest);
  }
}
