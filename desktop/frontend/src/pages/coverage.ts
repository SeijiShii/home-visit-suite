// 網羅管理ページ
// 網羅活動データ、進捗管理、網羅予定管理、ヒートマップ
export function renderCoverage(container: HTMLElement) {
  container.innerHTML = `
    <h1>Coverage</h1>
    <section>
      <h2>Progress</h2>
      <p>No coverage data</p>
    </section>
    <section>
      <h2>Plans</h2>
      <p>No coverage plans</p>
    </section>
  `;
}
