// UserRepository のインメモリ実装。
// LinkSelf TS アダプタが完成するまでの開発・テスト用。
// 参照実装: shared/testdata（Go の InMemoryRepos）

import type { Invitation } from "../../domain/models/invitation";
import type { Tag, User } from "../../domain/models/user";
import type { UserRepository } from "../../domain/repositories/user-repository";

export class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();
  private tags = new Map<string, Tag>();
  private invitations = new Map<string, Invitation>();

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
