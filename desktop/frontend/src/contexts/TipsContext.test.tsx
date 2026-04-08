import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  TipsProvider,
  useTips,
  TIP_INTERVAL_MS,
  TIP_DISPLAY_MS,
  TIP_MAX_ACTIVE,
  TIP_EXIT_MS,
} from "./TipsContext";
import {
  SettingsService,
  type SettingsBindingAPI,
} from "../services/settings-service";

function createMockApi(initialHidden: string[] = []): SettingsBindingAPI {
  const hidden = new Set(initialHidden);
  return {
    GetHiddenTipKeys: vi.fn(async () => Array.from(hidden)),
    SetTipHidden: vi.fn(async (key: string, h: boolean) => {
      if (h) hidden.add(key);
    }),
    ResetHiddenTips: vi.fn(async () => {
      hidden.clear();
    }),
    GetLocale: vi.fn(async () => ""),
    SetLocale: vi.fn(async () => {}),
  };
}

function renderWithProvider(api: SettingsBindingAPI) {
  const service = new SettingsService(api);
  const consumer = { current: null as ReturnType<typeof useTips> | null };
  function Consumer() {
    consumer.current = useTips();
    const { activeTips } = useTips();
    return (
      <ul data-testid="active">
        {activeTips.map((t) => (
          <li key={t.id} data-key={t.key}>
            {t.key}
          </li>
        ))}
      </ul>
    );
  }
  render(
    <TipsProvider service={service}>
      <Consumer />
    </TipsProvider>,
  );
  return consumer;
}

async function flushHiddenKeysLoad() {
  // TipsProvider が mount 時に非同期で hiddenKeys をロードするため、promise を flush
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("TipsContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("showTips: INTERVAL_MS 経過ごとに queue から 1 件ずつ activeTips に積む", async () => {
    const consumer = renderWithProvider(createMockApi());
    await flushHiddenKeysLoad();

    act(() => {
      consumer.current!.showTips(["a", "b", "c"]);
    });
    // 1件目は即時に積まれる
    expect(screen.getByTestId("active").children).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(TIP_INTERVAL_MS);
    });
    expect(screen.getByTestId("active").children).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(TIP_INTERVAL_MS);
    });
    expect(screen.getByTestId("active").children).toHaveLength(3);
  });

  it("新規 tip は先頭に積まれる (unshift)", async () => {
    const consumer = renderWithProvider(createMockApi());
    await flushHiddenKeysLoad();

    act(() => {
      consumer.current!.showTips(["a", "b"]);
    });
    act(() => {
      vi.advanceTimersByTime(TIP_INTERVAL_MS);
    });
    const items = Array.from(
      screen.getByTestId("active").children,
    ) as HTMLElement[];
    expect(items[0].dataset.key).toBe("b");
    expect(items[1].dataset.key).toBe("a");
  });

  it("DISPLAY_MS 経過後に activeTips から自動削除", async () => {
    const consumer = renderWithProvider(createMockApi());
    await flushHiddenKeysLoad();

    act(() => {
      consumer.current!.showTips(["a"]);
    });
    expect(screen.getByTestId("active").children).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(TIP_DISPLAY_MS + TIP_EXIT_MS + 10);
    });
    expect(screen.getByTestId("active").children).toHaveLength(0);
  });

  it("hiddenKeys に含まれるキーはスキップする", async () => {
    const consumer = renderWithProvider(createMockApi(["b"]));
    await flushHiddenKeysLoad();

    act(() => {
      consumer.current!.showTips(["a", "b", "c"]);
    });
    act(() => {
      vi.advanceTimersByTime(TIP_INTERVAL_MS * 3);
    });
    const keys = Array.from(screen.getByTestId("active").children).map(
      (el) => (el as HTMLElement).dataset.key,
    );
    expect(keys).not.toContain("b");
    expect(keys).toContain("a");
    expect(keys).toContain("c");
  });

  it("同一キーが既に活性または queue にある場合は重複投入をスキップ", async () => {
    const consumer = renderWithProvider(createMockApi());
    await flushHiddenKeysLoad();

    act(() => {
      consumer.current!.showTips(["a"]);
    });
    act(() => {
      consumer.current!.showTips(["a", "a", "a"]);
    });
    // DISPLAY_MS 未満の間に確認（同一キーは 1 件しか存在しないはず）
    act(() => {
      vi.advanceTimersByTime(TIP_INTERVAL_MS);
    });
    const keys = Array.from(screen.getByTestId("active").children).map(
      (el) => (el as HTMLElement).dataset.key,
    );
    expect(keys.filter((k) => k === "a")).toHaveLength(1);
  });

  it(`同時表示上限 ${TIP_MAX_ACTIVE} 件、超過時は最古から即時除去`, async () => {
    const consumer = renderWithProvider(createMockApi());
    await flushHiddenKeysLoad();

    const keys = Array.from({ length: TIP_MAX_ACTIVE + 2 }, (_, i) => `k${i}`);
    act(() => {
      consumer.current!.showTips(keys);
    });
    // 全て積むまで待つ
    act(() => {
      vi.advanceTimersByTime(TIP_INTERVAL_MS * keys.length);
    });
    expect(screen.getByTestId("active").children.length).toBeLessThanOrEqual(
      TIP_MAX_ACTIVE,
    );
  });

  it("hideTip: 該当 tip を activeTips から除去し、バインディング経由で永続化", async () => {
    const api = createMockApi();
    const consumer = renderWithProvider(api);
    await flushHiddenKeysLoad();

    act(() => {
      consumer.current!.showTips(["a"]);
    });
    expect(screen.getByTestId("active").children).toHaveLength(1);

    await act(async () => {
      await consumer.current!.hideTip("a");
    });
    expect(screen.getByTestId("active").children).toHaveLength(0);
    expect(api.SetTipHidden).toHaveBeenCalledWith("a", true);

    // hideTip 後は再度 showTips しても出ない
    act(() => {
      consumer.current!.showTips(["a"]);
    });
    expect(screen.getByTestId("active").children).toHaveLength(0);
  });

  it("resetHiddenTips: hiddenKeys をクリアし、バインディング経由で永続化", async () => {
    const api = createMockApi(["a"]);
    const consumer = renderWithProvider(api);
    await flushHiddenKeysLoad();

    // 初期状態では a は hidden
    act(() => {
      consumer.current!.showTips(["a"]);
    });
    expect(screen.getByTestId("active").children).toHaveLength(0);

    await act(async () => {
      await consumer.current!.resetHiddenTips();
    });
    expect(api.ResetHiddenTips).toHaveBeenCalled();

    // リセット後は a も表示される
    act(() => {
      consumer.current!.showTips(["a"]);
    });
    expect(screen.getByTestId("active").children).toHaveLength(1);
  });
});
