// メンバー・タグの永続化インターフェース。
// 参照実装: shared/domain/user_repository.go（UserRepository）
//
// PWA では実装をアダプタとして差し替える:
// - InMemoryUserRepository（data/inmemory/、開発・テスト用の先行実装）
// - LinkSelf TS 実装のアダプタ（LinkSelf TS 完成後に追加）

import type { Invitation } from "../models/invitation";
import type { Tag, User } from "../models/user";

export interface UserRepository {
  // User
  listUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  deleteUser(id: string): Promise<void>;

  // Tag (メンバータグ)
  listTags(): Promise<Tag[]>;
  saveTag(tag: Tag): Promise<void>;
  deleteTag(id: string): Promise<void>;

  // Invitation
  listInvitations(inviteeId: string): Promise<Invitation[]>;
  getInvitation(id: string): Promise<Invitation | null>;
  saveInvitation(inv: Invitation): Promise<void>;
}
