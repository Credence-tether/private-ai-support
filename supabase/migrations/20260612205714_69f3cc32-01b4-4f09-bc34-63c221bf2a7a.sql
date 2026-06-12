
REVOKE EXECUTE ON FUNCTION public.grant_first_user_operator() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_operator_settings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
