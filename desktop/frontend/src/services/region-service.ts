import { models } from "../../wailsjs/go/models";
import type { DeleteCommand, DeleteEntry } from "./command-history";

// RegionBinding API（Wails自動生成の関数群に対応）
export interface RegionBindingAPI {
  ListRegions(): Promise<models.Region[]>;
  SaveRegion(region: models.Region): Promise<void>;
  DeleteRegion(id: string): Promise<void>;
  RestoreRegion(id: string): Promise<void>;
  ListParentAreas(regionID: string): Promise<models.ParentArea[]>;
  DeleteParentArea(id: string): Promise<void>;
  RestoreParentArea(id: string): Promise<void>;
  ListAreas(parentAreaID: string): Promise<models.Area[]>;
  DeleteArea(id: string): Promise<void>;
  RestoreArea(id: string): Promise<void>;
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
          areas: areas.map((a) => ({ id: a.id, number: a.number })),
        });
      }

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
    const region = new models.Region({
      id: symbol,
      name,
      symbol,
      approved: false,
    });
    await this.api.SaveRegion(region);
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
