// BuildingVisitDialog: 編集リクエストの送信条件と部屋の直接操作を検証する。
// 仕様 docs/wants/08「編集をリクエスト」: 詳細テキストは原則必須、要削除のみ任意（戸建てと同じ）。
// 仕様 docs/wants/08「部屋の追加・編集・削除」: 全メンバー・全端末（タッチ含む）が
// 訪問ダイアログから部屋を直接操作できる。削除は確認ダイアログを挟む。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../contexts/I18nContext";
import { setLocale } from "../i18n/i18n-util";
import type { Place } from "../services/place-service";
import { BuildingVisitDialog } from "./BuildingVisitDialog";

function makeRoom(overrides: Partial<Place>): Place {
  return {
    id: "room-1",
    areaId: "NRT-001-01",
    coord: { lat: 0, lng: 0 },
    type: "room",
    label: "",
    displayName: "101",
    address: "",
    description: "",
    parentId: "bldg-1",
    sortOrder: 0,
    languages: [],
    doNotVisit: false,
    doNotVisitNote: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    restoredFromId: null,
    ...overrides,
  };
}

function renderDialog() {
  const onPlaceEditRequest = vi.fn();
  render(
    <I18nProvider>
      <BuildingVisitDialog
        buildingLabel="○○荘"
        buildingAddress=""
        buildingDescription=""
        rooms={[]}
        roomLastVisitMap={new Map()}
        onSelectRoom={vi.fn()}
        onPlaceEditRequest={onPlaceEditRequest}
        onCancel={vi.fn()}
      />
    </I18nProvider>,
  );
  return onPlaceEditRequest;
}

function renderWithRoomOps(rooms: Place[]) {
  const handlers = {
    onSelectRoom: vi.fn(),
    onSaveRooms: vi.fn(),
  };
  render(
    <I18nProvider>
      <BuildingVisitDialog
        buildingLabel="○○荘"
        buildingAddress=""
        buildingDescription=""
        rooms={rooms}
        roomLastVisitMap={new Map()}
        onSelectRoom={handlers.onSelectRoom}
        onSaveRooms={handlers.onSaveRooms}
        onPlaceEditRequest={vi.fn()}
        onCancel={vi.fn()}
      />
    </I18nProvider>,
  );
  return handlers;
}

function openEditRequest() {
  fireEvent.click(screen.getByText("建物の編集をリクエスト"));
}

beforeEach(() => {
  localStorage.clear();
  setLocale("ja");
});

describe("BuildingVisitDialog の編集リクエスト送信条件", () => {
  it("既定種別（その他）では詳細テキストが空だと送信できない", () => {
    const spy = renderDialog();
    openEditRequest();
    const submit = screen.getByText("リクエストを送信");
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(spy).not.toHaveBeenCalled();
  });

  it("要削除は詳細テキストなしで送信できる", () => {
    const spy = renderDialog();
    openEditRequest();
    fireEvent.change(screen.getByLabelText("種別"), {
      target: { value: "delete" },
    });
    const submit = screen.getByText("リクエストを送信");
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    expect(spy).toHaveBeenCalledWith("delete", "");
  });
});

// 部屋編集モードへ切り替える（通常表示下部の「部屋を編集」リンク）
function enterRoomEditMode() {
  fireEvent.click(screen.getByRole("button", { name: "部屋を編集" }));
}

describe("BuildingVisitDialog の部屋編集モード（集合住宅編集ダイアログと共通 UI・確定で一括保存）", () => {
  it("onSaveRooms 未指定なら「部屋を編集」リンクを表示しない", () => {
    renderDialog();
    expect(screen.queryByRole("button", { name: "部屋を編集" })).toBeNull();
  });

  it("下部アクション行は 閉じる → 部屋を編集 → 建物の編集をリクエスト の並び", () => {
    renderWithRoomOps([]);
    const actions = document.querySelector(".building-visit-actions")!;
    const labels = Array.from(actions.querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(["閉じる", "部屋を編集", "建物の編集をリクエスト"]);
  });

  it("編集モードでは 閉じる→キャンセル・部屋を編集→確定 に切り替わる", () => {
    renderWithRoomOps([]);
    enterRoomEditMode();
    const actions = document.querySelector(".building-visit-actions")!;
    const labels = Array.from(actions.querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(["キャンセル", "確定", "建物の編集をリクエスト"]);
  });

  it("通常表示では入力欄を出さず、行タップで部屋訪問ダイアログを開く", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    expect(screen.queryByPlaceholderText("部屋番号")).toBeNull();
    fireEvent.click(screen.getByTestId("room-row"));
    expect(h.onSelectRoom).toHaveBeenCalledWith(room);
  });

  it("編集モードは編集ダイアログと同じ行 UI（入力欄＋×＋[+1][+5][+10]）で、行タップでは部屋訪問ダイアログを開かない", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    enterRoomEditMode();
    const input = screen.getByPlaceholderText("部屋番号") as HTMLInputElement;
    expect(input.value).toBe("101");
    expect(
      screen.getByRole("button", { name: "行を削除" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+10" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("room-row"));
    expect(h.onSelectRoom).not.toHaveBeenCalled();
  });

  it("番号を変更して「確定」すると onSaveRooms が編集後の行リストで呼ばれ、通常表示へ戻る", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    enterRoomEditMode();
    fireEvent.change(screen.getByPlaceholderText("部屋番号"), {
      target: { value: "202" },
    });
    fireEvent.click(screen.getByRole("button", { name: "確定" }));
    expect(h.onSaveRooms).toHaveBeenCalledWith(
      [{ key: "existing-room-a", existingId: "room-a", displayName: "202" }],
      ["room-a"], // 編集開始時に提示した部屋（差分適用のスコープ）
    );
    expect(screen.queryByPlaceholderText("部屋番号")).toBeNull();
  });

  it("[+1] で空行を追加し番号を入力して「確定」すると新規行が渡る", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    enterRoomEditMode();
    fireEvent.click(screen.getByRole("button", { name: "+1" }));
    const inputs = screen.getAllByPlaceholderText(
      "部屋番号",
    ) as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[1], { target: { value: "205" } });
    fireEvent.click(screen.getByRole("button", { name: "確定" }));
    const rows = h.onSaveRooms.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ existingId: "room-a" });
    expect(rows[1]).toMatchObject({ existingId: null, displayName: "205" });
  });

  it("変更がなければ「確定」は onSaveRooms を呼ばずモードを終了する", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    enterRoomEditMode();
    fireEvent.click(screen.getByRole("button", { name: "確定" }));
    expect(h.onSaveRooms).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("部屋番号")).toBeNull();
  });

  it("既存行の × は確認ダイアログ → はい で行が消え、確定で削除が渡る", () => {
    const roomA = makeRoom({ id: "room-a", displayName: "101" });
    const roomB = makeRoom({ id: "room-b", displayName: "102", sortOrder: 1 });
    const h = renderWithRoomOps([roomA, roomB]);
    enterRoomEditMode();
    fireEvent.click(screen.getAllByRole("button", { name: "行を削除" })[1]);
    expect(screen.getByText("この部屋を削除しますか？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "はい" }));
    expect(screen.getAllByPlaceholderText("部屋番号")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "確定" }));
    const rows = h.onSaveRooms.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ existingId: "room-a" });
  });

  it("変更ありでキャンセルすると破棄確認 → はい で保存せず通常表示へ戻る", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    enterRoomEditMode();
    fireEvent.change(screen.getByPlaceholderText("部屋番号"), {
      target: { value: "202" },
    });
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.getByText("部屋の変更を破棄しますか？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "はい" }));
    expect(h.onSaveRooms).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("部屋番号")).toBeNull();
  });

  it("変更ありでキャンセル → 破棄確認で いいえ なら編集モードに留まる", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    renderWithRoomOps([room]);
    enterRoomEditMode();
    fireEvent.change(screen.getByPlaceholderText("部屋番号"), {
      target: { value: "202" },
    });
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    fireEvent.click(screen.getByRole("button", { name: "いいえ" }));
    expect(screen.queryByText("部屋の変更を破棄しますか？")).toBeNull();
    const input = screen.getByPlaceholderText("部屋番号") as HTMLInputElement;
    expect(input.value).toBe("202");
  });

  it("変更なしのキャンセルは確認なしで通常表示へ戻る", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    renderWithRoomOps([room]);
    enterRoomEditMode();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByText("部屋の変更を破棄しますか？")).toBeNull();
    expect(screen.queryByPlaceholderText("部屋番号")).toBeNull();
  });
});
