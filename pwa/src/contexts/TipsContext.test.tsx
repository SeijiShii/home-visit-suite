// TipsContext の非表示決定（「表示しない」）が守られることのテスト。
// 特に、非表示キーの非同期ロード完了前に showTips が呼ばれても、
// 保存済みの非表示 tip が表示されない（ロード完了を待ってフィルタする）こと。

import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { TipsProvider, useTips } from "./TipsContext";
import {
  SettingsService,
  type SettingsBindingAPI,
} from "../services/settings-service";

/** GetHiddenTipKeys / SetTipHidden の解決タイミングを外から制御できる SettingsBindingAPI。 */
function makeDeferredApi() {
  let resolveHidden: (keys: string[]) => void = () => {};
  const hiddenPromise = new Promise<string[]>((resolve) => {
    resolveHidden = resolve;
  });
  let resolveWrite: () => void = () => {};
  const writePromise = new Promise<void>((resolve) => {
    resolveWrite = resolve;
  });
  const hiddenWrites: string[] = [];
  const api: SettingsBindingAPI = {
    GetHiddenTipKeys: () => hiddenPromise,
    SetTipHidden: (key, hidden) => {
      if (hidden) hiddenWrites.push(key);
      return writePromise;
    },
    ResetHiddenTips: async () => {},
    GetLocale: async () => "",
    SetLocale: async () => {},
    GetAreaDetailRadiusKm: async () => 0,
    SetAreaDetailRadiusKm: async () => {},
  };
  return { api, resolveHidden, resolveWrite, hiddenWrites };
}

/** マウント直後に showTips を1回呼び、activeTips のキーを可視化する子。 */
function Probe({ keys }: { keys: string[] }) {
  const { showTips, activeTips } = useTips();
  useEffect(() => {
    showTips(keys);
    // マウント時に一度だけ発火させる（MapPage の editorReady 相当）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ul>
      {activeTips.map((t) => (
        <li key={t.id} data-testid="active-tip">
          {t.key}
        </li>
      ))}
    </ul>
  );
}

describe("TipsContext: 非表示決定の尊重", () => {
  it("非表示キーのロード完了前に showTips が呼ばれても、保存済み非表示 tip は表示しない", async () => {
    const { api, resolveHidden } = makeDeferredApi();
    const service = new SettingsService(api);

    render(
      <TipsProvider service={service}>
        <Probe keys={["tips.map.polygon.startDraw"]} />
      </TipsProvider>,
    );

    // ロード未完了の間は何も表示されない（先走って表示しない）
    expect(screen.queryAllByTestId("active-tip")).toHaveLength(0);

    // ロード完了: startDraw は保存済み非表示
    await act(async () => {
      resolveHidden(["tips.map.polygon.startDraw"]);
    });

    // ロード完了後も非表示 tip は表示されないまま
    await waitFor(() => {
      expect(screen.queryAllByTestId("active-tip")).toHaveLength(0);
    });
  });

  it("ロード完了前に要求された非・非表示 tip は、ロード完了後に表示される", async () => {
    const { api, resolveHidden } = makeDeferredApi();
    const service = new SettingsService(api);

    render(
      <TipsProvider service={service}>
        <Probe
          keys={[
            "tips.map.polygon.startDraw",
            "tips.map.polygon.selectPolygon",
          ]}
        />
      </TipsProvider>,
    );

    // startDraw だけが保存済み非表示
    await act(async () => {
      resolveHidden(["tips.map.polygon.startDraw"]);
    });

    // selectPolygon は表示され、startDraw は表示されない
    await waitFor(() => {
      const keys = screen
        .queryAllByTestId("active-tip")
        .map((el) => el.textContent);
      expect(keys).toContain("tips.map.polygon.selectPolygon");
      expect(keys).not.toContain("tips.map.polygon.startDraw");
    });
  });

  it("hideTip は永続化完了を待たずに即座に表示から除去する", async () => {
    const { api, resolveHidden, resolveWrite, hiddenWrites } =
      makeDeferredApi();
    const service = new SettingsService(api);

    let hideTipFn: ((key: string) => Promise<void>) | null = null;
    function Capture() {
      const { hideTip } = useTips();
      hideTipFn = hideTip;
      return null;
    }

    render(
      <TipsProvider service={service}>
        <Capture />
        <Probe keys={["tips.map.polygon.moveVertex"]} />
      </TipsProvider>,
    );

    await act(async () => {
      resolveHidden([]);
    });
    await waitFor(() => {
      expect(screen.queryAllByTestId("active-tip")).toHaveLength(1);
    });

    // 永続化 (SetTipHidden) は未解決のまま hideTip を呼ぶ
    let hidePromise: Promise<void> = Promise.resolve();
    await act(async () => {
      hidePromise = hideTipFn!("tips.map.polygon.moveVertex");
    });

    // 永続化完了前でも表示からは即座に除去されている
    expect(screen.queryAllByTestId("active-tip")).toHaveLength(0);
    expect(hiddenWrites).toContain("tips.map.polygon.moveVertex");

    await act(async () => {
      resolveWrite();
      await hidePromise;
    });
  });
});
