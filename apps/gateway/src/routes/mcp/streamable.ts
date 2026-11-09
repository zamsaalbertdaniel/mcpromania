import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import type { Handler, Hono } from 'hono';

import type { AppEnv } from '../../app-env.js';
import { AppError } from '../../core/errors.js';
import type { SupabasePort } from '../../core/supabase.js';
import type { AnafService } from '../../services/anaf.service.js';
import type { BnrService } from '../../services/bnr.service.js';
import { registerAnafTool } from '../../tools/anaf.tool.js';
import { registerBnrTool } from '../../tools/bnr.tool.js';

export function registerMcpRoute(
  app: Hono<AppEnv>,
  deps: {
    anaf: AnafService;
    bnr: BnrService;
    supabase: SupabasePort;
    now: () => number;
  }
): void {
  const handleMcp: Handler<AppEnv> = async (c) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }

    const server = new McpServer({ name: 'mcpromania', version: '0.1.0' });
    const toolDeps = {
      anaf: deps.anaf,
      bnr: deps.bnr,
      supabase: deps.supabase,
      auth,
      requestId: c.get('requestId'),
      startedAt: c.get('startedAt'),
      now: deps.now,
    };
    registerAnafTool(server, toolDeps);
    registerBnrTool(server, toolDeps);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      const { req, res } = toReqRes(c.req.raw);
      // Fetch hides the Host header. @hono/node-server rejects Node requests
      // that omit it with an empty 400 before the MCP transport runs.
      if (!req.headers.host) {
        const host = new URL(c.req.url).host;
        req.headers.host = host.length > 0 ? host : 'localhost';
      }
      await transport.handleRequest(req, res);
      return await toFetchResponse(res);
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  };

  app.all('/mcp', handleMcp);
  app.all('/mcp/*', handleMcp);
}
