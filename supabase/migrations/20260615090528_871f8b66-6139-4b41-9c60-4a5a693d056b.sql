
-- 1. Lock down user_roles: prevent any client-side INSERT/UPDATE/DELETE.
--    Only service_role (server-side) may modify roles.
CREATE POLICY "Block client role inserts" ON public.user_roles
  AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "Block client role updates" ON public.user_roles
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "Block client role deletes" ON public.user_roles
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- 2. Conversations: visitor conversation creation goes through server functions
--    using the service role. Explicitly deny direct client inserts so behaviour
--    is unambiguous.
CREATE POLICY "Block client conversation inserts" ON public.conversations
  AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);

-- 3. Messages: visitor/bot messages are written by server functions using the
--    service role. Operators can still insert their own operator messages via
--    the existing permissive policy. Add a restrictive policy that prevents
--    any client from inserting non-operator messages.
CREATE POLICY "Only operator messages from clients" ON public.messages
  AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (role = 'operator'::message_role);

-- 4. Protect VAPID private key: revoke column-level access from clients.
--    Server code uses the service role, which bypasses these grants.
REVOKE SELECT (vapid_private_key), INSERT (vapid_private_key), UPDATE (vapid_private_key)
  ON public.operator_settings FROM authenticated, anon, PUBLIC;

-- 5. Revoke EXECUTE on SECURITY DEFINER trigger functions from clients.
--    They only need to run as triggers (which use the function owner's rights),
--    not be callable directly. has_role stays callable because RLS policies
--    invoke it as the authenticated role.
REVOKE EXECUTE ON FUNCTION public.grant_first_user_operator() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.create_operator_settings() FROM PUBLIC, authenticated, anon;
