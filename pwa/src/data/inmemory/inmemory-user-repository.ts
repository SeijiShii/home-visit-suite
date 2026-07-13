// UserRepository のインメモリ実装。
// LinkSelf TS アダプタが完成するまでの開発・テスト用。
// 参照実装: shared/testdata（Go の InMemoryRepos）

import type { Invitation } from "../../domain/models/invitation";
import type { Tag, User } from "../../domain/models/user";
import type { UserRepository } from "../../domain/repositories/user-repository";
import { backedMap } from "../localstorage/persistent-map";

export class InMemoryUserRepository implements UserRepository {
  private users: Map<string, User>;
  private tags: Map<string, Tag>;
  private invitations: Map<string, Invitation>;

  // storagePrefix 指定時は localStorage 永続（runtime）、未指定はインメモリ（テスト）。
  // 永続が無いと、参加受理で記録したメンバー（onMemberJoined→saveUser）が
  // リロードで消える。
  constructor(storagePrefix?: string) {
    this.users = backedMap(storagePrefix, "users");
    this.tags = backedMap(storagePrefix, "tags");
    this.invitations = backedMap(storagePrefix, "invitations");
  }

  async listUsers(): Promise<User[]> {
    return [...this.users.values()].map(cloneUser);
  }

  async getUser(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? cloneUser(user) : null;
  }

  async saveUser(user: User): Promise<void> {
    this.users.set(user.id, cloneUser(user));
  }

  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
  }

  async listTags(): Promise<Tag[]> {
    return [...this.tags.values()].map((tag) => ({ ...tag }));
  }

  async saveTag(tag: Tag): Promise<void> {
    this.tags.set(tag.id, { ...tag });
  }

  async deleteTag(id: string): Promise<void> {
    this.tags.delete(id);
  }

  async listInvitations(inviteeId: string): Promise<Invitation[]> {
    return [...this.invitations.values()]
      .filter((inv) => inv.inviteeId === inviteeId)
      .map((inv) => ({ ...inv }));
  }

  async getInvitation(id: string): Promise<Invitation | null> {
    const inv = this.invitations.get(id);
    return inv ? { ...inv } : null;
  }

  async saveInvitation(inv: Invitation): Promise<void> {
    this.invitations.set(inv.id, { ...inv });
  }
}

function cloneUser(user: User): User {
  return { ...user, tagIds: [...user.tagIds] };
}
