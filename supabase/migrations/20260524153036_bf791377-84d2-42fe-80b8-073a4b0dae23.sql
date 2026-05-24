-- Create diet_checkins table
CREATE TABLE public.diet_checkins (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    diet_id UUID REFERENCES public.ai_plans(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed'
    
    -- Feedback data
    fome TEXT CHECK (fome IN ('baixa', 'moderada', 'alta')),
    energia TEXT CHECK (energia IN ('baixa', 'normal', 'alta')),
    saciedade TEXT CHECK (saciedade IN ('ruim', 'ok', 'boa')),
    sono TEXT CHECK (sono IN ('piorou', 'igual', 'melhorou')),
    digestao TEXT CHECK (digestao IN ('ruim', 'ok', 'boa')),
    facilidade TEXT CHECK (facilidade IN ('dificil', 'media', 'facil')),
    observacoes TEXT,
    
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.diet_checkins ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own checkins" 
ON public.diet_checkins FOR SELECT 
USING (auth.uid() = student_id OR true);

CREATE POLICY "Users can update their own checkins" 
ON public.diet_checkins FOR UPDATE 
USING (auth.uid() = student_id);

CREATE POLICY "Anyone can insert checkins" 
ON public.diet_checkins FOR INSERT 
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_diet_checkins_updated_at
BEFORE UPDATE ON public.diet_checkins
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();