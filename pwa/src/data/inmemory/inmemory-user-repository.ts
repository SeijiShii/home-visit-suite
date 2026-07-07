// UserRepository のインメモリ実装。
// LinkSelf TS アダプタが完成するまでの開発・テスト用。
// 参照実装: shared/testdata（Go の InMemoryRepos）

import type { Tag, User } from "../../domain/models/user";
import type { UserRepository } from "../../domain/repositories/user-repository";

export class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();
  private tags = new Map<string, Tag>();

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
}

function cloneUser(user: User): User {
  return { ...user, tagIds: [...user.tagIds] };
}
