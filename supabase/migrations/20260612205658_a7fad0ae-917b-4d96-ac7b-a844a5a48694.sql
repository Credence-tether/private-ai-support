
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('operator');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-grant operator role to the first user that signs up.
CREATE OR REPLACE FUNCTION public.grant_first_user_operator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'operator') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operator');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_grant_operator
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_first_user_operator();

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ VISITORS ============
CREATE TABLE public.visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text,
  name text,
  email text,
  user_agent text,
  ip_country text,
  referrer text,
  site_origin text,
  blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitors TO authenticated;
GRANT ALL ON public.visitors TO service_role;
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can read all visitors"
  ON public.visitors FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Operators can update visitors"
  ON public.visitors FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'operator'));

-- ============ CONVERSATIONS ============
CREATE TYPE public.conversation_status AS ENUM ('bot', 'pending_human', 'human', 'closed');

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES public.visitors(id) ON DELETE CASCADE,
  status public.conversation_status NOT NULL DEFAULT 'bot',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  site_origin text,
  page_url text,
  unread_for_operator boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_status_last_message ON public.conversations(status, last_message_at DESC);
CREATE INDEX idx_conversations_visitor ON public.conversations(visitor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can read conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Operators can update conversations"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Operators can delete conversations"
  ON public.conversations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'));

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ MESSAGES ============
CREATE TYPE public.message_role AS ENUM ('visitor', 'assistant', 'operator', 'system');

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role public.message_role NOT NULL,
  content text NOT NULL,
  operator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation_created ON public.messages(conversation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can read messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Operators can insert operator messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'operator')
    AND role = 'operator'
    AND operator_user_id = auth.uid()
  );

-- ============ PUSH SUBSCRIPTIONS ============
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own push subscriptions"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============ OPERATOR SETTINGS (singleton per operator) ============
CREATE TABLE public.operator_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  system_prompt text NOT NULL DEFAULT 'You are a friendly, concise customer support assistant. If the user asks for a human, says they want to talk to a person, or seems frustrated, briefly acknowledge and let them know a human will be notified. Keep replies short (under 3 sentences) unless the user asks for detail.',
  groq_model text NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  away_message text NOT NULL DEFAULT 'Thanks for your message! Our team is offline right now but will reply as soon as we''re back.',
  notify_on_new_conversation boolean NOT NULL DEFAULT true,
  notify_on_human_request boolean NOT NULL DEFAULT true,
  notify_on_visitor_message boolean NOT NULL DEFAULT true,
  greeting text NOT NULL DEFAULT 'Hi there! 👋 How can we help?',
  brand_color text NOT NULL DEFAULT '#0ea5e9',
  brand_name text NOT NULL DEFAULT 'Support',
  allowed_origins text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_settings TO authenticated;
GRANT ALL ON public.operator_settings TO service_role;
ALTER TABLE public.operator_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators manage their own settings"
  ON public.operator_settings FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'operator'))
  WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'operator'));

CREATE TRIGGER trg_operator_settings_updated_at
  BEFORE UPDATE ON public.operator_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create operator_settings row when operator role is granted
CREATE OR REPLACE FUNCTION public.create_operator_settings()
RETURNS TRIGGER
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

CREATE TRIGGER on_operator_role_granted
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.create_operator_settings();

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
