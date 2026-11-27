import { createClient } from 'npm:@supabase/supabase-js@2';

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const VALID_PLANS = new Set(['free', 'pro', 'agency', 'custom']);
const MAX_BODY_BYTES = 8_192;

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

  const expectedSecret = Deno.env.get('WAITLIST_EDGE_SECRET')?.trim() ?? '';
  if (expectedSecret.length < 16) {
    console.error('WAITLIST_EDGE_SECRET is missing or too short in Edge Function secrets');
    return jsonResponse({ ok: false, error: 'Edge function misconfigured' }, 500);
  }

  const providedSecret = req.headers.get('x-waitlist-edge-secret')?.trim() ?? '';
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

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
  const companyName = typeof payload.companyName === 'string' ? payload.companyName.trim() : null;
  const planTier =
    typeof payload.planTier === 'string' ? payload.planTier.trim().toLowerCase() : 'pro';
  const useCase = typeof payload.useCase === 'string' ? payload.useCase.trim() : null;
  const source = typeof payload.source === 'string' ? payload.source.trim() : 'website';
  const ipHash = typeof payload.ipHash === 'string' ? payload.ipHash.trim() : null;

  if (email.length < 5 || email.length > 254 || !EMAIL_RE.test(email)) {
    return jsonResponse({ ok: false, error: 'Invalid email' }, 400);
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return jsonResponse({ ok: false, error: 'Invalid fullName' }, 400);
  }
  if (companyName && companyName.length > 160) {
    return jsonResponse({ ok: false, error: 'Invalid companyName' }, 400);
  }
  if (!VALID_PLANS.has(planTier)) {
    return jsonResponse({ ok: false, error: 'Invalid planTier' }, 400);
  }
  if (useCase && useCase.length > 500) {
    return jsonResponse({ ok: false, error: 'Invalid useCase' }, 400);
  }
  if (!source || source.length > 64) {
    return jsonResponse({ ok: false, error: 'Invalid source' }, 400);
  }
  if (ipHash && ipHash.length > 128) {
    return jsonResponse({ ok: false, error: 'Invalid ipHash' }, 400);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabaseAdmin.rpc('submit_waitlist_lead', {
    p_email: email,
    p_full_name: fullName,
    p_company_name: companyName || null,
    p_plan_tier: planTier,
    p_use_case: useCase || null,
    p_source: source,
    p_ip_hash: ipHash || null,
  });

  if (error) {
    console.error('submit_waitlist_lead RPC error:', error.message);
    return jsonResponse({ ok: false, error: 'Waitlist submission failed' }, 500);
  }

  const rows = Array.isArray(data)
    ? (data as Array<{ lead_id: string; already_registered: boolean }>)
    : [];
  const row = rows[0];

  if (!row) {
    return jsonResponse({ ok: false, error: 'Empty submission result' }, 500);
  }

  return jsonResponse({
    ok: true,
    leadId: row.lead_id,
    alreadyRegistered: Boolean(row.already_registered),
  });
});
