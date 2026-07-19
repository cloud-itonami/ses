import type { RequestEvent } from '@sveltejs/kit';
import type { SesMcpInput, SesMcpOutput, SesMcpToolName } from '../contracts/ses-mcp';

// ses-langgraph is ClusterIP-only; SES_MCP_URL must be set to the externally reachable
// ses-api.etzhayyim.com endpoint (requires Cloudflare Tunnel ingress rule +
// DNS CNAME ses-api.etzhayyim.com → <tunnel-uuid>.cfargotunnel.com).
const DEFAULT_SES_MCP_URL = '';

type Env = Record<string, unknown> & {
  SES_MCP_URL?: string;
  LG_SES_API_KEY?: string;
};

type JsonRpcResponse = {
  jsonrpc?: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

export function envOf(event: RequestEvent): Env {
  return ((event.platform as { env?: Env } | undefined)?.env ?? {}) as Env;
}

function normalizeMcpUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/mcp')) return trimmed;
  return `${trimmed}/mcp`;
}

export function sesMcpUrl(env: Env): string {
  if (typeof env.SES_MCP_URL === 'string' && env.SES_MCP_URL.trim()) {
    return normalizeMcpUrl(env.SES_MCP_URL);
  }
  return DEFAULT_SES_MCP_URL;
}

function sesApiKey(env: Env): string {
  if (typeof env.LG_SES_API_KEY === 'string' && env.LG_SES_API_KEY.trim()) {
    return env.LG_SES_API_KEY.trim();
  }
  return '';
}

export async function callSesMcpTool<Name extends SesMcpToolName>(
  event: RequestEvent,
  name: Name,
  args: SesMcpInput<Name>,
): Promise<{ ok: true; data: SesMcpOutput<Name> } | { ok: false; status: number; error: string; upstream?: unknown }> {
  const env = envOf(event);
  const url = sesMcpUrl(env);
  if (!url) {
    return { ok: false, status: 503, error: 'SES_MCP_URL is not configured' };
  }

  const headers = new Headers({ 'content-type': 'application/json' });
  const apiKey = sesApiKey(env);
  if (apiKey) headers.set('x-api-key', apiKey);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
  } catch (err) {
    return { ok: false, status: 502, error: String(err) };
  }

  const text = await response.text();
  let payload: JsonRpcResponse | string | null = null;
  try {
    payload = text ? (JSON.parse(text) as JsonRpcResponse) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    return { ok: false, status: response.status, error: 'SES MCP request failed', upstream: payload };
  }
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
    return {
      ok: false,
      status: 502,
      error: (payload as JsonRpcResponse).error?.message ?? 'SES MCP returned an error',
      upstream: payload,
    };
  }

  const result = payload && typeof payload === 'object' && 'result' in payload ? (payload as JsonRpcResponse).result : payload;
  const structured =
    result && typeof result === 'object' && 'structuredContent' in result
      ? (result as { structuredContent?: unknown }).structuredContent
      : result;
  return { ok: true, data: (structured ?? {}) as SesMcpOutput<Name> };
}
