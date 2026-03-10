// マイページ / ダッシュボード
// 通知一覧、割り当て区域、タスクリスト等を表示
export function renderDashboard(container: HTMLElement) {
  container.innerHTML = `
    <h1>Dashboard</h1>
    <section class="notifications">
      <h2>Notifications</h2>
      <p>No notifications</p>
    </section>
    <section class="assigned-areas">
      <h2>Assigned Areas</h2>
      <p>No areas assigned</p>
    </section>
  `;
}
