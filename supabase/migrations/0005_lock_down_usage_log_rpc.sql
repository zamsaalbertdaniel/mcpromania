-- Phase 4 Lock-down: Run ONLY AFTER deploying the gateway-admin Edge Function
-- AND rolling out GATEWAY_ADMIN_URL + GATEWAY_EDGE_SECRET to all live gateway containers.
-- Revokes direct anon access to legacy record_usage_log so external callers cannot spoof logs.

begin;

revoke all on function public.record_usage_log(uuid, uuid, text) from public;
revoke all on function public.record_usage_log(uuid, uuid, text) from anon;
revoke all on function public.record_usage_log(uuid, uuid, text) from authenticated;
grant execute on function public.record_usage_log(uuid, uuid, text) to service_role;

commit;
