
ALTER TABLE public.operator_settings
  ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'groq',
  ADD COLUMN IF NOT EXISTS ollama_base_url text NOT NULL DEFAULT 'http://localhost:11434',
  ADD COLUMN IF NOT EXISTS ollama_model text NOT NULL DEFAULT 'llama3.2:3b',
  ADD COLUMN IF NOT EXISTS knowledge_base text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS knowledge_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS knowledge_synced_at timestamptz;

ALTER TABLE public.operator_settings
  DROP CONSTRAINT IF EXISTS operator_settings_ai_provider_check;
ALTER TABLE public.operator_settings
  ADD CONSTRAINT operator_settings_ai_provider_check
  CHECK (ai_provider IN ('groq','ollama'));
