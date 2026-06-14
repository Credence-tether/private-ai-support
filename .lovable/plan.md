## Why login hangs

- Email confirmation is enabled, so `signUp` returns a user with no session and your "Create account" flow effectively waits for an email link. For a single-operator ("just me") setup this is the wrong default.
- The `grant_first_user_operator` SQL function exists but is **not attached** as a trigger on `auth.users`, so the first signup wouldn't actually get the `operator` role — `/inbox` would later 403.

## Fix

1. **Enable auto-confirm email** via the auth config tool so signup immediately returns a session (you go straight into the dashboard).
2. **Migration**: attach the missing triggers:
   - `on_auth_user_created` on `auth.users` AFTER INSERT → `public.grant_first_user_operator()` (makes the first signup the operator).
   - `on_user_role_created` on `public.user_roles` AFTER INSERT → `public.create_operator_settings()` (auto-creates the `operator_settings` row).
3. **Auth page UX tweak**: after a successful `signUp`, navigate to `/inbox` only if a session was returned; otherwise show the "check your email" toast and stop the spinner. Defensive — also prevents future hangs if you ever turn confirmation back on.

No other code changes. After this, "Create operator account" will land you in `/inbox` in one click.