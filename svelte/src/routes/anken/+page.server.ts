import type { PageServerLoad } from './$types';
import { callSesMcpTool } from '$lib/server/mcp';
import { SES_MCP_TOOLS } from '$lib/contracts/ses-mcp';

export const load: PageServerLoad = async (event) => {
  const url = event.url;
  const jokyo = url.searchParams.get('jokyo') ?? '';
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0', 10));
  const limit = 50;
  const offset = page * limit;

  const result = await callSesMcpTool(event, SES_MCP_TOOLS.listAnken, {
    jokyo: jokyo || undefined,
    limit,
    offset,
  });

  if (!result.ok) {
    return { anken: [], total: 0, offset, limit, page, jokyo, error: result.error };
  }

  return {
    anken: result.data.anken,
    total: result.data.total,
    offset,
    limit,
    page,
    jokyo,
    error: null,
  };
};
