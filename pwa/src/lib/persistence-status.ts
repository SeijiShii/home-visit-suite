// 永続化デグレード状態の共有（軽量モジュール）。
// OPFS DB を開けず in-memory で起動したタブは、リロードでデータが消える。
// 過去にこの「無言のインメモリ化」が本番で永続喪失を見逃させた
// （learnings L-010）ため、bootstrap（linkself-services）がここに記録し、
// Layout が警告バナーを常時表示する。docs/wants/01「グループ毎のローカル DB 分離」。

let degraded = false;

/** OPFS を開けず in-memory フォールバックしたことを記録する（bootstrap 用）。 */
export function markPersistenceDegraded(): void {
  degraded = true;
}

/** このタブの永続化がデグレードしているか（Layout の警告バナー表示判定）。 */
export function isPersistenceDegraded(): boolean {
  return degraded;
}
