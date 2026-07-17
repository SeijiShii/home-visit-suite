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
    onAddRoom: vi.fn(),
    onRenameRoom: vi.fn(),
    onDeleteRoom: vi.fn(),
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
        onAddRoom={handlers.onAddRoom}
        onRenameRoom={handlers.onRenameRoom}
        onDeleteRoom={handlers.onDeleteRoom}
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

describe("BuildingVisitDialog の部屋の直接操作（部屋編集モード）", () => {
  it("部屋操作ハンドラ未指定なら「部屋を編集」リンクを表示しない", () => {
    renderDialog();
    expect(screen.queryByRole("button", { name: "部屋を編集" })).toBeNull();
    expect(screen.queryByRole("button", { name: "部屋を追加" })).toBeNull();
    expect(screen.queryByRole("button", { name: "部屋番号を編集" })).toBeNull();
    expect(screen.queryByRole("button", { name: "部屋を削除" })).toBeNull();
  });

  it("下部アクション行は 閉じる → 部屋を編集 → 建物の編集をリクエスト の並び", () => {
    renderWithRoomOps([]);
    const actions = document.querySelector(".building-visit-actions")!;
    const labels = Array.from(actions.querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(["閉じる", "部屋を編集", "建物の編集をリクエスト"]);
  });

  it("編集モードでは「部屋を編集」の位置が「確定」に切り替わる", () => {
    renderWithRoomOps([]);
    enterRoomEditMode();
    const actions = document.querySelector(".building-visit-actions")!;
    const labels = Array.from(actions.querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(["閉じる", "確定", "建物の編集をリクエスト"]);
  });

  it("通常表示では ✎/× を表示せず、行タップで部屋訪問ダイアログを開く", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    expect(screen.queryByRole("button", { name: "部屋番号を編集" })).toBeNull();
    expect(screen.queryByRole("button", { name: "部屋を削除" })).toBeNull();
    expect(screen.queryByRole("button", { name: "部屋を追加" })).toBeNull();
    fireEvent.click(screen.getByTestId("room-row"));
    expect(h.onSelectRoom).toHaveBeenCalledWith(room);
  });

  it("「部屋を編集」で編集モードへ。行に ✎/×・下部に「部屋を追加」「確定」が現れ、行タップでは部屋訪問ダイアログを開かない", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    enterRoomEditMode();
    expect(
      screen.getByRole("button", { name: "部屋番号を編集" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "部屋を削除" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "部屋を追加" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確定" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("room-row"));
    expect(h.onSelectRoom).not.toHaveBeenCalled();
  });

  it("「確定」で通常表示へ戻り、行タップの訪問フローが再び使える", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    enterRoomEditMode();
    fireEvent.click(screen.getByRole("button", { name: "確定" }));
    expect(screen.queryByRole("button", { name: "部屋番号を編集" })).toBeNull();
    expect(screen.queryByRole("button", { name: "部屋を追加" })).toBeNull();
    fireEvent.click(screen.getByTestId("room-row"));
    expect(h.onSelectRoom).toHaveBeenCalledWith(room);
  });

  it("「部屋を追加」→ 部屋番号入力 → 保存で onAddRoom が呼ばれる（trim 済み）", () => {
    const h = renderWithRoomOps([]);
    enterRoomEditMode();
    fireEvent.click(screen.getByRole("button", { name: "部屋を追加" }));
    fireEvent.change(screen.getByPlaceholderText("部屋番号"), {
      target: { value: " 205 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(h.onAddRoom).toHaveBeenCalledWith("205");
  });

  it("部屋番号が空欄のままでは保存できない", () => {
    const h = renderWithRoomOps([]);
    enterRoomEditMode();
    fireEvent.click(screen.getByRole("button", { name: "部屋を追加" }));
    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(h.onAddRoom).not.toHaveBeenCalled();
  });

  it("行の編集ボタン → 既存番号を初期表示 → 保存で onRenameRoom が呼ばれる", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    enterRoomEditMode();
    fireEvent.click(screen.getByRole("button", { name: "部屋番号を編集" }));
    const input = screen.getByPlaceholderText("部屋番号") as HTMLInputElement;
    expect(input.value).toBe("101");
    fireEvent.change(input, { target: { value: "202" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(h.onRenameRoom).toHaveBeenCalledWith(room, "202");
    expect(h.onSelectRoom).not.toHaveBeenCalled();
  });

  it("行の削除ボタン → 確認ダイアログ → 削除で onDeleteRoom が呼ばれる", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    enterRoomEditMode();
    fireEvent.click(screen.getByRole("button", { name: "部屋を削除" }));
    expect(screen.getByText("この部屋を削除しますか？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(h.onDeleteRoom).toHaveBeenCalledWith(room);
    expect(h.onSelectRoom).not.toHaveBeenCalled();
  });

  it("削除確認をキャンセルすると onDeleteRoom は呼ばれない", () => {
    const room = makeRoom({ id: "room-a", displayName: "101" });
    const h = renderWithRoomOps([room]);
    enterRoomEditMode();
    fireEvent.click(screen.getByRole("button", { name: "部屋を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(h.onDeleteRoom).not.toHaveBeenCalled();
    expect(screen.queryByText("この部屋を削除しますか？")).toBeNull();
  });
});
