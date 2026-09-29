# ses

**名乗り**: `ses` is a three-letter acronym and says nothing on its own. It is
**SES — システムエンジニアリングサービス**: the Japanese IT-contracting practice
of placing engineers on client projects. This repo is the **案件 (anken, open
placements) and 状況 (jokyo, placement status) plane** for that practice — a
pipeline that ingests SES offers arriving by email, extracts each 案件 with an
LLM, tracks its 状況 through a fixed state machine, and serves the result as an
XRPC / MCP surface plus a small AppView.

It was extracted verbatim from `etzhayyim/root`
(`60-apps/etzhayyim-project-ses`, 23 files / 46,292 bytes at tree
`c4538d01` — see `migration.edn` for the exact source revision) and is
registered in the west manifest as `orgs/cloud-itonami/ses`. The repo still
carries exactly one commit, the extraction itself.

## Honest status: this is a seed, and it is not deployed

Measured 2026-08-26 — every claim below is a command you can re-run, and the
commands are in [docs/operator-quickstart.md](docs/operator-quickstart.md).

**None of this repo's own hosts resolve in DNS.** `etzhayyim.com` and sibling
services (`atproto.`, `authn.`) answer from Cloudflare; the two routes declared
in `wrangler.jsonc` (`ses.etzhayyim.com`, `s3s4nk3n.etzhayyim.com`) and *all
three* backends this code talks to (`dispatcher.`, `mcp.`, `ses-api.`) return
no answer. Nothing here is serving traffic, and nothing it would call is
reachable. `npm run smoke` — which curls `https://ses.etzhayyim.com/health` —
cannot succeed today.

**`AGENTS.md` describes the monorepo, not this repo.** It points at
`60-apps/etzhayyim-project-ses/src/app.ts`, `00-contracts/lexicons/…`,
`40-engine/kotoba/crates/kotoba-kotodama/py/…` and `50-infra/vultr/…`. Only the
first has a counterpart here (as `src/app.ts`); the lexicon JSONs, the Python
LangGraph package and the Helm chart were **not** part of the extraction. Read
`AGENTS.md` as design intent inherited from upstream, not as a map of this
tree. Same for `lg/Dockerfile`, whose build needs
`--build-context py=../../../40-engine/…` — a path outside this repo.

**Three implementations of one surface, and the deployed one is not the
documented one.** This is the finding most likely to mislead you:

| what | entry | backend it calls | auth it enforces |
|---|---|---|---|
| Hono dispatcher | `src/app.ts` | `BPMN_DISPATCHER_URL` (`dispatcher.etzhayyim.com`), `x-internal-trust` HMAC | `Bearer` **required**, but never verified — an `sk_live_`/`sk_test_` prefix or any 3-part JWT whose payload base64-decodes is accepted |
| SvelteKit XRPC proxy | `svelte/src/routes/xrpc/[...path]/+server.ts` | `AGENTGATEWAY_MCP_ROUTER_URL` (`mcp.etzhayyim.com`) as MCP `tools/call` | **none** — incoming headers are forwarded as-is |
| SvelteKit AppView loaders | `svelte/src/routes/anken/**` via `svelte/src/lib/server/mcp.ts` | `SES_MCP_URL` + `/mcp` (`ses-api.etzhayyim.com`), `x-api-key` | **none** |

`wrangler.jsonc` sets `main` to `svelte/.svelte-kit/cloudflare/_worker.js`.
**`src/app.ts` is therefore not on the deployment path at all** — a deploy from
this repo ships rows 2 and 3, and `AGENTS.md` documents only row 1. Whichever
row survives, the auth story has to be settled before anything is served: two
of the three surfaces gate nothing, and the third gates on a token it does not
check. Nothing is exposed today only because no DNS points here.

## Layout

| path | what it is |
|---|---|
| `src/app.ts`, `src/dispatcher.ts` | Hono Worker: `/health`, `/_app/meta`, and `/xrpc/com.etzhayyim.apps.ses.*` forwarded to the BPMN dispatcher. Typechecks; not deployed. |
| `svelte/` | SvelteKit edge BFF (`adapter-cloudflare`): landing page, 案件 list and detail pages, and a catch-all `/xrpc/[...path]` → MCP proxy. This is what `wrangler.jsonc` builds and deploys. |
| `svelte/src/lib/contracts/ses-mcp.ts` | The one place the domain shape is written down: `listAnken` / `getAnken` / `listJokyo` tool names and their `AnkenSummary` / `AnkenDetail` / `JokyoEntry` types. |
| `lg/Dockerfile` | Image for the Python LangGraph server (`kotodama.ses.server`). The package it installs is **not in this repo**. |
| `kotodama.jsonld`, `README.edn`, `migration.edn`, `NOTICE` | Extraction identity and app manifest. `migration.edn` pins `README.edn` as an allowed addition, so its `com-etzhayyim-app-ses` name is left as-is. |
| `MIGRATION-TODO.md` | Upstream TRANSFORM checklist. Only the ad-pixel line is closed; substrate / DID-bind-auth / Charter Rider items are open and were classified by domain pattern, not by detected violations. |

## 状況 (jokyo) state machine

```
提案中 → 選考中 → 契約 → 稼働中 → 終了
                        ↘ 見送り
                        ↘ 中途終了
```

Backward transitions are forbidden and, per the upstream design, are **skipped
silently** rather than raising. The enforcement lives in the Python
`kotodama.ses` package, which is not here — this repo only carries the value
list, in `src/app.ts`'s `/_app/meta` response and in the `/anken` filter
`<select>`.

## Boundary with the nearest repos

`orgs/cloud-itonami/app-bpmn` owns the BPMN process plane this app dispatches
into; this repo is a client of it, not part of it. The upstream seed continues
to live in `etzhayyim/root` — divergence is expected to happen *here*. Within
`cloud-itonami`, the ISIC industry actors are governed-actor repos with their
own facts and render planes; `ses` is not one of them, and has no governor,
ledger or facts plane.

## Rules that apply to the next change here

- **The Svelte code is on a retirement path.** Workspace rule ADR-2608260900
  (2026-08-26) makes cljs + reagent + re-frame + `jp-go-dds` the default UI
  stack and forbids authoring new `.svelte` / `.tsx` / `.jsx`. Do not extend
  `svelte/` in place; the migration itself is a separate, tracked wave.
- **Decide which surface is authoritative before deploying anything.** Shipping
  the current tree would put two unauthenticated XRPC surfaces on
  `ses.etzhayyim.com`.
