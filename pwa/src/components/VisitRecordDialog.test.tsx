// VisitRecordDialog: 編集リクエストの送信条件を検証する。
// 仕様 docs/wants/08「編集をリクエスト」: 詳細テキストは原則必須、要削除のみ任意。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../contexts/I18nContext";
import { setLocale } from "../i18n/i18n-util";
import { VisitRecordDialog } from "./VisitRecordDialog";

function renderDialog() {
  const onPlaceEditRequest = vi.fn();
  render(
    <I18nProvider>
      <VisitRecordDialog
        placeLabel="田中宅"
        placeAddress=""
        placeId="p1"
        lastMetDate={null}
        myHistory={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onPlaceEditRequest={onPlaceEditRequest}
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

describe("VisitRecordDialog の編集リクエスト送信条件", () => {
  it("既定種別（その他）では詳細テキストが空だと送信できない", () => {
    const spy = renderDialog();
    openEditRequest();
    const submit = screen.getByText("リクエストを送信");
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(spy).not.toHaveBeenCalled();
  });

  it("要移動は詳細テキストが空だと送信できない", () => {
    const spy = renderDialog();
    openEditRequest();
    fireEvent.change(screen.getByLabelText("種別"), {
      target: { value: "move" },
    });
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

  it("要削除でも詳細テキストを入力すればその内容で送信される", () => {
    const spy = renderDialog();
    openEditRequest();
    fireEvent.change(screen.getByLabelText("種別"), {
      target: { value: "delete" },
    });
    fireEvent.change(screen.getByLabelText(/詳細/), {
      target: { value: "取り壊し済み" },
    });
    fireEvent.click(screen.getByText("リクエストを送信"));
    expect(spy).toHaveBeenCalledWith("delete", "取り壊し済み");
  });
});
