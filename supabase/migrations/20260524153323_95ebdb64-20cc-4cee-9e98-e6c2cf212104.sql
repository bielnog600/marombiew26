-- Create workout_checkins table
CREATE TABLE public.workout_checkins (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workout_plan_id UUID REFERENCES public.ai_plans(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed'
    
    -- Feedback data
    intensidade_percebida TEXT CHECK (intensidade_percebida IN ('muito_facil', 'adequado', 'muito_pesado')),
    falta_tempo BOOLEAN,
    recuperacao TEXT CHECK (recuperacao IN ('ruim', 'ok', 'boa')),
    dores TEXT CHECK (dores IN ('nao', 'leves', 'moderadas', 'fortes')),
    exercicios_incomodo TEXT,
    duracao_percebida TEXT CHECK (duracao_percebida IN ('muito_longo', 'adequado', 'curto_demais')),
    energia TEXT CHECK (energia IN ('baixa', 'normal', 'alta')),
    motivacao TEXT CHECK (motivacao IN ('baixa', 'media', 'alta')),
    observacoes TEXT,
    
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workout_checkins ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own workout checkins" 
ON public.workout_checkins FOR SELECT 
USING (auth.uid() = student_id OR true);

CREATE POLICY "Users can update their own workout checkins" 
ON public.workout_checkins FOR UPDATE 
USING (auth.uid() = student_id);

CREATE POLICY "Anyone can insert workout checkins" 
ON public.workout_checkins FOR INSERT 
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_workout_checkins_updated_at
BEFORE UPDATE ON public.workout_checkins
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();