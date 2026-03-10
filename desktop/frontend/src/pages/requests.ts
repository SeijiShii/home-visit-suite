// 申請管理ページ
// 場所追加申請、地図更新申請、訪問不可申請の処理
export function renderRequests(container: HTMLElement) {
  container.innerHTML = `
    <h1>Requests</h1>
    <section>
      <h2>Pending</h2>
      <p>No pending requests</p>
    </section>
    <section>
      <h2>Resolved</h2>
      <p>No resolved requests</p>
    </section>
  `;
}
