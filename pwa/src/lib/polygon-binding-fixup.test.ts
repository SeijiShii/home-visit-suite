import { describe, it, expect } from "vitest";
import { emptyChangeSet, createPolygonID } from "map-polygon-editor";
import { computeBindingFixup } from "./polygon-binding-fixup";

const pid = createPolygonID;

describe("computeBindingFixup", () => {
  const areasOf = (id: string) =>
    ({
      "poly-a": ["NRT-001-01"],
      "poly-b": ["NRT-002-03"],
      // 1 ポリゴンに複数区域（N:M。大きな建物を複数区域で分担するケース）
      "poly-multi": ["NRT-001-01", "NRT-002-03"],
    })[id];
  const areaOf = areasOf;

  it("分割で生じた新ポリゴンを、分割元の紐付き区域へ bind する", () => {
    const cs = emptyChangeSet();
    cs.polygons.splitFrom = [{ id: pid("poly-new"), from: pid("poly-a") }];
    const fixup = computeBindingFixup(cs, areaOf);
    expect(fixup.bind).toEqual([
      { areaId: "NRT-001-01", polygonId: "poly-new" },
    ]);
    expect(fixup.unbind).toEqual([]);
  });

  it("分割元が未紐付けなら bind しない", () => {
    const cs = emptyChangeSet();
    cs.polygons.splitFrom = [{ id: pid("poly-new"), from: pid("poly-x") }];
    const fixup = computeBindingFixup(cs, areaOf);
    expect(fixup.bind).toEqual([]);
  });

  it("消滅した紐付け済みポリゴンを unbind する", () => {
    const cs = emptyChangeSet();
    cs.polygons.removed.push(pid("poly-b"), pid("poly-unbound"));
    const fixup = computeBindingFixup(cs, areaOf);
    expect(fixup.unbind).toEqual([
      { areaId: "NRT-002-03", polygonId: "poly-b" },
    ]);
    expect(fixup.bind).toEqual([]);
  });

  it("複数区域に紐付くポリゴンの分割は全区域へ引き継ぐ", () => {
    const cs = emptyChangeSet();
    cs.polygons.splitFrom = [{ id: pid("poly-new"), from: pid("poly-multi") }];
    const fixup = computeBindingFixup(cs, areasOf);
    expect(fixup.bind).toEqual([
      { areaId: "NRT-001-01", polygonId: "poly-new" },
      { areaId: "NRT-002-03", polygonId: "poly-new" },
    ]);
  });

  it("複数区域に紐付くポリゴンの消滅は全区域から解除する", () => {
    const cs = emptyChangeSet();
    cs.polygons.removed.push(pid("poly-multi"));
    const fixup = computeBindingFixup(cs, areasOf);
    expect(fixup.unbind).toEqual([
      { areaId: "NRT-001-01", polygonId: "poly-multi" },
      { areaId: "NRT-002-03", polygonId: "poly-multi" },
    ]);
  });

  it("splitFrom が無い ChangeSet では何もしない", () => {
    const fixup = computeBindingFixup(emptyChangeSet(), areaOf);
    expect(fixup.bind).toEqual([]);
    expect(fixup.unbind).toEqual([]);
  });
});
