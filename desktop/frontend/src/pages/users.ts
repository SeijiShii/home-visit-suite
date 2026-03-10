// ユーザー管理ページ
// ロール管理、グループ管理、タグ管理、招待・罷免
export function renderUsers(container: HTMLElement) {
  container.innerHTML = `
    <h1>Users</h1>
    <section>
      <h2>Members</h2>
      <p>No members</p>
    </section>
    <section>
      <h2>Groups</h2>
      <p>No groups</p>
    </section>
  `;
}
