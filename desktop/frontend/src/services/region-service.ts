import type { models } from "../../wailsjs/go/models";

// RegionBinding API（Wails自動生成の関数群に対応）
export interface RegionBindingAPI {
  ListRegions(): Promise<models.Region[]>;
  SaveRegion(region: models.Region): Promise<void>;
  DeleteRegion(id: string): Promise<void>;
  ListParentAreas(regionID: string): Promise<models.ParentArea[]>;
  ListAreas(parentAreaID: string): Promise<models.Area[]>;
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

    for (const region of regions) {
      const parentAreas = await this.api.ListParentAreas(region.id);
      const parentNodes = [];

      for (const pa of parentAreas) {
        const areas = await this.api.ListAreas(pa.id);
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
    const region = {
      id: symbol,
      name,
      symbol,
      approved: false,
      geometry: undefined,
    } as unknown as models.Region;
    await this.api.SaveRegion(region);
  }

  async deleteRegion(id: string): Promise<void> {
    await this.api.DeleteRegion(id);
  }
}
