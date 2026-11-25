ALTER TABLE public.foods ADD COLUMN categoria TEXT;
COMMENT ON COLUMN public.foods.categoria IS 'Família do alimento para recomendações e substituições; inferida pelo nome e editável pelo admin.';
UPDATE public.foods
SET categoria = CASE
  WHEN name ~* '(massa|macarr|espaguete|talharim|penne|fusilli|noodle|lasanha|nhoque)' THEN 'massa'
  WHEN name ~* '(tapioca|crepioca)' THEN 'tapioca'
  WHEN name ~* '(pão|pao|torrada|bisnaguinha|croissant)' THEN 'pao'
  WHEN name ~* '(aveia|granola)' THEN 'aveia'
  WHEN name ~* '(arroz)' AND name !~* '(proteína|proteina|bolacha|biscoito|papa)' THEN 'arroz'
  WHEN name ~* '(batata|mandioca|aipim|inhame|cará|cara|mandioquinha|baroa)' THEN 'tuberculo'
  WHEN name ~* '(atum|salmão|salmao|tilápia|tilapia|sardinha|bacalhau|peixe|merluza|pescada|robalo|linguado|camarão|camarao)' THEN 'peixe'
  WHEN name ~* '(frango|peru|chester|peito de frango|sobrecoxa|coxa de frango)' THEN 'carne_branca'
  WHEN name ~* '(patinho|alcatra|picanha|maminha|acém|acem|contra[ -]?filé|contra[ -]?file|carne moída|carne moida|carne bovina|filé mignon|file mignon|coxão|coxao|músculo|musculo)' THEN 'carne_vermelha'
  WHEN name ~* '(ovo|clara)' THEN 'ovo'
  WHEN name ~* '(whey|caseína|caseina|albumina)' THEN 'whey'
  WHEN name ~* '(tofu|tempeh|seitan|\mpts\M|proteína de soja|proteina de soja)' THEN 'proteina_vegetal'
  WHEN name ~* '(iogurte|queijo|leite|requeijão|requeijao|cottage|ricota|skyr|kefir)' THEN 'laticinio'
  WHEN name ~* '(feijão|feijao|lentilha|grão de bico|grao de bico|ervilha)' THEN 'leguminosa'
  WHEN name ~* '(banana|maçã|maca|mamão|mamao|morango|uva|pera|abacaxi|melancia|melão|melao|laranja|manga|kiwi|pêssego|pessego|ameixa|fruta)' THEN 'fruta'
  WHEN name ~* '(azeite|castanha|nozes|amêndoa|amendoa|amendoim|abacate|chia|linhaça|linhaca|noz|avelã|avela|pistache)' THEN 'gordura_boa'
  ELSE NULL
END
WHERE categoria IS NULL;
CREATE INDEX foods_categoria_idx ON public.foods(categoria) WHERE categoria IS NOT NULL;