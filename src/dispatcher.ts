// Dispatcher — ses.etzhayyim.com → bpmn-dispatcher (K8s ClusterIP) →
// LangGraph Server ses-langgraph.mitama-udf.svc.cluster.local:8000
// (ADR-2605120000 / ADR-2605080600).
//
// Trust model: x-internal-trust = DISPATCHER_INTERNAL_SECRET (const-time compare).
// Bridge headers: x-etzhayyim-actor-did / x-etzhayyim-org-did / x-etzhayyim-trace-id.

const DISPATCH_TIMEOUT_MS = 60_000;
const DEFAULT_DISPATCHER_URL = "https://dispatcher.etzhayyim.com";

type DispatcherEnv = {
  BPMN_DISPATCHER_URL?: string;
  DISPATCHER_INTERNAL_SECRET?: string;
};

export interface DispatcherCallerContext {
  did: string;
  orgDid: string;
  activeDid?: string;
}

export interface DispatchSesXrpcArgs {
  env: DispatcherEnv;
  nsid: string;
  method: string;
  body: unknown;
  params: Record<string, string>;
  auth: DispatcherCallerContext;
}

export async function dispatchSesXrpc(args: DispatchSesXrpcArgs): Promise<Response> {
  const { env, nsid, method, body, params, auth } = args;
  const base = (env.BPMN_DISPATCHER_URL ?? DEFAULT_DISPATCHER_URL).replace(/\/$/, "");
  const url = new URL(`${base}/xrpc/${nsid}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const ts = Date.now().toString();
  const bodyText = body == null ? "" : JSON.stringify(body);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-internal-trust": env.DISPATCHER_INTERNAL_SECRET ?? "",
    "x-internal-trust-ts": ts,
    "x-etzhayyim-actor-did": auth.activeDid ?? auth.did,
    "x-etzhayyim-org-did": auth.orgDid,
    "x-etzhayyim-trace-id": crypto.randomUUID(),
  };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), DISPATCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url.toString(), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : bodyText,
      signal: ctl.signal,
    });
    const respBody = await resp.arrayBuffer();
    return new Response(respBody, {
      status: resp.status,
      headers: forwardedHeaders(resp.headers),
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return Response.json(
        { error: "GatewayTimeout", message: "bpmn-dispatcher timed out" },
        { status: 504 },
      );
    }
    return Response.json(
      { error: "BackendUnavailable", message: String((err as Error)?.message ?? err) },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}

function forwardedHeaders(src: Headers): Headers {
  const out = new Headers();
  for (const [k, v] of src.entries()) {
    const lk = k.toLowerCase();
    if (lk === "content-type" || lk === "content-length" || lk.startsWith("x-etzhayyim-")) {
      out.set(k, v);
    }
  }
  return out;
}
