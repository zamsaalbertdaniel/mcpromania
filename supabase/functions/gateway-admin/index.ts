import { createClient } from 'npm:@supabase/supabase-js@2';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_HASH_RE = /^[0-9a-f]{32,128}$/i;
const MAX_BODY_BYTES = 16_384;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return new Uint8Array(digest);
}

async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([sha256Bytes(a), sha256Bytes(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i += 1) {
    diff |= (da[i] ?? 0) ^ (db[i] ?? 0);
  }
  return diff === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const expectedSecret = Deno.env.get('GATEWAY_EDGE_SECRET')?.trim() ?? '';
  if (expectedSecret.length < 16) {
    console.error('GATEWAY_EDGE_SECRET is missing or too short in Edge Function secrets');
    return jsonResponse({ ok: false, error: 'Edge function misconfigured' }, 500);
  }

  const providedSecret = req.headers.get('x-gateway-edge-secret')?.trim() ?? '';
  if (!providedSecret || !(await constantTimeEqual(providedSecret, expectedSecret))) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return jsonResponse({ ok: false, error: 'Edge function misconfigured' }, 500);
  }

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, error: 'Payload too large' }, 413);
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonResponse({ ok: false, error: 'Invalid JSON object' }, 400);
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON payload' }, 400);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (payload.action === 'revoke') {
    const apiKeyId = typeof payload.apiKeyId === 'string' ? payload.apiKeyId.trim() : undefined;
    const keyHash = typeof payload.keyHash === 'string' ? payload.keyHash.trim() : undefined;

    if (!apiKeyId && !keyHash) {
      return jsonResponse({ ok: false, error: 'Specify apiKeyId or keyHash' }, 400);
    }
    if (apiKeyId && !UUID_RE.test(apiKeyId)) {
      return jsonResponse({ ok: false, error: 'Invalid apiKeyId' }, 400);
    }
    if (keyHash && !KEY_HASH_RE.test(keyHash)) {
      return jsonResponse({ ok: false, error: 'Invalid keyHash' }, 400);
    }

    const { data, error } = await supabaseAdmin.rpc('revoke_api_key', {
      p_api_key_id: apiKeyId ?? null,
      p_key_hash: keyHash ?? null,
    });

    if (error) {
      console.error('revoke_api_key RPC error:', error.message);
      return jsonResponse({ ok: false, error: 'Database revocation failed' }, 500);
    }

    const rows = Array.isArray(data)
      ? (data as Array<{ api_key_id: string; key_hash: string; revoked_at: string }>)
      : [];

    return jsonResponse({
      ok: true,
      revokedCount: rows.length,
      apiKeyIds: rows.map((row) => row.api_key_id),
      keyHashes: rows.map((row) => row.key_hash),
    });
  }

  if (payload.action === 'usage_log') {
    const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId.trim() : '';
    const apiKeyId = typeof payload.apiKeyId === 'string' ? payload.apiKeyId.trim() : '';
    const route = typeof payload.route === 'string' ? payload.route.trim() : '';
    const idempotencyKey =
      typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey.trim() : '';

    if (
      !UUID_RE.test(tenantId) ||
      !UUID_RE.test(apiKeyId) ||
      route.length === 0 ||
      route.length > 512 ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > 128
    ) {
      return jsonResponse({ ok: false, error: 'Invalid usage_log payload' }, 400);
    }

    const { data, error } = await supabaseAdmin.rpc('record_usage_log_idempotent', {
      p_tenant_id: tenantId,
      p_api_key_id: apiKeyId,
      p_route: route,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error('record_usage_log_idempotent RPC error:', error.message);
      return jsonResponse({ ok: false, error: 'Usage log write failed' }, 500);
    }

    return jsonResponse({ ok: true, id: data ?? null });
  }

  return jsonResponse({ ok: false, error: 'Unsupported action' }, 400);
});
