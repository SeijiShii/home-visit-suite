import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EdgeContextMenu } from "./EdgeContextMenu";

describe("EdgeContextMenu", () => {
  const defaultProps = {
    x: 100,
    y: 200,
    onAddVertex: vi.fn(),
    onClose: vi.fn(),
  };

  it("指定位置に表示される", () => {
    render(<EdgeContextMenu {...defaultProps} />);
    const menu = screen.getByRole("menu");
    expect(menu.style.left).toBe("100px");
    expect(menu.style.top).toBe("200px");
  });

  it("「頂点の追加」メニュー項目が表示される", () => {
    render(<EdgeContextMenu {...defaultProps} />);
    expect(screen.getByText("頂点の追加")).toBeDefined();
  });

  it("「頂点の追加」クリックで onAddVertex が呼ばれる", () => {
    const onAddVertex = vi.fn();
    render(<EdgeContextMenu {...defaultProps} onAddVertex={onAddVertex} />);
    fireEvent.click(screen.getByText("頂点の追加"));
    expect(onAddVertex).toHaveBeenCalledOnce();
  });

  it("「頂点の追加」クリック後に onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<EdgeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("頂点の追加"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("メニュー外クリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <div>
        <EdgeContextMenu {...defaultProps} onClose={onClose} />
        <button data-testid="outside">外側</button>
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
