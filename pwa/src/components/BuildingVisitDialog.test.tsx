// BuildingVisitDialog: 編集リクエストの送信条件を検証する。
// 仕様 docs/wants/08「編集をリクエスト」: 詳細テキストは原則必須、要削除のみ任意（戸建てと同じ）。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../contexts/I18nContext";
import { setLocale } from "../i18n/i18n-util";
import { BuildingVisitDialog } from "./BuildingVisitDialog";

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

function openEditRequest() {
  fireEvent.click(screen.getByText("編集をリクエスト"));
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
