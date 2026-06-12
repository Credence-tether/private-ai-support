
ALTER TABLE public.operator_settings
  ADD COLUMN vapid_public_key text,
  ADD COLUMN vapid_private_key text,
  ADD COLUMN vapid_subject text NOT NULL DEFAULT 'mailto:operator@example.com';
