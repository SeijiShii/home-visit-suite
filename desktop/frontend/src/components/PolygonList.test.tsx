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
      coordinates: [
        [
          [140, 35],
          [141, 36],
          [140, 36],
          [140, 35],
        ],
      ],
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
  const defaultProps = {
    polygons: [] as MapPolygon[],
    polygonAreaMap: new Map<string, PolygonAreaInfo>(),
    selectedPolygonId: null as PolygonID | null,
    onPolygonClick: vi.fn(),
    onDeletePolygon: vi.fn(),
    isDrawing: false,
  };

  it("ポリゴンがない場合はnoDataメッセージを表示する", () => {
    wrap(<PolygonList {...defaultProps} />);
    expect(screen.getByText("データがありません")).toBeInTheDocument();
  });

  it("区域に紐づいたポリゴンは区域名を表示する", () => {
    const polygons = [makePolygon("p1", "display-p1")];
    const areaMap = new Map<string, PolygonAreaInfo>([
      ["p1", { areaId: "NRT-001-01", areaLabel: "NRT-001-01" }],
    ]);

    wrap(
      <PolygonList
        {...defaultProps}
        polygons={polygons}
        polygonAreaMap={areaMap}
      />,
    );
    expect(screen.getByText("NRT-001-01")).toBeInTheDocument();
  });

  it("未紐づきポリゴンは「区域なし」を表示する", () => {
    const polygons = [makePolygon("p1", "display-p1")];

    wrap(<PolygonList {...defaultProps} polygons={polygons} />);
    expect(screen.getByText("区域なし")).toBeInTheDocument();
  });

  it("クリックでonPolygonClickが呼ばれる", () => {
    const polygons = [makePolygon("p1", "display-p1")];
    const onClick = vi.fn();

    wrap(
      <PolygonList
        {...defaultProps}
        polygons={polygons}
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
        {...defaultProps}
        polygons={polygons}
        selectedPolygonId={"p1" as unknown as PolygonID}
      />,
    );

    const item = screen.getByText("区域なし").closest(".polygon-list-item");
    expect(item?.classList.contains("polygon-list-item-selected")).toBe(true);
  });

  describe("削除機能", () => {
    it("各ポリゴンに削除ボタンが表示される", () => {
      const polygons = [makePolygon("p1", "P1"), makePolygon("p2", "P2")];

      wrap(<PolygonList {...defaultProps} polygons={polygons} />);

      const deleteButtons = screen.getAllByRole("button", { name: "削除" });
      expect(deleteButtons).toHaveLength(2);
    });

    it("描画中は削除ボタンが無効になる", () => {
      const polygons = [makePolygon("p1", "P1")];

      wrap(
        <PolygonList {...defaultProps} polygons={polygons} isDrawing={true} />,
      );

      const deleteButton = screen.getByRole("button", { name: "削除" });
      expect(deleteButton).toBeDisabled();
    });

    it("削除ボタンクリックでダイアログが開く", () => {
      const polygons = [makePolygon("p1", "P1")];

      wrap(<PolygonList {...defaultProps} polygons={polygons} />);

      fireEvent.click(screen.getByRole("button", { name: "削除" }));

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(
        screen.getByText("このポリゴンを削除しますか？"),
      ).toBeInTheDocument();
    });

    it("ダイアログでキャンセルするとonDeletePolygonは呼ばれない", () => {
      const polygons = [makePolygon("p1", "P1")];
      const onDelete = vi.fn();

      wrap(
        <PolygonList
          {...defaultProps}
          polygons={polygons}
          onDeletePolygon={onDelete}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "削除" }));
      fireEvent.click(screen.getByText("キャンセル"));

      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("ダイアログで確認するとonDeletePolygonが呼ばれる", () => {
      const polygons = [makePolygon("p1", "P1")];
      const onDelete = vi.fn();

      wrap(
        <PolygonList
          {...defaultProps}
          polygons={polygons}
          onDeletePolygon={onDelete}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "削除" }));
      fireEvent.click(screen.getByText("確認"));

      expect(onDelete).toHaveBeenCalledWith("p1");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("削除ボタンクリック時にポリゴンクリックイベントは発火しない", () => {
      const polygons = [makePolygon("p1", "P1")];
      const onClick = vi.fn();

      wrap(
        <PolygonList
          {...defaultProps}
          polygons={polygons}
          onPolygonClick={onClick}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "削除" }));

      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
