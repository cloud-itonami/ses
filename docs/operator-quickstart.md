# Operator quickstart

Every step below was actually executed on 2026-08-26 (Node v26.7.0 /
npm 11.19.0, macOS) against commit `e5f2b33`. Observed outputs are quoted as
measured — if a step stops matching, the repo has drifted, not this page.

## What you are operating

Two things are runnable from this repo today, both entirely local:

1. **`src/`** — the Hono Worker (`/health`, `/_app/meta`, and
   `/xrpc/com.etzhayyim.apps.ses.*` forwarded to the BPMN dispatcher). It
   typechecks. It is **not** what `wrangler.jsonc` deploys.
2. **`svelte/`** — the SvelteKit edge BFF. It typechecks, builds, and serves
   locally. `wrangler.jsonc` points `main` at its build output, so this is the
   deployable surface.

What is **not** operable from here, and why:

- **Anything against the real backends.** `ses.etzhayyim.com`,
  `s3s4nk3n.etzhayyim.com`, `ses-api.etzhayyim.com`,
  `dispatcher.etzhayyim.com` and `mcp.etzhayyim.com` all return no DNS answer
  (step 0). `npm run smoke` cannot pass; a deploy would publish to hosts that
  do not exist yet.
- **The LangGraph server.** `lg/Dockerfile` installs `kotodama.ses` from
  `--build-context py=../../../40-engine/…`, a path outside this repo. The
  package was not part of the extraction, so the image cannot be built here.
- **The 状況 state machine.** Its enforcement lives in that same Python
  package. Nothing in this tree can reject a backward 提案中 ← 稼働中
  transition, so do not read a green run below as evidence that it would.

## 0. Confirm the deployment target's reachability

Do this first; it decides whether any later result means what you think.

```bash
for h in etzhayyim.com atproto.etzhayyim.com \
         ses.etzhayyim.com s3s4nk3n.etzhayyim.com \
         ses-api.etzhayyim.com dispatcher.etzhayyim.com mcp.etzhayyim.com; do
  printf '%-32s %s\n' "$h" "$(dig +short "$h" | tr '\n' ' ')"
done
```

Measured 2026-08-26T06:16:37Z — sibling services answer, this app's own hosts
and all three of its backends do not:

```
etzhayyim.com                    104.21.51.111 172.67.179.128
atproto.etzhayyim.com            104.21.51.111 172.67.179.128
ses.etzhayyim.com
s3s4nk3n.etzhayyim.com
ses-api.etzhayyim.com
dispatcher.etzhayyim.com
mcp.etzhayyim.com
```

## 1. Typecheck the Hono Worker

```bash
npm install
npm run typecheck
```

Measured: `added 3 packages`, then `tsc --noEmit` exits 0 with no output.

Two corrections were needed to make this step exist at all, both landed with
this page:

- `npm install` used to die with `EUNSUPPORTEDPROTOCOL … workspace:*`. The
  culprit was `@etzhayyim/kotodama-host-sdk`, which is not published
  (`registry.npmjs.org` returns 404), is not any of the 4,249 projects in the
  west manifest, and is **imported by nothing** — `grep -rn '@etzhayyim/' src
  svelte/src` returns no matches. It was dropped from `package.json`.
- `tsc` then reported two real errors:

  ```
  src/app.ts(146,69): error TS2339: Property 'entries' does not exist on type 'URLSearchParams'.
  src/dispatcher.ts(81,28): error TS2339: Property 'entries' does not exist on type 'Headers'.
  ```

  `tsconfig.json` listed both `"WebWorker"` and `@cloudflare/workers-types`.
  Both declare `Headers` and `URLSearchParams`; `skipLibCheck` hid the clash,
  TS resolved to `lib.webworker`'s versions, and their iterator members live in
  `WebWorker.Iterable`, which was not listed. Dropping `"WebWorker"` (the
  posture Cloudflare documents — let the types package supply the globals)
  fixes it; adding `"WebWorker.Iterable"` also does. The first was taken.

## 2. Typecheck the SvelteKit app

```bash
cd svelte
npm install
npm run check
```

Measured output:

```
COMPLETED 152 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS
```

## 3. Build the deployable artifact

`vite build` is a heavy build, so on this workspace's machines it goes through
the shared resource governor rather than being launched directly:

```bash
cd svelte
node ../../../../scripts/resource-guard.mjs run build -- npm run build
```

(from a west checkout; adjust the path to `scripts/resource-guard.mjs` in the
superproject root). If another session holds the `build` lock the guard exits 2
with `build is already running (pid=…)` — that is the guard working, not a
failure. Measured: `✓ built in 18.95s`, then `Using @sveltejs/adapter-cloudflare
✔ done`, producing `svelte/.svelte-kit/cloudflare/_worker.js` (4,335 bytes) and
`svelte/.svelte-kit/cloudflare/client/`. That `_worker.js` path is exactly what
`wrangler.jsonc` names as `main`, which is how you can tell `src/app.ts` is not
on the deploy path.

## 4. Serve it locally and watch it refuse

```bash
cd svelte
npm run preview -- --port 4179
```

`@sveltejs/adapter-cloudflare`'s preview reads the repo-root `wrangler.jsonc`
and injects its `vars`, so the local server talks to the **real configured
backend** — which does not resolve. Measured:

```
GET  /                                          200   renders the landing page
GET  /anken                                     200   renders with エラー: TypeError: fetch failed
POST /xrpc/com.etzhayyim.apps.ses.listAnken     500   {"message":"Internal Error"}
OPTIONS /xrpc/x                                 204   CORS preflight
GET  /nope                                      404
```

If `preview` dies with
`MiniflareCoreError [ERR_RUNTIME_FAILURE] … NOSENTRY database is locked:
SQLITE_BUSY`, another preview is contending for miniflare's local state;
`rm -rf svelte/.wrangler` and retry. (That failure surfaces inside
`getPlatformProxy` — which is the same mechanism that injects the
`wrangler.jsonc` vars described above.)

The `/anken` banner and the `/xrpc` 500 are both the same cause — a `fetch` to
a host with no DNS. Note the asymmetry the two paths show: `lib/server/mcp.ts`
catches the failure and renders it, while the `/xrpc` proxy lets it escape as a
500.

To see the success direction, point the config at something that answers:

```bash
node -e 'require("http").createServer((q,s)=>{let b="";q.on("data",c=>b+=c);
  q.on("end",()=>{console.log("HIT",q.method,q.url);
  s.setHeader("content-type","application/json");
  s.end(JSON.stringify({jsonrpc:"2.0",id:"1",
    result:{structuredContent:{anken:[],total:0}}}))})}).listen(4189)' &
# temporarily set wrangler.jsonc vars.SES_MCP_URL to http://127.0.0.1:4189
```

Measured with the stub in place: the stub logs
`HIT POST /mcp {"jsonrpc":"2.0",…,"method":"tools/call","params":{"name":"com.etzhayyim.apps.ses.…`,
`/anken` returns 200 **with no error banner**, and the page renders `0 件` /
`該当する案件がありません。` for the empty result. That is the whole read path
proven end to end — route → loader → `callSesMcpTool` → JSON-RPC `tools/call`
at `<SES_MCP_URL>/mcp` → rendered page. **Restore `wrangler.jsonc` afterwards**
(`git checkout -- wrangler.jsonc`); it is committed config, not a local knob.

## 5. What deploying would do — and why not to yet

`npm run deploy` runs `etzhayyim deploy --no-svelte`, a CLI that is not in this
repo and not on the west manifest. A direct `wrangler deploy` would publish the
step-3 artifact to `ses.etzhayyim.com/*` and `s3s4nk3n.etzhayyim.com/*`.

Do not, yet. The artifact exposes two XRPC surfaces that authenticate nobody
(see the table in [../README.md](../README.md)), and the surface `CLAUDE.md`
documents — the `src/app.ts` Hono dispatcher, the only one that asks for a
`Bearer` token at all — is not the one that would ship. Settle which surface is
authoritative first.
