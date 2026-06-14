-- Run this once in your external Supabase SQL editor AFTER applying the migrations.
-- It fixes copied-project auth trigger drift and backfills the first operator.

CREATE OR REPLACE FUNCTION public.grant_first_user_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'operator') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operator')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_operator_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'operator' THEN
    INSERT INTO public.operator_settings (user_id) VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_first_user_operator() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_operator_settings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_operator ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_first_user_operator();

DROP TRIGGER IF EXISTS on_operator_role_granted ON public.user_roles;
DROP TRIGGER IF EXISTS on_user_role_created ON public.user_roles;
CREATE TRIGGER on_user_role_created
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_operator_settings();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'operator'::public.app_role
FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'operator')
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.operator_settings (user_id)
SELECT user_id
FROM public.user_roles
WHERE role = 'operator'
ON CONFLICT (user_id) DO NOTHING;