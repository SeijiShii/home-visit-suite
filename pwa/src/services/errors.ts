// サービス層の構造化エラー。
// 参照実装: shared/service/errors.go

export type ErrCode =
  | "not_found"
  | "permission_denied"
  | "already_exists"
  | "invalid_state"
  | "exclusive_checkout" // 区域が既にチェックアウト中
  | "self_dismissal" // 管理者の自己罷免
  | "last_admin" // 最後の管理者の罷免
  | "invalid_input";

export class ServiceError extends Error {
  constructor(
    public readonly code: ErrCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "ServiceError";
  }
}

/** エラーが指定コードの ServiceError かを判定する。 */
export function isCode(err: unknown, code: ErrCode): boolean {
  return err instanceof ServiceError && err.code === code;
}
