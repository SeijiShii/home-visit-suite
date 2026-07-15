// 端末の全初期化（デバイス失効時のワイプ）。
// 別端末からこの端末の登録が削除されたとき（自分が掲載から消えた自ユーザー鍵
// 署名の高 rev ロスターを受理したとき）に呼ぶ。identity・全グループの DB・
// localStorage をすべて消しオンボーディングへ戻す（docs/wants/01「削除の意味」。
// 部分ワイプの選択肢は設けない＝2026-07-15 ユーザー決定）。

/** 初期化後のオンボーディングに「削除されました」通知を出すためのフラグ。 */
export const DEVICE_REMOVED_NOTICE_KEY = "hvs.deviceRemovedNotice";

/**
 * この端末を全初期化して再読み込みする。
 * - OPFS（sqlite の実ファイル）の削除は best-effort（SAHPool が Access Handle を
 *   保持している間は失敗し得る。スロット参照ごと localStorage が消えるため、
 *   残ったファイルは参照されない孤児になるだけで実害はない）
 * - `stop` には LinkSelf セッションの graceful stop を渡す（Access Handle 解放）
 */
export async function wipeThisDevice(
  stop?: () => Promise<void>,
): Promise<void> {
  try {
    await stop?.();
  } catch {
    // 停止失敗でもワイプは続行する
  }
  try {
    const root = await navigator.storage.getDirectory();
    // TS の標準型定義に非同期イテレータ（keys()）が未収載のため補う。
    const iterable = root as FileSystemDirectoryHandle & {
      keys(): AsyncIterableIterator<string>;
    };
    const names: string[] = [];
    for await (const name of iterable.keys()) {
      names.push(name);
    }
    for (const name of names) {
      try {
        await root.removeEntry(name, { recursive: true });
      } catch {
        // Access Handle 保持中などで消せない分は孤児として残す（実害なし）
      }
    }
  } catch {
    // OPFS 非対応環境（テスト等）では localStorage の消去だけでよい
  }
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(DEVICE_REMOVED_NOTICE_KEY, "1");
  } catch {
    // ignore
  }
  globalThis.location?.reload?.();
}
