
-- Enum para roles
CREATE TYPE public.app_role AS ENUM ('admin', 'aluno');

-- Tabela de roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'aluno',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função de checagem de role (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  telefone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Students profile
CREATE TABLE public.students_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  data_nascimento DATE,
  sexo TEXT CHECK (sexo IN ('masculino', 'feminino', 'outro')),
  altura NUMERIC(5,2),
  objetivo TEXT,
  observacoes TEXT,
  restricoes TEXT,
  lesoes TEXT,
  fotos TEXT[],
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.students_profile ENABLE ROW LEVEL SECURITY;

-- Avaliações
CREATE TABLE public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  avaliador_id UUID REFERENCES auth.users(id) NOT NULL,
  notas_gerais TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

-- Anamnese
CREATE TABLE public.anamnese (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  sono TEXT,
  stress TEXT,
  rotina TEXT,
  treino_atual TEXT,
  medicacao TEXT,
  suplementos TEXT,
  historico_saude TEXT,
  dores TEXT,
  cirurgias TEXT,
  tabagismo BOOLEAN DEFAULT false,
  alcool TEXT
);
ALTER TABLE public.anamnese ENABLE ROW LEVEL SECURITY;

-- Sinais Vitais
CREATE TABLE public.vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  pressao TEXT,
  fc_repouso INTEGER,
  spo2 NUMERIC(5,2),
  glicemia NUMERIC(6,2),
  observacoes TEXT
);
ALTER TABLE public.vitals ENABLE ROW LEVEL SECURITY;

-- Antropometria
CREATE TABLE public.anthropometrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  peso NUMERIC(5,2),
  altura NUMERIC(5,2),
  imc NUMERIC(5,2),
  cintura NUMERIC(5,2),
  quadril NUMERIC(5,2),
  rcq NUMERIC(5,3),
  pescoco NUMERIC(5,2),
  braco NUMERIC(5,2),
  antebraco NUMERIC(5,2),
  torax NUMERIC(5,2),
  abdomen NUMERIC(5,2),
  coxa NUMERIC(5,2),
  panturrilha NUMERIC(5,2)
);
ALTER TABLE public.anthropometrics ENABLE ROW LEVEL SECURITY;

-- Dobras cutâneas
CREATE TABLE public.skinfolds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  metodo TEXT DEFAULT 'jackson_pollock_3',
  triceps NUMERIC(5,2),
  subescapular NUMERIC(5,2),
  suprailiaca NUMERIC(5,2),
  abdominal NUMERIC(5,2),
  peitoral NUMERIC(5,2),
  axilar_media NUMERIC(5,2),
  coxa NUMERIC(5,2)
);
ALTER TABLE public.skinfolds ENABLE ROW LEVEL SECURITY;

-- Composição corporal
CREATE TABLE public.composition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  percentual_gordura NUMERIC(5,2),
  massa_magra NUMERIC(6,2),
  massa_gorda NUMERIC(6,2),
  observacoes TEXT
);
ALTER TABLE public.composition ENABLE ROW LEVEL SECURITY;

-- Testes de performance
CREATE TABLE public.performance_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  pushup INTEGER,
  plank INTEGER,
  cooper_12min NUMERIC(6,2),
  salto_vertical NUMERIC(5,2),
  agachamento_score INTEGER,
  mobilidade_ombro TEXT,
  mobilidade_quadril TEXT,
  mobilidade_tornozelo TEXT,
  observacoes TEXT
);
ALTER TABLE public.performance_tests ENABLE ROW LEVEL SECURITY;

-- Postura
CREATE TABLE public.posture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  vista_anterior JSONB DEFAULT '{}',
  vista_lateral JSONB DEFAULT '{}',
  vista_posterior JSONB DEFAULT '{}',
  observacoes TEXT
);
ALTER TABLE public.posture ENABLE ROW LEVEL SECURITY;

-- Fotos da avaliação
CREATE TABLE public.assessment_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT CHECK (tipo IN ('frente', 'lado', 'costas')),
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assessment_photos ENABLE ROW LEVEL SECURITY;

-- Metas
CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  meta_peso NUMERIC(5,2),
  meta_medidas TEXT,
  meta_gordura NUMERIC(5,2),
  prazo DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- Notas de progresso
CREATE TABLE public.progress_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  nota TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.progress_notes ENABLE ROW LEVEL SECURITY;

-- ========= RLS POLICIES =========

-- user_roles
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- profiles
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- students_profile
CREATE POLICY "Students read own" ON public.students_profile FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage students" ON public.students_profile FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- assessments
CREATE POLICY "Students read own assessments" ON public.assessments FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Admins manage assessments" ON public.assessments FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- anamnese
CREATE POLICY "Read via assessment" ON public.anamnese FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND (a.student_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "Admin manage anamnese" ON public.anamnese FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- vitals
CREATE POLICY "Read vitals via assessment" ON public.vitals FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND (a.student_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "Admin manage vitals" ON public.vitals FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- anthropometrics
CREATE POLICY "Read anthropometrics via assessment" ON public.anthropometrics FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND (a.student_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "Admin manage anthropometrics" ON public.anthropometrics FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- skinfolds
CREATE POLICY "Read skinfolds via assessment" ON public.skinfolds FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND (a.student_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "Admin manage skinfolds" ON public.skinfolds FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- composition
CREATE POLICY "Read composition via assessment" ON public.composition FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND (a.student_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "Admin manage composition" ON public.composition FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- performance_tests
CREATE POLICY "Read performance via assessment" ON public.performance_tests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND (a.student_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "Admin manage performance" ON public.performance_tests FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- posture
CREATE POLICY "Read posture via assessment" ON public.posture FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND (a.student_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "Admin manage posture" ON public.posture FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- assessment_photos
CREATE POLICY "Read photos via assessment" ON public.assessment_photos FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND (a.student_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "Admin manage photos" ON public.assessment_photos FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- goals
CREATE POLICY "Students read own goals" ON public.goals FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Admins manage goals" ON public.goals FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- progress_notes
CREATE POLICY "Students read own notes" ON public.progress_notes FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Admins manage notes" ON public.progress_notes FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Trigger para criar profile automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', ''), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'aluno'));
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_students_profile_updated_at BEFORE UPDATE ON public.students_profile FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
