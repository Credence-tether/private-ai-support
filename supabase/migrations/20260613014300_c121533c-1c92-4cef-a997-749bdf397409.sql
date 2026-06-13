
ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS ip_city text,
  ADD COLUMN IF NOT EXISTS ip_region text,
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS os text,
  ADD COLUMN IF NOT EXISTS current_page_url text,
  ADD COLUMN IF NOT EXISTS current_page_title text,
  ADD COLUMN IF NOT EXISTS email text;

CREATE TABLE IF NOT EXISTS public.visitor_page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES public.visitors(id) ON DELETE CASCADE,
  page_url text NOT NULL,
  page_title text,
  referrer text,
  visited_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visitor_page_views_visitor_idx
  ON public.visitor_page_views (visitor_id, visited_at DESC);

GRANT SELECT ON public.visitor_page_views TO authenticated;
GRANT ALL ON public.visitor_page_views TO service_role;

ALTER TABLE public.visitor_page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can read page views"
  ON public.visitor_page_views FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.visitors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_page_views;
ALTER TABLE public.visitors REPLICA IDENTITY FULL;
ALTER TABLE public.visitor_page_views REPLICA IDENTITY FULL;
