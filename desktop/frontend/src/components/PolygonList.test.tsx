import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PolygonList } from "./PolygonList";
import { I18nProvider } from "../contexts/I18nContext";
import type { MapPolygon, PolygonID } from "map-polygon-editor";
import type { PolygonAreaInfo } from "../services/polygon-service";

const makePolygon = (id: string, name: string): MapPolygon =>
  ({
    id: id as unknown as PolygonID,
    geometry: {
      type: "Polygon" as const,
      coordinates: [[[140, 35], [141, 36], [140, 36], [140, 35]]],
    },
    display_name: name,
    parent_id: null,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
  }) as MapPolygon;

const wrap = (ui: React.ReactElement) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("PolygonList", () => {
  it("ポリゴンがない場合はnoDataメッセージを表示する", () => {
    wrap(
      <PolygonList
        polygons={[]}
        polygonAreaMap={new Map()}
        selectedPolygonId={null}
        onPolygonClick={vi.fn()}
      />,
    );
    expect(screen.getByText("データがありません")).toBeInTheDocument();
  });

  it("区域に紐づいたポリゴンは区域名を表示する", () => {
    const polygons = [makePolygon("p1", "display-p1")];
    const areaMap = new Map<string, PolygonAreaInfo>([
      ["p1", { areaId: "NRT-001-01", areaLabel: "NRT-001-01" }],
    ]);

    wrap(
      <PolygonList
        polygons={polygons}
        polygonAreaMap={areaMap}
        selectedPolygonId={null}
        onPolygonClick={vi.fn()}
      />,
    );
    expect(screen.getByText("NRT-001-01")).toBeInTheDocument();
  });

  it("未紐づきポリゴンは「区域なし」を表示する", () => {
    const polygons = [makePolygon("p1", "display-p1")];

    wrap(
      <PolygonList
        polygons={polygons}
        polygonAreaMap={new Map()}
        selectedPolygonId={null}
        onPolygonClick={vi.fn()}
      />,
    );
    expect(screen.getByText("区域なし")).toBeInTheDocument();
  });

  it("クリックでonPolygonClickが呼ばれる", () => {
    const polygons = [makePolygon("p1", "display-p1")];
    const onClick = vi.fn();

    wrap(
      <PolygonList
        polygons={polygons}
        polygonAreaMap={new Map()}
        selectedPolygonId={null}
        onPolygonClick={onClick}
      />,
    );

    fireEvent.click(screen.getByText("区域なし"));
    expect(onClick).toHaveBeenCalledWith("p1");
  });

  it("選択中のポリゴンにはselectedクラスが付く", () => {
    const polygons = [makePolygon("p1", "display-p1")];

    wrap(
      <PolygonList
        polygons={polygons}
        polygonAreaMap={new Map()}
        selectedPolygonId={"p1" as unknown as PolygonID}
        onPolygonClick={vi.fn()}
      />,
    );

    const item = screen.getByText("区域なし").closest(".polygon-list-item");
    expect(item?.classList.contains("polygon-list-item-selected")).toBe(true);
  });
});
