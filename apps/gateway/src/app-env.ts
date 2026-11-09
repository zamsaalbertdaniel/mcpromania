import type { AuthContext } from './core/types.js';

export type AppEnv = {
  Variables: {
    requestId: string;
    startedAt: number;
    auth?: AuthContext;
  };
};
