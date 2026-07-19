<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  const JOKYO_OPTIONS = ['', '提案中', '選考中', '契約', '稼働中', '終了', '見送り', '中途終了'];

  const JOKYO_COLORS: Record<string, string> = {
    '提案中': '#4e9eff',
    '選考中': '#a78bfa',
    '契約': '#34d399',
    '稼働中': '#10b981',
    '終了': '#64748b',
    '見送り': '#f87171',
    '中途終了': '#fb923c',
  };

  function jokyoColor(j: string): string {
    return JOKYO_COLORS[j] ?? '#96a6b8';
  }

  function fmtYen(v: number | null): string {
    if (v == null) return '—';
    return `¥${v.toLocaleString('ja-JP')}`;
  }
</script>

<svelte:head>
  <title>SES案件一覧</title>
</svelte:head>

<main>
  <header>
    <h1>SES案件一覧</h1>
    <form method="GET" action="/anken" class="filters">
      <label>
        <span>状況フィルター</span>
        <select name="jokyo" on:change={(e) => (e.target as HTMLFormElement).form?.submit()}>
          {#each JOKYO_OPTIONS as opt}
            <option value={opt} selected={data.jokyo === opt}>{opt || 'すべて'}</option>
          {/each}
        </select>
      </label>
      <button type="submit">絞り込み</button>
    </form>
  </header>

  {#if data.error}
    <div class="error-banner">
      <strong>エラー:</strong> {data.error}
      {#if data.error.includes('SES_MCP_URL is not configured')}
        <p class="hint">SES_MCP_URL 環境変数を設定してください (wrangler.jsonc 参照)。</p>
      {/if}
    </div>
  {:else}
    <p class="count">{data.total} 件</p>

    {#if data.anken.length === 0}
      <p class="muted">該当する案件がありません。</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>クライアント</th>
              <th>会社名</th>
              <th>状況</th>
              <th>開始月</th>
              <th>終了月</th>
              <th>単価 (下限)</th>
              <th>単価 (上限)</th>
              <th>勤務地</th>
              <th>リモート</th>
              <th>登録日</th>
            </tr>
          </thead>
          <tbody>
            {#each data.anken as a}
              <tr>
                <td><a href="/anken/{encodeURIComponent(a.vertexId)}">{a.clientName || '—'}</a></td>
                <td>{a.clientCompany || '—'}</td>
                <td>
                  {#if a.jokyoCurrent}
                    <span class="badge" style="--c: {jokyoColor(a.jokyoCurrent)}">{a.jokyoCurrent}</span>
                  {:else}
                    <span class="muted">—</span>
                  {/if}
                </td>
                <td>{a.startMonth || '—'}</td>
                <td>{a.endMonth || '—'}</td>
                <td>{fmtYen(a.rateLowerYen)}</td>
                <td>{fmtYen(a.rateUpperYen)}</td>
                <td>{a.workLocation || '—'}</td>
                <td>{a.remoteOk ? '○' : '×'}</td>
                <td>{a.createdAt ? a.createdAt.slice(0, 10) : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        {#if data.page > 0}
          <a href="/anken?jokyo={encodeURIComponent(data.jokyo)}&page={data.page - 1}">← 前へ</a>
        {/if}
        <span>ページ {data.page + 1}</span>
        {#if (data.page + 1) * data.limit < data.total}
          <a href="/anken?jokyo={encodeURIComponent(data.jokyo)}&page={data.page + 1}">次へ →</a>
        {/if}
      </div>
    {/if}
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #11161d;
    color: #eef4f8;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  main { min-height: 100vh; padding: 24px; }
  header { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; margin-bottom: 16px; }
  h1 { margin: 0; font-size: clamp(22px, 4vw, 36px); }
  .filters { display: flex; align-items: center; gap: 10px; }
  .filters label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #96a6b8; }
  select {
    background: #171f28; border: 1px solid #2b3948; color: #eef4f8;
    border-radius: 6px; padding: 6px 10px; font-size: 13px;
  }
  button {
    background: #1e3a5f; border: 1px solid #2b5282; color: #90cdf4;
    border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer;
  }
  button:hover { background: #2a4e7c; }
  .count { margin: 0 0 12px; font-size: 13px; color: #96a6b8; }
  .muted { color: #96a6b8; }
  .error-banner {
    border: 1px solid #f87171; border-radius: 8px; background: #1a0a0a;
    padding: 16px; margin-bottom: 16px; color: #fca5a5;
  }
  .hint { margin: 8px 0 0; font-size: 12px; color: #96a6b8; }
  .table-wrap { overflow-x: auto; }
  table {
    width: 100%; border-collapse: collapse; font-size: 13px;
    background: #171f28; border: 1px solid #2b3948; border-radius: 8px;
    overflow: hidden;
  }
  th {
    background: #1e2a38; color: #96a6b8; font-weight: 600;
    padding: 10px 12px; text-align: left; white-space: nowrap;
    border-bottom: 1px solid #2b3948;
  }
  td { padding: 9px 12px; border-bottom: 1px solid #1e2a38; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #1e2a38; }
  a { color: #4e9eff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 12px; font-weight: 600;
    color: var(--c); border: 1px solid var(--c);
    background: color-mix(in srgb, var(--c) 12%, transparent);
  }
  .pagination {
    display: flex; align-items: center; gap: 16px;
    margin-top: 16px; font-size: 13px; color: #96a6b8;
  }
  .pagination a { color: #4e9eff; }
  @media (max-width: 760px) { main { padding: 16px; } }
</style>
