import type { PageServerLoad } from './$types';
import { callSesMcpTool } from '$lib/server/mcp';
import { SES_MCP_TOOLS } from '$lib/contracts/ses-mcp';

export const load: PageServerLoad = async (event) => {
  const ankenId = decodeURIComponent(event.params.id);

  const result = await callSesMcpTool(event, SES_MCP_TOOLS.getAnken, { ankenId });

  if (!result.ok) {
    return { anken: null, jokyoLog: [], error: result.error };
  }

  return {
    anken: result.data.anken,
    jokyoLog: result.data.jokyoLog,
    error: null,
  };
};
