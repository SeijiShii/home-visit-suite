// localStorage に write-through 永続化する Map。
// 各 InMemory リポジトリの `new Map()` を差し替えるだけで、値の追加・削除が
// 即座に localStorage へ反映され、再読み込み後も復元される。
//
// LinkSelf TS アダプタ（暗号化された永続層）完成までの開発 / 単体 PWA 用ブリッジ。
// 値はドメインモデル（タイムスタンプは ISO 文字列で保持され Date フィールドは無い）で
// JSON 直列化が安全であることを前提とする。

export class PersistentMap<V> extends Map<string, V> {
  constructor(
    private readonly storageKey: string,
    private readonly storage: Storage = localStorage,
  ) {
    super();
    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const entries = JSON.parse(raw) as [string, V][];
        for (const [k, v] of entries) super.set(k, v);
      }
    } catch {
      // 破損データは無視して空で開始する（機能は継続）。
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify([...this.entries()]));
    } catch {
      // 容量超過・プライベートモード等では黙って諦める。
    }
  }

  override set(key: string, value: V): this {
    super.set(key, value);
    this.persist();
    return this;
  }

  override delete(key: string): boolean {
    const existed = super.delete(key);
    if (existed) this.persist();
    return existed;
  }

  override clear(): void {
    super.clear();
    this.persist();
  }
}

/**
 * runtime 用に永続 Map、テスト用に通常 Map を返すファクトリ。
 * `storagePrefix` が未指定なら永続化しない（テスト・インメモリ動作）。
 */
export function backedMap<V>(
  storagePrefix: string | undefined,
  name: string,
): Map<string, V> {
  return storagePrefix
    ? new PersistentMap<V>(`${storagePrefix}:${name}`)
    : new Map<string, V>();
}
