declare module 'fetch-to-node' {
  import type { IncomingMessage, ServerResponse } from 'node:http';

  export function toReqRes(request: Request): {
    req: IncomingMessage;
    res: ServerResponse;
  };

  export function toFetchResponse(res: ServerResponse): Promise<Response>;
}
