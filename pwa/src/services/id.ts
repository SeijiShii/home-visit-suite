// エンティティ ID 生成。
// Go 参照実装は time.Now().UnixNano() を使うが、JS の Date.now() はミリ秒精度で
// 同一ミリ秒内の衝突があり得るため、単調増加カウンタを併用する。

let counter = 0;

export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}
