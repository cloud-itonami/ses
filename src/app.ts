// ses.etzhayyim.com — L3 dispatcher CF Worker (ADR-2605120000).
//
// Surfaces:
//   /health, /_app/meta                         edge probe (no auth)
//   /xrpc/com.etzhayyim.apps.ses.ingestAnken          procedure (Bearer auth)
//   /xrpc/com.etzhayyim.apps.ses.updateJokyo          procedure (Bearer auth)
//   /xrpc/com.etzhayyim.apps.ses.getAnken             query     (Bearer auth)
//   /xrpc/com.etzhayyim.apps.ses.listAnken            query     (Bearer auth)
//   /xrpc/com.etzhayyim.apps.ses.listJokyo            query     (Bearer auth)
//   /xrpc/com.etzhayyim.apps.ses.coverage             query     (Bearer auth)
//
// Auth: Bearer sk_live_* / ES256 JWT → local decode → HMAC forward.
// Dispatch: forwards to bpmn-dispatcher with x-internal-trust HMAC.
//
// LangGraph backend: bpmn-dispatcher routes `com.etzhayyim.apps.ses.*` to
// LangGraph Server ses-langgraph.mitama-udf.svc.cluster.local:8000.
//
// ADR-2605111200: NO Hyperdrive binding. Zero domain writes here.
// All compute and DB writes happen in mitama-ses-pool (asyncpg).

import { Hono } from "hono";
import { dispatchSesXrpc } from "./dispatcher";

type Env = {
  SES_VERSION?: string;
  SES_ACTOR_DID?: string;
  BPMN_DISPATCHER_URL: string;
  DISPATCHER_INTERNAL_SECRET?: string;
  PDS_SERVICE?: { fetch(req: Request): Promise<Response> };
};

interface AuthContext {
  did: string;
  orgDid: string;
  activeDid?: string;
}

declare module "hono" {
  interface ContextVariableMap {
    auth?: AuthContext;
  }
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) =>
  c.json({ ok: true, app: "ses", ts: new Date().toISOString() }),
);

app.get("/_worker/health", (c) =>
  c.json({ ok: true, app: "ses", ts: new Date().toISOString() }),
);

app.get("/_app/meta", (c) =>
  c.json({
    app: "etzhayyim-project-ses",
    did: c.env.SES_ACTOR_DID ?? "did:web:ses.etzhayyim.com",
    version: c.env.SES_VERSION ?? "0.0.0",
    layer: "L3-dispatcher",
    adr: "2605120000",
    surfaces: [
      "/xrpc/com.etzhayyim.apps.ses.ingestAnken",
      "/xrpc/com.etzhayyim.apps.ses.updateJokyo",
      "/xrpc/com.etzhayyim.apps.ses.getAnken",
      "/xrpc/com.etzhayyim.apps.ses.listAnken",
      "/xrpc/com.etzhayyim.apps.ses.listJokyo",
      "/xrpc/com.etzhayyim.apps.ses.coverage",
    ],
    backend: c.env.BPMN_DISPATCHER_URL,
    jokyoValues: ["提案中", "選考中", "契約", "稼働中", "終了", "見送り", "中途終了"],
    federable: false,
    hyperdrive: false,
  }),
);

async function resolveAuthContext(
  req: Request,
  env: Env,
): Promise<AuthContext | null> {
  const h = req.headers.get("authorization") ?? "";
  if (!h.startsWith("Bearer ")) return null;
  const token = h.slice("Bearer ".length).trim();
  if (!token) return null;

  if (token.startsWith("sk_live_") || token.startsWith("sk_test_")) {
    return {
      did: env.SES_ACTOR_DID ?? "did:web:ses.etzhayyim.com",
      orgDid: "did:erc725:etzhayyim:260425:anon",
    };
  }

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(b64urlDecode(parts[1]!));
    const sub = String(payload.sub ?? "").trim();
    if (!sub) return null;
    return { did: sub, orgDid: "did:erc725:etzhayyim:260425:anon", activeDid: sub };
  } catch {
    return null;
  }
}

function b64urlDecode(s: string): string {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64);
}

app.use("*", async (c, next) => {
  const path = c.req.path;
  if (
    path === "/health" ||
    path === "/_worker/health" ||
    path === "/_app/meta" ||
    path === "/"
  ) {
    return next();
  }
  const auth = await resolveAuthContext(c.req.raw, c.env);
  if (!auth) {
    return c.json({ error: "AuthRequired", message: "Bearer token required" }, 401);
  }
  c.set("auth", auth);
  await next();
});

app.get("/", (c) => c.json({ app: "ses", did: "did:web:ses.etzhayyim.com" }));

app.all("/xrpc/:nsidParam", async (c) => {
  const nsid = c.req.param("nsidParam") || "";
  if (!nsid.startsWith("com.etzhayyim.apps.ses.")) {
    return c.json({ error: "NotFound", path: c.req.path }, 404);
  }
  const auth = c.var.auth;
  if (!auth) return c.json({ error: "AuthRequired" }, 401);

  let body: unknown = undefined;
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
  }
  const params = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  return dispatchSesXrpc({ env: c.env, nsid, method: c.req.method, body, params, auth });
});

app.notFound((c) => c.json({ error: "NotFound", path: c.req.path }, 404));
app.onError((err, c) => {
  console.error("[ses] unhandled", err);
  return c.json({ error: "Internal", message: String((err as Error)?.message ?? err) }, 500);
});

export default app;
