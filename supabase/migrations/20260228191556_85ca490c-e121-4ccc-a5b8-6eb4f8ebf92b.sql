
-- Table to store Karvonen heart rate zones per student
CREATE TABLE public.hr_zones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL,
  fc_repouso integer NOT NULL,
  fcmax_formula text NOT NULL DEFAULT 'tanaka',
  fcmax_estimada integer NOT NULL,
  hrr integer NOT NULL,
  zonas_karvonen jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_calculo timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hr_zones ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin manage hr_zones"
  ON public.hr_zones FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Students read own
CREATE POLICY "Students read own hr_zones"
  ON public.hr_zones FOR SELECT
  USING (auth.uid() = student_id);

-- Update trigger
CREATE TRIGGER update_hr_zones_updated_at
  BEFORE UPDATE ON public.hr_zones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
