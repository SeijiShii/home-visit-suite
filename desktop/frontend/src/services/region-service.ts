import { models } from "../../wailsjs/go/models";
import type { DeleteCommand, DeleteEntry } from "./command-history";

// RegionBinding API（Wails自動生成の関数群に対応）
export interface RegionBindingAPI {
  ListRegions(): Promise<models.Region[]>;
  SaveRegion(region: models.Region): Promise<void>;
  DeleteRegion(id: string): Promise<void>;
  RestoreRegion(id: string): Promise<void>;
  UpdateRegion(id: string, name: string, symbol: string): Promise<void>;
  ListParentAreas(regionID: string): Promise<models.ParentArea[]>;
  GetParentArea(id: string): Promise<models.ParentArea>;
  DeleteParentArea(id: string): Promise<void>;
  RestoreParentArea(id: string): Promise<void>;
  SaveParentArea(pa: models.ParentArea): Promise<void>;
  ListAreas(parentAreaID: string): Promise<models.Area[]>;
  SaveArea(area: models.Area): Promise<void>;
  DeleteArea(id: string): Promise<void>;
  RestoreArea(id: string): Promise<void>;
  ReorderRegions(ids: string[]): Promise<void>;
  SetParentAreaCount(regionId: string, count: number): Promise<void>;
  BindPolygonToArea(areaId: string, polygonId: string): Promise<void>;
  UnbindPolygonFromArea(areaId: string): Promise<void>;
}

// ツリー表示用の型
export interface AreaTreeNode {
  id: string;
  name: string;
  symbol: string;
  parentAreas: {
    id: string;
    number: string;
    name: string;
    areas: {
      id: string;
      number: string;
      polygonId?: string;
    }[];
  }[];
}

// フロントエンド向けサービス
export class RegionService {
  constructor(private readonly api: RegionBindingAPI) {}

  async loadTree(): Promise<AreaTreeNode[]> {
    const regions = await this.api.ListRegions();
    const tree: AreaTreeNode[] = [];

    for (const region of regions ?? []) {
      const parentAreas = (await this.api.ListParentAreas(region.id)) ?? [];
      const parentNodes = [];

      for (const pa of parentAreas) {
        const areas = (await this.api.ListAreas(pa.id)) ?? [];
        parentNodes.push({
          id: pa.id,
          number: pa.number,
          name: pa.name,
          areas: areas
            .map((a) => ({
              id: a.id,
              number: a.number,
              ...(a.polygonId ? { polygonId: a.polygonId } : {}),
            }))
            .sort((a, b) => a.number.localeCompare(b.number)),
        });
      }

      parentNodes.sort((a, b) => a.number.localeCompare(b.number));

      tree.push({
        id: region.id,
        name: region.name,
        symbol: region.symbol,
        parentAreas: parentNodes,
      });
    }

    return tree;
  }

  async addRegion(name: string, symbol: string): Promise<void> {
    const existing = (await this.api.ListRegions()) ?? [];
    const maxOrder = existing.reduce(
      (max, r) => Math.max(max, r.order ?? 0),
      -1,
    );
    const region = new models.Region({
      id: symbol,
      name,
      symbol,
      approved: false,
      order: maxOrder + 1,
    });
    await this.api.SaveRegion(region);
  }

  async updateRegion(id: string, name: string, symbol: string): Promise<void> {
    await this.api.UpdateRegion(id, name, symbol);
  }

  async reorderRegions(ids: string[]): Promise<void> {
    await this.api.ReorderRegions(ids);
  }

  async moveRegion(id: string, direction: "up" | "down"): Promise<void> {
    const regions = await this.api.ListRegions();
    const ids = (regions ?? []).map((r) => r.id);
    const idx = ids.indexOf(id);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= ids.length) return;
    [ids[idx], ids[targetIdx]] = [ids[targetIdx], ids[idx]];
    await this.api.ReorderRegions(ids);
  }

  async setParentAreaCount(regionId: string, count: number): Promise<void> {
    await this.api.SetParentAreaCount(regionId, count);
  }

  async addParentArea(regionId: string, name: string): Promise<void> {
    const existing = (await this.api.ListParentAreas(regionId)) ?? [];
    const maxNum = existing.reduce((max, pa) => {
      const n = parseInt(pa.number, 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const number = String(maxNum + 1).padStart(3, "0");
    const id = `${regionId}-${number}`;
    const pa = new models.ParentArea({ id, regionId, number, name });
    await this.api.SaveParentArea(pa);
  }

  async addArea(parentAreaId: string): Promise<void> {
    const existing = (await this.api.ListAreas(parentAreaId)) ?? [];
    const maxNum = existing.reduce((max, a) => {
      const n = parseInt(a.number, 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const number = String(maxNum + 1).padStart(2, "0");
    const id = `${parentAreaId}-${number}`;
    const area = new models.Area({ id, parentAreaId, number });
    await this.api.SaveArea(area);
  }

  async renameParentArea(id: string, name: string): Promise<void> {
    const pa = await this.api.GetParentArea(id);
    pa.name = name;
    await this.api.SaveParentArea(pa);
  }

  isLastParentArea(region: AreaTreeNode, paId: string): boolean {
    const pas = region.parentAreas;
    if (pas.length === 0) return false;
    const maxNum = pas.reduce((max, pa) => {
      const n = parseInt(pa.number, 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const target = pas.find((pa) => pa.id === paId);
    if (!target) return false;
    return parseInt(target.number, 10) === maxNum;
  }

  isLastArea(
    parentArea: { areas: { id: string; number: string }[] },
    areaId: string,
  ): boolean {
    const areas = parentArea.areas;
    if (areas.length === 0) return false;
    const maxNum = areas.reduce((max, a) => {
      const n = parseInt(a.number, 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const target = areas.find((a) => a.id === areaId);
    if (!target) return false;
    return parseInt(target.number, 10) === maxNum;
  }

  async deleteRegion(id: string): Promise<DeleteCommand> {
    const entries: DeleteEntry[] = [];
    const parentAreas = (await this.api.ListParentAreas(id)) ?? [];
    for (const pa of parentAreas) {
      const areas = (await this.api.ListAreas(pa.id)) ?? [];
      for (const area of areas) {
        await this.api.DeleteArea(area.id);
        entries.push({ entityType: "area", id: area.id });
      }
      await this.api.DeleteParentArea(pa.id);
      entries.push({ entityType: "parentArea", id: pa.id });
    }
    await this.api.DeleteRegion(id);
    entries.push({ entityType: "region", id });
    return { type: "delete", targetType: "region", targetId: id, entries };
  }

  async deleteParentArea(id: string): Promise<DeleteCommand> {
    const entries: DeleteEntry[] = [];
    const areas = (await this.api.ListAreas(id)) ?? [];
    for (const area of areas) {
      await this.api.DeleteArea(area.id);
      entries.push({ entityType: "area", id: area.id });
    }
    await this.api.DeleteParentArea(id);
    entries.push({ entityType: "parentArea", id });
    return { type: "delete", targetType: "parentArea", targetId: id, entries };
  }

  async deleteArea(id: string): Promise<DeleteCommand> {
    await this.api.DeleteArea(id);
    return {
      type: "delete",
      targetType: "area",
      targetId: id,
      entries: [{ entityType: "area", id }],
    };
  }
}
