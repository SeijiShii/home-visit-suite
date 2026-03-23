import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PolygonList } from "./PolygonList";
import { I18nProvider } from "../contexts/I18nContext";
import type { PolygonID, PolygonSnapshot } from "map-polygon-editor";
import {
  createPolygonID,
  createEdgeID,
  createVertexID,
} from "map-polygon-editor";
import type { PolygonAreaInfo } from "../services/polygon-service";

const makePolygonSnapshot = (
  id: string,
  opts?: { active?: boolean; locked?: boolean },
): PolygonSnapshot => ({
  id: createPolygonID(id),
  edgeIds: [createEdgeID("e1"), createEdgeID("e2"), createEdgeID("e3")],
  vertexIds: [createVertexID("v1"), createVertexID("v2"), createVertexID("v3")],
  holes: [],
  ...opts,
});

const wrap = (ui: React.ReactElement) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("PolygonList", () => {
  const defaultProps = {
    polygons: [] as PolygonSnapshot[],
    polygonAreaMap: new Map<string, PolygonAreaInfo>(),
    tree: [],
    selectedPolygonId: null as PolygonID | null,
    onPolygonClick: vi.fn(),
    onDeletePolygon: vi.fn(),
    onToggleActive: vi.fn(),
    onToggleLocked: vi.fn(),
    onLinkPolygon: vi.fn(),
    onUnlinkPolygon: vi.fn(),
    isDrawing: false,
  };

  it("ポリゴンがない場合はnoDataメッセージを表示する", () => {
    wrap(<PolygonList {...defaultProps} />);
    expect(screen.getByText("データがありません")).toBeInTheDocument();
  });

  it("区域に紐づいたポリゴンは区域名を表示する", () => {
    const polygons = [makePolygonSnapshot("p1")];
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
    const polygons = [makePolygonSnapshot("p1")];

    wrap(<PolygonList {...defaultProps} polygons={polygons} />);
    expect(screen.getByText("区域なし")).toBeInTheDocument();
  });

  it("クリックでonPolygonClickが呼ばれる", () => {
    const polygons = [makePolygonSnapshot("p1")];
    const onClick = vi.fn();

    wrap(
      <PolygonList
        {...defaultProps}
        polygons={polygons}
        onPolygonClick={onClick}
      />,
    );

    fireEvent.click(screen.getByText("区域なし"));
    expect(onClick).toHaveBeenCalledWith(createPolygonID("p1"));
  });

  it("選択中のポリゴンにはselectedクラスが付く", () => {
    const polygons = [makePolygonSnapshot("p1")];

    wrap(
      <PolygonList
        {...defaultProps}
        polygons={polygons}
        selectedPolygonId={createPolygonID("p1")}
      />,
    );

    const item = screen.getByText("区域なし").closest(".polygon-list-item");
    expect(item?.classList.contains("polygon-list-item-selected")).toBe(true);
  });

  describe("削除機能", () => {
    it("各ポリゴンに削除ボタンが表示される", () => {
      const polygons = [makePolygonSnapshot("p1"), makePolygonSnapshot("p2")];

      wrap(<PolygonList {...defaultProps} polygons={polygons} />);

      const deleteButtons = screen.getAllByRole("button", { name: "削除" });
      expect(deleteButtons).toHaveLength(2);
    });

    it("描画中は削除ボタンが無効になる", () => {
      const polygons = [makePolygonSnapshot("p1")];

      wrap(
        <PolygonList {...defaultProps} polygons={polygons} isDrawing={true} />,
      );

      const deleteButton = screen.getByRole("button", { name: "削除" });
      expect(deleteButton).toBeDisabled();
    });

    it("削除ボタンクリックでダイアログが開く", () => {
      const polygons = [makePolygonSnapshot("p1")];

      wrap(<PolygonList {...defaultProps} polygons={polygons} />);

      fireEvent.click(screen.getByRole("button", { name: "削除" }));

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(
        screen.getByText("このポリゴンを削除しますか？"),
      ).toBeInTheDocument();
    });

    it("ダイアログでキャンセルするとonDeletePolygonは呼ばれない", () => {
      const polygons = [makePolygonSnapshot("p1")];
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

    it("ダイアログで確認するとonDeletePolygonがsnapshotで呼ばれる", () => {
      const polygons = [makePolygonSnapshot("p1")];
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

      expect(onDelete).toHaveBeenCalledWith(polygons[0]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("削除ボタンクリック時にポリゴンクリックイベントは発火しない", () => {
      const polygons = [makePolygonSnapshot("p1")];
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

  describe("表示/非表示トグル", () => {
    it("デフォルト（active未設定）では「非表示」ボタンが表示される", () => {
      const polygons = [makePolygonSnapshot("p1")];

      wrap(<PolygonList {...defaultProps} polygons={polygons} />);

      expect(
        screen.getByRole("button", { name: "非表示" }),
      ).toBeInTheDocument();
    });

    it("active=falseのポリゴンには「表示」ボタンが表示される", () => {
      const polygons = [makePolygonSnapshot("p1", { active: false })];

      wrap(<PolygonList {...defaultProps} polygons={polygons} />);

      expect(screen.getByRole("button", { name: "表示" })).toBeInTheDocument();
    });

    it("「非表示」クリックでonToggleActiveが(id, false)で呼ばれる", () => {
      const polygons = [makePolygonSnapshot("p1")];
      const onToggleActive = vi.fn();

      wrap(
        <PolygonList
          {...defaultProps}
          polygons={polygons}
          onToggleActive={onToggleActive}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "非表示" }));
      expect(onToggleActive).toHaveBeenCalledWith(createPolygonID("p1"), false);
    });

    it("「表示」クリックでonToggleActiveが(id, true)で呼ばれる", () => {
      const polygons = [makePolygonSnapshot("p1", { active: false })];
      const onToggleActive = vi.fn();

      wrap(
        <PolygonList
          {...defaultProps}
          polygons={polygons}
          onToggleActive={onToggleActive}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "表示" }));
      expect(onToggleActive).toHaveBeenCalledWith(createPolygonID("p1"), true);
    });

    it("トグルクリックでonPolygonClickは発火しない", () => {
      const polygons = [makePolygonSnapshot("p1")];
      const onClick = vi.fn();

      wrap(
        <PolygonList
          {...defaultProps}
          polygons={polygons}
          onPolygonClick={onClick}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "非表示" }));
      expect(onClick).not.toHaveBeenCalled();
    });

    it("active=falseのポリゴンはinactiveクラスが付く", () => {
      const polygons = [makePolygonSnapshot("p1", { active: false })];

      wrap(<PolygonList {...defaultProps} polygons={polygons} />);

      const item = screen
        .getByRole("button", { name: "表示" })
        .closest(".polygon-list-item");
      expect(item?.classList.contains("polygon-list-item-inactive")).toBe(true);
    });
  });

  describe("ロック/ロック解除トグル", () => {
    it("デフォルト（locked未設定）では「ロック」ボタンが表示される", () => {
      const polygons = [makePolygonSnapshot("p1")];

      wrap(<PolygonList {...defaultProps} polygons={polygons} />);

      expect(
        screen.getByRole("button", { name: "ロック" }),
      ).toBeInTheDocument();
    });

    it("locked=trueのポリゴンには「ロック解除」ボタンが表示される", () => {
      const polygons = [makePolygonSnapshot("p1", { locked: true })];

      wrap(<PolygonList {...defaultProps} polygons={polygons} />);

      expect(
        screen.getByRole("button", { name: "ロック解除" }),
      ).toBeInTheDocument();
    });

    it("「ロック」クリックでonToggleLockedが(id, true)で呼ばれる", () => {
      const polygons = [makePolygonSnapshot("p1")];
      const onToggleLocked = vi.fn();

      wrap(
        <PolygonList
          {...defaultProps}
          polygons={polygons}
          onToggleLocked={onToggleLocked}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "ロック" }));
      expect(onToggleLocked).toHaveBeenCalledWith(createPolygonID("p1"), true);
    });

    it("ロック中は削除ボタンが無効になる", () => {
      const polygons = [makePolygonSnapshot("p1", { locked: true })];

      wrap(<PolygonList {...defaultProps} polygons={polygons} />);

      const deleteButton = screen.getByRole("button", { name: "削除" });
      expect(deleteButton).toBeDisabled();
    });
  });

  describe("区域紐付け/解除", () => {
    it("未紐付けポリゴンにはリンクボタンが表示される", () => {
      const polygons = [makePolygonSnapshot("p1")];

      wrap(<PolygonList {...defaultProps} polygons={polygons} />);

      expect(
        screen.getByRole("button", { name: "区域と紐づけ" }),
      ).toBeInTheDocument();
    });

    it("紐付け済みポリゴンにはリンク解除ボタンが表示される", () => {
      const polygons = [makePolygonSnapshot("p1")];
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

      expect(
        screen.getByRole("button", { name: "紐づけ解除" }),
      ).toBeInTheDocument();
    });

    it("リンクボタンクリックでAreaPickerDialogが開く", () => {
      const polygons = [makePolygonSnapshot("p1")];
      const tree = [
        {
          id: "NRT",
          name: "成田市",
          symbol: "NRT",
          parentAreas: [
            {
              id: "NRT-001",
              number: "001",
              name: "加良部",
              areas: [{ id: "NRT-001-01", number: "01" }],
            },
          ],
        },
      ];

      wrap(<PolygonList {...defaultProps} polygons={polygons} tree={tree} />);

      fireEvent.click(screen.getByRole("button", { name: "区域と紐づけ" }));
      expect(screen.getByText("紐づける区域を選択")).toBeInTheDocument();
    });

    it("リンク解除ボタンクリックで確認ダイアログが開く", () => {
      const polygons = [makePolygonSnapshot("p1")];
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

      fireEvent.click(screen.getByRole("button", { name: "紐づけ解除" }));
      expect(
        screen.getByText("区域NRT-001-01との紐づけを解除しますか？"),
      ).toBeInTheDocument();
    });

    it("リンク解除確認でonUnlinkPolygonが呼ばれる", () => {
      const polygons = [makePolygonSnapshot("p1")];
      const areaMap = new Map<string, PolygonAreaInfo>([
        ["p1", { areaId: "NRT-001-01", areaLabel: "NRT-001-01" }],
      ]);
      const onUnlink = vi.fn();

      wrap(
        <PolygonList
          {...defaultProps}
          polygons={polygons}
          polygonAreaMap={areaMap}
          onUnlinkPolygon={onUnlink}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "紐づけ解除" }));
      // モーダル内の確認ボタン（modal-btn-danger）をクリック
      const confirmBtns = screen.getAllByText("確認");
      const dangerBtn = confirmBtns.find((btn) =>
        btn.classList.contains("modal-btn-danger"),
      );
      fireEvent.click(dangerBtn!);
      expect(onUnlink).toHaveBeenCalledWith(
        createPolygonID("p1"),
        "NRT-001-01",
      );
    });

    it("リンクボタンクリックでonPolygonClickは発火しない", () => {
      const polygons = [makePolygonSnapshot("p1")];
      const onClick = vi.fn();

      wrap(
        <PolygonList
          {...defaultProps}
          polygons={polygons}
          onPolygonClick={onClick}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "区域と紐づけ" }));
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
