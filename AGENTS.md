# etzhayyim-project-ses — SES案件・状況 ingest pipeline

ADR: `90-docs/adr/2605120000-ses-anken-jokyo-ingest-langgraph.md`
Nanoid: `s3s4nk3n` | DID: `did:web:ses.etzhayyim.com` | Tier: T3 | Non-federable

## Architecture

```
SES案件 email (Outlook/Exchange)
   ↓ Phase 3: com.etzhayyim.apps.microsoft.listMails (15min pull)
CF Worker (ses.etzhayyim.com / s3s4nk3n.etzhayyim.com)
   ↓ XRPC com.etzhayyim.apps.ses.ingestAnken
bpmn-dispatcher → LangGraph Server (ses-langgraph.mitama-udf.svc:8000)
   ↓ 6-node StateGraph
   parse_source → classify_anken → extract_details
   → update_jokyo → persist → emit_audit
   ↓ asyncpg INSERT
RisingWave vertex_ses_anken + vertex_ses_jokyo (append-only)
```

**CF Worker** (`60-apps/etzhayyim-project-ses/src/app.ts`):
- No `env.HYPERDRIVE` binding (ADR-2605111200). No DB writes in Worker.
- Auth: Bearer `sk_live_*` or ES256 JWT.
- NSID guard: only `com.etzhayyim.apps.ses.*` passes.
- Forwards to `BPMN_DISPATCHER_URL` with `x-internal-trust` HMAC.

**LangGraph** (`40-engine/kotoba/crates/kotoba-kotodama/py/src/kotodama/ses/`):
- `state.py`: `SesIngestState` + `AnkenExtraction` Pydantic v2 models
- `graph.py`: 6-node StateGraph skeleton (Phase 1 stubs)
- Phase 2: `extractor.py`, `classifier.py`, `jokyo.py`, `persistence.py`, `server.py`
- Phase 3: `outlook_pull.py` (15-min differential fetch), `cron_main.py` (CronJob entrypoint), `server.py /cron/outlook-pull`

**Helm**: `50-infra/vultr/mitama-ses-pool/`

## NSID Lexicons

| NSID | Type | File |
|---|---|---|
| `com.etzhayyim.apps.ses.ingestAnken` | procedure | `00-contracts/lexicons/com/etzhayyim/apps/ses/ingestAnken.json` |
| `com.etzhayyim.apps.ses.updateJokyo` | procedure | `00-contracts/lexicons/com/etzhayyim/apps/ses/updateJokyo.json` |
| `com.etzhayyim.apps.ses.getAnken` | query | `00-contracts/lexicons/com/etzhayyim/apps/ses/getAnken.json` |
| `com.etzhayyim.apps.ses.listAnken` | query | `00-contracts/lexicons/com/etzhayyim/apps/ses/listAnken.json` |
| `com.etzhayyim.apps.ses.listJokyo` | query | `00-contracts/lexicons/com/etzhayyim/apps/ses/listJokyo.json` |
| `com.etzhayyim.apps.ses.coverage` | query | `00-contracts/lexicons/com/etzhayyim/apps/ses/coverage.json` |

## Schema (RisingWave vertex tables — append-only)

- `vertex_ses_anken` — 案件マスタ (1 row per unique anken)
- `vertex_ses_jokyo` — 状況遷移ログ (append-only, no UPDATE)
- `vertex_ses_client` — 発注元クライアント
- `vertex_ses_engineer` — 対象エンジニア
- `vertex_ses_run` — ingest run log
- `edge_ses_anken_client` — anken ↔ client 関係
- `edge_ses_anken_engineer` — anken ↔ engineer 関係

## Jokyo (状況) State Machine

```
提案中 → 選考中 → 契約 → 稼働中 → 終了
                        ↘ 見送り
                        ↘ 中途終了
```

Forbidden: backward transitions (e.g. 稼働中 → 提案中). Skipped silently (`jokyo_skipped=true`), never error.

## CRITICAL Forbidden Patterns

1. **No HYPERDRIVE in wrangler.jsonc** — CF Worker has no DB binding (ADR-2605111200)
2. **No ON CONFLICT** in SQL — append-only log semantics (ADR record-log)
3. **No UPDATE on vertex_ses_jokyo** — jokyo is append-only; forbidden transitions skip silently
4. **No float in lexicons** — AT Protocol has no float type; yen amounts are integer
5. **No AT Repo emit** — ses data is non-federable, asyncpg INSERT only
6. **No LLM model hardcode** — use `resolveModelId()` from `kotodama.llm`
7. **No backward jokyo transition** — use `is_forbidden_transition()` from `state.py`
8. **No PDS createRecord for domain data** — asyncpg → RisingWave only

## Email Sources

SES案件 emails arrive at:
- `j.kawasaki@etzhayyim.com` (Outlook/Exchange)
- `agent@etzhayyim.com` (Outlook/Exchange)

Phase 3: Outlook cron pull via `com.etzhayyim.apps.microsoft.listMails` (15min differential).
