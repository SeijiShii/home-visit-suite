import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AreaPickerDialog } from "./AreaPickerDialog";
import { I18nProvider } from "../contexts/I18nContext";
import type { AreaTreeNode } from "../services/region-service";

const wrap = (ui: React.ReactElement) =>
  render(<I18nProvider>{ui}</I18nProvider>);

const sampleTree: AreaTreeNode[] = [
  {
    id: "NRT",
    name: "成田市",
    symbol: "NRT",
    parentAreas: [
      {
        id: "NRT-001",
        number: "001",
        name: "加良部1丁目",
        areas: [
          { id: "NRT-001-01", number: "01" },
          { id: "NRT-001-02", number: "02", polygonId: "poly-linked" },
        ],
      },
    ],
  },
];

/** 領域→区域親番を展開して区域を表示する */
const expandAll = () => {
  fireEvent.click(screen.getByText(/NRT \(成田市\)/));
  fireEvent.click(screen.getByText(/加良部1丁目/));
};

describe("AreaPickerDialog", () => {
  const defaultProps = {
    open: true,
    tree: sampleTree,
    linkedAreaIds: new Set<string>(["NRT-001-02"]),
    onSelect: vi.fn(),
    onClose: vi.fn(),
  };

  it("open=falseのときは何もレンダリングしない", () => {
    wrap(<AreaPickerDialog {...defaultProps} open={false} />);
    expect(screen.queryByText("紐づける区域を選択")).not.toBeInTheDocument();
  });

  it("ダイアログタイトルが表示される", () => {
    wrap(<AreaPickerDialog {...defaultProps} />);
    expect(screen.getByText("紐づける区域を選択")).toBeInTheDocument();
  });

  it("領域名が表示される", () => {
    wrap(<AreaPickerDialog {...defaultProps} />);
    expect(screen.getByText(/NRT \(成田市\)/)).toBeInTheDocument();
  });

  it("領域クリックで区域親番が展開される", () => {
    wrap(<AreaPickerDialog {...defaultProps} />);

    expect(screen.queryByText(/加良部1丁目/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/NRT \(成田市\)/));
    expect(screen.getByText(/加良部1丁目/)).toBeInTheDocument();
  });

  it("区域親番クリックで区域が展開される", () => {
    wrap(<AreaPickerDialog {...defaultProps} />);
    expandAll();

    expect(screen.getByText("NRT-001-01")).toBeInTheDocument();
    expect(screen.getByText("NRT-001-02")).toBeInTheDocument();
  });

  it("未紐付け区域をクリックするとonSelectが呼ばれる", () => {
    const onSelect = vi.fn();
    wrap(<AreaPickerDialog {...defaultProps} onSelect={onSelect} />);
    expandAll();

    fireEvent.click(screen.getByText("NRT-001-01"));
    expect(onSelect).toHaveBeenCalledWith("NRT-001-01", "NRT-001-01");
  });

  it("紐付け済み区域はクリックしてもonSelectが呼ばれない", () => {
    const onSelect = vi.fn();
    wrap(<AreaPickerDialog {...defaultProps} onSelect={onSelect} />);
    expandAll();

    fireEvent.click(screen.getByText("NRT-001-02"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("紐付け済み区域にはdisabledクラスが付く", () => {
    wrap(<AreaPickerDialog {...defaultProps} />);
    expandAll();

    const item = screen.getByText("NRT-001-02").closest(".area-picker-item");
    expect(item?.classList.contains("area-picker-item-disabled")).toBe(true);
  });

  it("キャンセルボタンでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    wrap(<AreaPickerDialog {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByText("キャンセル"));
    expect(onClose).toHaveBeenCalled();
  });
});
