import { createHash, timingSafeEqual } from 'node:crypto';

export function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

export function isMasterToken(
  authorization: string | undefined,
  masterApiKey: string | undefined
): boolean {
  if (!masterApiKey) {
    return false;
  }
  const token = extractBearerToken(authorization);
  if (!token) {
    return false;
  }
  const tokenDigest = createHash('sha256').update(token).digest();
  const masterDigest = createHash('sha256').update(masterApiKey).digest();
  return timingSafeEqual(tokenDigest, masterDigest);
}
