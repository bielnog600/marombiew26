INSERT INTO public.coach_voice_phrases (phrase_key, texto, categoria, tipo)
VALUES
  ('tabatav_preparar_vamoscomecar', 'Preparado? Vamos começar', 'TABATA', 'sistema'),
  ('tabatav_contagem_321', '3, 2, 1…', 'TABATA', 'sistema'),
  ('tabatav_largada_bora', 'Bora!', 'TABATA', 'sistema'),
  ('tabatav_largada_vamos', 'Vamos!', 'TABATA', 'sistema'),
  ('tabatav_largada_vai', 'Vai!', 'TABATA', 'sistema'),
  ('tabatav_largada_agora', 'Agora!', 'TABATA', 'sistema'),
  ('tabatav_largada_boraforca', 'Bora, força!', 'TABATA', 'sistema'),
  ('tabatav_descanso_umpouco', 'Descansa um pouco', 'TABATA', 'sistema'),
  ('tabatav_descanso_boa', 'Boa! Descansa', 'TABATA', 'sistema'),
  ('tabatav_descanso_soltacorpo', 'Isso! Solta o corpo', 'TABATA', 'sistema'),
  ('tabatav_respira_fundo', 'Respira fundo', 'TABATA', 'sistema'),
  ('tabatav_respira_folego', 'Recupera o fôlego', 'TABATA', 'sistema'),
  ('tabatav_blocosobe_intensidade', 'Próximo bloco, sobe a intensidade!', 'TABATA', 'sistema'),
  ('tabatav_blocomax_comtudo', 'Bloco novo, vamos com tudo!', 'TABATA', 'sistema')
ON CONFLICT (phrase_key) DO NOTHING;