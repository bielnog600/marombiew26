CREATE TABLE public.ai_model_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  input_per_mtok numeric NOT NULL DEFAULT 0 CHECK (input_per_mtok >= 0),
  output_per_mtok numeric NOT NULL DEFAULT 0 CHECK (output_per_mtok >= 0),
  cache_write_per_mtok numeric NULL CHECK (cache_write_per_mtok IS NULL OR cache_write_per_mtok >= 0),
  cache_read_per_mtok numeric NULL CHECK (cache_read_per_mtok IS NULL OR cache_read_per_mtok >= 0),
  per_1k_chars numeric NULL CHECK (per_1k_chars IS NULL OR per_1k_chars >= 0),
  long_context_threshold integer NULL CHECK (long_context_threshold IS NULL OR long_context_threshold > 0),
  long_input_per_mtok numeric NULL,
  long_output_per_mtok numeric NULL,
  long_cache_write_per_mtok numeric NULL,
  long_cache_read_per_mtok numeric NULL,
  notes text NOT NULL DEFAULT '',
  source_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_model_prices TO authenticated;
GRANT ALL ON public.ai_model_prices TO service_role;
ALTER TABLE public.ai_model_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages ai model prices" ON public.ai_model_prices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER ai_model_prices_touch_updated_at BEFORE UPDATE ON public.ai_model_prices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  student_id uuid NULL,
  target_student_id uuid NULL,
  actor_id uuid NULL,
  actor_role text NOT NULL DEFAULT 'sistema' CHECK (actor_role IN ('aluno', 'admin', 'sistema')),
  feature text NOT NULL,
  function_name text NOT NULL DEFAULT '',
  provider text NOT NULL,
  model text NOT NULL DEFAULT '',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  characters integer NOT NULL DEFAULT 0,
  image_count integer NOT NULL DEFAULT 0,
  cost_usd numeric(14, 8) NULL,
  price_found boolean NOT NULL DEFAULT false,
  request_id text NULL,
  ok boolean NOT NULL DEFAULT true,
  error text NULL,
  duration_ms integer NULL
);
COMMENT ON COLUMN public.ai_usage_logs.student_id IS 'Aluno que usou (null quando foi o admin ou o sistema)';
COMMENT ON COLUMN public.ai_usage_logs.target_student_id IS 'Aluno a quem a chamada se refere (inclui chamadas do admin para ele)';
CREATE INDEX ai_usage_logs_created_idx ON public.ai_usage_logs (created_at DESC);
CREATE INDEX ai_usage_logs_student_created_idx ON public.ai_usage_logs (student_id, created_at DESC);
CREATE INDEX ai_usage_logs_target_created_idx ON public.ai_usage_logs (target_student_id, created_at DESC);
CREATE INDEX ai_usage_logs_feature_created_idx ON public.ai_usage_logs (feature, created_at DESC);

GRANT SELECT ON public.ai_usage_logs TO authenticated;
GRANT ALL ON public.ai_usage_logs TO service_role;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads ai usage logs" ON public.ai_usage_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));