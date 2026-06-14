CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_first_user_operator();

CREATE TRIGGER on_user_role_created AFTER INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.create_operator_settings();