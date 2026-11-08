import { z } from 'zod';

// Admin Client (service_role) se folosește doar în workers. Gateway-ul folosește întotdeauna client scoped pe tenant_id.

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  keyHash: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const UsageLogSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  apiKeyId: z.string().uuid(),
  route: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type UsageLog = z.infer<typeof UsageLogSchema>;
