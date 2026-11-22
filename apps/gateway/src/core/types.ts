import type { PlanTier } from '@mcpromania/types';

export type AuthContext = {
  apiKeyId: string;
  tenantId: string;
  keyName: string;
  planTier: PlanTier;
  monthlyLimit: number;
};
