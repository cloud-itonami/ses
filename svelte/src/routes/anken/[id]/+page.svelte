<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

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

  function fmtYen(v: number | null | undefined): string {
    if (v == null) return '—';
    return `¥${v.toLocaleString('ja-JP')}`;
  }
</script>

<svelte:head>
  <title>{data.anken ? `${data.anken.clientName} — SES案件` : 'SES案件'}</title>
</svelte:head>

<main>
  <nav><a href="/anken">← 案件一覧</a></nav>

  {#if data.error}
    <div class="error-banner">
      <strong>エラー:</strong> {data.error}
    </div>
  {:else if !data.anken}
    <p class="muted">案件が見つかりません。</p>
  {:else}
    {@const a = data.anken}
    <header>
      <div class="meta">
        {#if a.jokyoCurrent}
          <span class="badge" style="--c: {jokyoColor(a.jokyoCurrent)}">{a.jokyoCurrent}</span>
        {/if}
        <span class="source">{a.sourceKind || '—'}</span>
      </div>
      <h1>{a.clientName || '—'}</h1>
      <p class="company">{a.clientCompany || '—'}</p>
    </header>

    <div class="grid">
      <section class="card">
        <h2>案件概要</h2>
        <dl>
          <dt>開始月</dt><dd>{a.startMonth || '—'}</dd>
          <dt>終了月</dt><dd>{a.endMonth || '—'}</dd>
          <dt>単価 (下限)</dt><dd>{fmtYen(a.rateLowerYen)}</dd>
          <dt>単価 (上限)</dt><dd>{fmtYen(a.rateUpperYen)}</dd>
          <dt>勤務地</dt><dd>{a.workLocation || '—'}</dd>
          <dt>リモート</dt><dd>{a.remoteOk ? '○' : '×'}</dd>
          <dt>登録日</dt><dd>{a.createdAt ? a.createdAt.slice(0, 10) : '—'}</dd>
        </dl>
      </section>

      <section class="card">
        <h2>スキル・備考</h2>
        {#if a.skillCsv}
          <div class="skills">
            {#each a.skillCsv.split(',').filter(Boolean) as skill}
              <span class="skill-tag">{skill.trim()}</span>
            {/each}
          </div>
        {:else}
          <p class="muted">スキル情報なし</p>
        {/if}
        {#if a.notes}
          <p class="notes">{a.notes}</p>
        {/if}
      </section>
    </div>

    <section class="card timeline-card">
      <h2>状況遷移ログ ({data.jokyoLog.length} 件)</h2>
      {#if data.jokyoLog.length === 0}
        <p class="muted">状況ログがありません。</p>
      {:else}
        <ol class="timeline">
          {#each data.jokyoLog as entry, i}
            <li>
              <span class="tl-dot" style="--c: {jokyoColor(entry.jokyo)}"></span>
              <div class="tl-content">
                <span class="tl-jokyo" style="color: {jokyoColor(entry.jokyo)}">{entry.jokyo}</span>
                {#if entry.jokyoPrev}
                  <span class="tl-prev"> ← {entry.jokyoPrev}</span>
                {/if}
                {#if entry.notes}
                  <p class="tl-notes">{entry.notes}</p>
                {/if}
                <time class="tl-time">{entry.createdAt ? entry.createdAt.slice(0, 16).replace('T', ' ') : '—'}</time>
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #11161d;
    color: #eef4f8;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  main { min-height: 100vh; padding: 24px; max-width: 900px; }
  nav { margin-bottom: 20px; }
  nav a { color: #4e9eff; font-size: 13px; text-decoration: none; }
  nav a:hover { text-decoration: underline; }
  .error-banner {
    border: 1px solid #f87171; border-radius: 8px; background: #1a0a0a;
    padding: 16px; color: #fca5a5;
  }
  .muted { color: #96a6b8; }
  header { margin-bottom: 20px; }
  .meta { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .source { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; }
  h1 { margin: 0 0 4px; font-size: clamp(24px, 4vw, 36px); }
  .company { margin: 0; color: #96a6b8; font-size: 15px; }
  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 600;
    color: var(--c); border: 1px solid var(--c);
    background: color-mix(in srgb, var(--c) 12%, transparent);
  }
  .grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;
  }
  .card {
    border: 1px solid #2b3948; border-radius: 8px; background: #171f28; padding: 16px;
  }
  .timeline-card { margin-bottom: 0; }
  h2 { margin: 0 0 14px; font-size: 12px; text-transform: uppercase; color: #96a6b8; font-weight: 700; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 13px; margin: 0; }
  dt { color: #96a6b8; white-space: nowrap; }
  dd { margin: 0; }
  .skills { display: flex; flex-wrap: wrap; gap: 6px; }
  .skill-tag {
    background: #1e2a38; border: 1px solid #2b3948;
    border-radius: 4px; padding: 3px 8px; font-size: 12px;
  }
  .notes { margin: 12px 0 0; font-size: 13px; color: #c5d8e8; line-height: 1.6; }
  ol.timeline { list-style: none; margin: 0; padding: 0; }
  ol.timeline li {
    display: flex; gap: 12px; padding-bottom: 16px;
    border-left: 2px solid #2b3948; margin-left: 8px; padding-left: 20px; position: relative;
  }
  ol.timeline li:last-child { border-left-color: transparent; padding-bottom: 0; }
  .tl-dot {
    position: absolute; left: -7px; top: 2px;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--c); border: 2px solid #171f28;
    flex-shrink: 0;
  }
  .tl-content { flex: 1; min-width: 0; }
  .tl-jokyo { font-weight: 700; font-size: 14px; }
  .tl-prev { font-size: 12px; color: #64748b; margin-left: 6px; }
  .tl-notes { margin: 4px 0 0; font-size: 12px; color: #96a6b8; line-height: 1.5; }
  .tl-time { display: block; margin-top: 4px; font-size: 11px; color: #64748b; font-family: ui-monospace, monospace; }
  @media (max-width: 640px) {
    main { padding: 16px; }
    .grid { grid-template-columns: 1fr; }
  }
</style>
