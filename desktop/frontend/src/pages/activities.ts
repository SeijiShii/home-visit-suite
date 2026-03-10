// 訪問活動管理ページ
// 区域チェックアウト、チーム割り当て、返却・回収、訪問記録
export function renderActivities(container: HTMLElement) {
  container.innerHTML = `
    <h1>Activities</h1>
    <section>
      <h2>Active</h2>
      <p>No active activities</p>
    </section>
    <section>
      <h2>Completed</h2>
      <p>No completed activities</p>
    </section>
  `;
}
