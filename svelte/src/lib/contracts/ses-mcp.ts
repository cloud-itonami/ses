/* eslint-disable */
// SES MCP tool name constants and I/O types.
// Mirror of shinshi-mcp.ts pattern for the SES 案件 AppView.

export const SES_MCP_TOOLS = {
  listAnken: 'com.etzhayyim.apps.ses.listAnken',
  getAnken: 'com.etzhayyim.apps.ses.getAnken',
  listJokyo: 'com.etzhayyim.apps.ses.listJokyo',
} as const;

export type SesMcpToolName = typeof SES_MCP_TOOLS[keyof typeof SES_MCP_TOOLS];

export type AnkenSummary = {
  vertexId: string;
  clientName: string;
  clientCompany: string;
  jokyoCurrent: string;
  startMonth: string;
  endMonth: string;
  rateLowerYen: number | null;
  rateUpperYen: number | null;
  workLocation: string;
  remoteOk: boolean;
  createdAt: string;
};

export type AnkenDetail = AnkenSummary & {
  skillCsv: string;
  notes: string;
  sourceKind: string;
  sourceEmailFrom: string;
  sourceEmailSubject: string;
};

export type JokyoEntry = {
  vertexId: string;
  jokyo: string;
  jokyoPrev: string | null;
  notes: string;
  createdAt: string;
};

export type JokyoLogEntry = JokyoEntry & {
  changedByDid: string;
};

export type SesMcpInputMap = {
  [SES_MCP_TOOLS.listAnken]: {
    jokyo?: string;
    limit?: number;
    offset?: number;
  };
  [SES_MCP_TOOLS.getAnken]: {
    ankenId: string;
  };
  [SES_MCP_TOOLS.listJokyo]: {
    ankenId: string;
    limit?: number;
    offset?: number;
  };
};

export type SesMcpOutputMap = {
  [SES_MCP_TOOLS.listAnken]: {
    anken: AnkenSummary[];
    total: number;
    offset: number;
    limit: number;
  };
  [SES_MCP_TOOLS.getAnken]: {
    anken: AnkenDetail;
    jokyoLog: JokyoEntry[];
  };
  [SES_MCP_TOOLS.listJokyo]: {
    jokyo: JokyoLogEntry[];
    total: number;
    offset: number;
    limit: number;
  };
};

export type SesMcpInput<Name extends SesMcpToolName> = SesMcpInputMap[Name];
export type SesMcpOutput<Name extends SesMcpToolName> = SesMcpOutputMap[Name];

const SES_MCP_TOOL_SET = new Set<string>(Object.values(SES_MCP_TOOLS));

export function isSesMcpToolName(value: string): value is SesMcpToolName {
  return SES_MCP_TOOL_SET.has(value);
}
