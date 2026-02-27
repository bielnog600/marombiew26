
-- Fix ALL RLS policies to be PERMISSIVE instead of RESTRICTIVE

-- profiles
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- user_roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;

CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- students_profile
DROP POLICY IF EXISTS "Admins manage students" ON public.students_profile;
DROP POLICY IF EXISTS "Students read own" ON public.students_profile;

CREATE POLICY "Admins manage students" ON public.students_profile FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students read own" ON public.students_profile FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- assessments
DROP POLICY IF EXISTS "Admins manage assessments" ON public.assessments;
DROP POLICY IF EXISTS "Students read own assessments" ON public.assessments;

CREATE POLICY "Admins manage assessments" ON public.assessments FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students read own assessments" ON public.assessments FOR SELECT TO authenticated USING (auth.uid() = student_id);

-- anamnese
DROP POLICY IF EXISTS "Admin manage anamnese" ON public.anamnese;
DROP POLICY IF EXISTS "Read via assessment" ON public.anamnese;

CREATE POLICY "Admin manage anamnese" ON public.anamnese FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Read via assessment" ON public.anamnese FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM assessments a WHERE a.id = anamnese.assessment_id AND (a.student_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- anthropometrics
DROP POLICY IF EXISTS "Admin manage anthropometrics" ON public.anthropometrics;
DROP POLICY IF EXISTS "Read anthropometrics via assessment" ON public.anthropometrics;

CREATE POLICY "Admin manage anthropometrics" ON public.anthropometrics FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Read anthropometrics via assessment" ON public.anthropometrics FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM assessments a WHERE a.id = anthropometrics.assessment_id AND (a.student_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- assessment_photos
DROP POLICY IF EXISTS "Admin manage photos" ON public.assessment_photos;
DROP POLICY IF EXISTS "Read photos via assessment" ON public.assessment_photos;

CREATE POLICY "Admin manage photos" ON public.assessment_photos FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Read photos via assessment" ON public.assessment_photos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM assessments a WHERE a.id = assessment_photos.assessment_id AND (a.student_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- composition
DROP POLICY IF EXISTS "Admin manage composition" ON public.composition;
DROP POLICY IF EXISTS "Read composition via assessment" ON public.composition;

CREATE POLICY "Admin manage composition" ON public.composition FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Read composition via assessment" ON public.composition FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM assessments a WHERE a.id = composition.assessment_id AND (a.student_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- goals
DROP POLICY IF EXISTS "Admins manage goals" ON public.goals;
DROP POLICY IF EXISTS "Students read own goals" ON public.goals;

CREATE POLICY "Admins manage goals" ON public.goals FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students read own goals" ON public.goals FOR SELECT TO authenticated USING (auth.uid() = student_id);

-- performance_tests
DROP POLICY IF EXISTS "Admin manage performance" ON public.performance_tests;
DROP POLICY IF EXISTS "Read performance via assessment" ON public.performance_tests;

CREATE POLICY "Admin manage performance" ON public.performance_tests FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Read performance via assessment" ON public.performance_tests FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM assessments a WHERE a.id = performance_tests.assessment_id AND (a.student_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- posture
DROP POLICY IF EXISTS "Admin manage posture" ON public.posture;
DROP POLICY IF EXISTS "Read posture via assessment" ON public.posture;

CREATE POLICY "Admin manage posture" ON public.posture FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Read posture via assessment" ON public.posture FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM assessments a WHERE a.id = posture.assessment_id AND (a.student_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- progress_notes
DROP POLICY IF EXISTS "Admins manage notes" ON public.progress_notes;
DROP POLICY IF EXISTS "Students read own notes" ON public.progress_notes;

CREATE POLICY "Admins manage notes" ON public.progress_notes FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students read own notes" ON public.progress_notes FOR SELECT TO authenticated USING (auth.uid() = student_id);

-- skinfolds
DROP POLICY IF EXISTS "Admin manage skinfolds" ON public.skinfolds;
DROP POLICY IF EXISTS "Read skinfolds via assessment" ON public.skinfolds;

CREATE POLICY "Admin manage skinfolds" ON public.skinfolds FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Read skinfolds via assessment" ON public.skinfolds FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM assessments a WHERE a.id = skinfolds.assessment_id AND (a.student_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- vitals
DROP POLICY IF EXISTS "Admin manage vitals" ON public.vitals;
DROP POLICY IF EXISTS "Read vitals via assessment" ON public.vitals;

CREATE POLICY "Admin manage vitals" ON public.vitals FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Read vitals via assessment" ON public.vitals FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM assessments a WHERE a.id = vitals.assessment_id AND (a.student_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));
