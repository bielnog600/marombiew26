CREATE TABLE public.meal_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  slot text NOT NULL CHECK (slot IN ('cafe_manha','lanche_tarde','pre_treino','pos_treino','almoco','jantar','ceia')),
  name text NOT NULL,
  origin text NOT NULL DEFAULT 'BR/PT' CHECK (origin IN ('BR','PT','BR/PT')),
  tags text[] NOT NULL DEFAULT '{}',
  prep text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_bank TO authenticated;
GRANT ALL ON public.meal_bank TO service_role;
ALTER TABLE public.meal_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_bank_read_authenticated" ON public.meal_bank FOR SELECT TO authenticated USING (true);
CREATE POLICY "meal_bank_admin_write" ON public.meal_bank FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.meal_bank_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES public.meal_bank(id) ON DELETE CASCADE,
  food_id uuid NOT NULL REFERENCES public.foods(id) ON DELETE RESTRICT,
  grams numeric NOT NULL CHECK (grams > 0),
  ordem integer NOT NULL DEFAULT 0
);
CREATE INDEX meal_bank_items_meal_idx ON public.meal_bank_items(meal_id, ordem);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_bank_items TO authenticated;
GRANT ALL ON public.meal_bank_items TO service_role;
ALTER TABLE public.meal_bank_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_bank_items_read_authenticated" ON public.meal_bank_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "meal_bank_items_admin_write" ON public.meal_bank_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TEMP TABLE _meal_bank_seed ON COMMIT DROP AS
SELECT
  split_part(line, '|', 1) AS code,
  split_part(line, '|', 2) AS slot,
  split_part(line, '|', 3) AS origin,
  split_part(line, '|', 4) AS name,
  split_part(line, '|', 5) AS tags,
  split_part(line, '|', 6) AS prep,
  split_part(line, '|', 7) AS items
FROM regexp_split_to_table($seed$
CM01|cafe_manha|BR|Pão com ovo mexido e queijo minas|salgado,prático|Ovos mexidos na frigideira antiaderente, queijo no pão. Fruta à parte.|Pão francês 50; Ovo 100; Queijo minas frescal 30; Mamão 150
CM02|cafe_manha|BR|Tapioca de frango com requeijão|salgado|Tapioca na frigideira, recheio de frango desfiado + requeijão.|Tapioca (goma pronta) 60; Frango desfiado 60; Requeijão light 20; Morango 100
CM03|cafe_manha|BR|Crepioca de queijo e tomate|salgado,proteico|Bater ovos com a tapioca, fazer como panqueca, rechear com queijo e tomate.|Ovo 100; Tapioca (goma pronta) 30; Mussarela 20; Tomate 50; Banana 80
CM04|cafe_manha|BR|Cuscuz com ovos e queijo|salgado,nordestino|Cuscuz no cuscuzeiro ou micro-ondas; ovos mexidos por cima.|Cuscuz de milho cozido 150; Ovo 100; Queijo minas frescal 30
CM05|cafe_manha|BR/PT|Panqueca de banana e aveia proteica|doce,proteico|Amassar banana, misturar ovo, claras, aveia e whey; dourar na frigideira dos dois lados.|Banana 100; Ovo 50; Clara de ovo 66; Aveia em flocos 30; Whey Protein Concentrado 15
CM06|cafe_manha|BR/PT|Overnight oats com iogurte e frutas vermelhas|doce,prepara na véspera|Misturar tudo num pote e deixar na geladeira de um dia pro outro.|Aveia em flocos 40; Iogurte tipo Grego Natural Light 170; Frutas vermelhas congeladas 80; Chia 10; Mel 10
CM07|cafe_manha|BR/PT|Torrada integral com abacate e ovo|salgado|Amassar o abacate com sal e limão na torrada; ovo cozido ou pochê por cima.|Pão integral 50; Abacate 60; Ovo 100; Tomate 50
CM08|cafe_manha|BR/PT|Iogurte grego com granola e banana|doce,prático|Misturar o whey no iogurte, granola e banana por cima.|Iogurte tipo Grego Natural Light 170; Granola sem açúcar 30; Banana 80; Whey Protein Concentrado 15
CM09|cafe_manha|BR|Pão com peito de peru e queijo + mamão|salgado,prático|Sanduíche simples; pode ir na sanduicheira.|Pão francês 50; Fiambre de peru 40; Queijo minas frescal 30; Mamão 150
CM10|cafe_manha|PT|Tostas de broa com ovos mexidos|salgado|Broa torrada + ovos mexidos com tomate.|Broa de milho 60; Ovo 100; Tomate 60
CM11|cafe_manha|PT|Skyr com aveia, maçã e canela|doce,prático|Maçã picada com canela, aveia e nozes por cima do skyr.|Iogurte Skyr Natural 170; Aveia em flocos 30; Maçã 130; Nozes 10
CM12|cafe_manha|BR/PT|Omelete de espinafre e cottage + pão|salgado,proteico|Omelete com espinafre, cottage por cima ao final.|Ovo 100; Clara de ovo 66; Espinafre refogado 50; Queijo cottage 50; Pão integral 50
CM13|cafe_manha|BR/PT|Vitamina proteica de banana e cacau|doce,líquido|Bater tudo no liquidificador com gelo.|Leite desnatado 250; Banana 100; Aveia em flocos 20; Whey Protein Concentrado 25; Cacau em pó 100% 5
CM14|cafe_manha|BR|Tapioca invertida de muçarela|salgado|Queijo direto na frigideira, tapioca por cima; virar quando firmar. Ovo cozido à parte.|Tapioca (goma pronta) 40; Mussarela 30; Requeijão light 15; Ovo 50; Manga 120
CM15|cafe_manha|BR|Broa de frigideira de fubá com queijo|salgado|Misturar flocão/fubá, ovo, leite e queijo; dourar em fogo baixo.|Cuscuz de milho cozido 80; Ovo 50; Leite desnatado 30; Queijo minas frescal 30; Uvas 100
LT01|lanche_tarde|BR/PT|Iogurte natural com whey, aveia e manga|doce,prático|Misturar o whey no iogurte até ficar cremoso. Por cima a aveia e a manga em cubos.|Iogurte natural desnatado 170; Whey Protein Concentrado 20; Aveia em flocos 20; Manga 100
LT02|lanche_tarde|BR|Sanduíche natural de frango|salgado,leva fácil|Frango desfiado com requeijão e cenoura ralada.|Pão integral 50; Frango desfiado 60; Requeijão light 15; Cenoura cozida 20; Salada de folhas 20
LT03|lanche_tarde|BR/PT|Wrap de atum com ovo|salgado,leva fácil|Atum + ovo cozido amassado + iogurte como maionese; enrolar e dourar na frigideira.|Tortilha integral 40; Atum em água 60; Ovo 50; Iogurte natural desnatado 20; Pepino 30
LT04|lanche_tarde|BR/PT|Maçã com pasta de amendoim + iogurte grego|doce,prático|Maçã fatiada com a pasta de amendoim por cima. Iogurte à parte.|Maçã 130; Pasta de amendoim 15; Iogurte tipo Grego Natural Light 120
LT05|lanche_tarde|BR/PT|Cookie fit de banana e aveia (2 un) + leite|doce,receita|Amassar banana, misturar aveia e pasta de amendoim, modelar e assar 180 °C por 15–20 min.|Banana 60; Aveia em flocos 30; Pasta de amendoim 10; Leite desnatado 200
LT06|lanche_tarde|BR/PT|Bolinho proteico de maçã e canela (2 un)|doce,receita,marmita|Misturar tudo com canela, forminhas, 180 °C por ~20 min.|Ovo 50; Aveia em flocos 30; Whey Protein Concentrado 20; Maçã 80
LT07|lanche_tarde|BR|Pão de queijo de frigideira|salgado,receita|Misturar tapioca, ovo, queijo ralado e iogurte; tampar a frigideira e dourar dos dois lados.|Tapioca (goma pronta) 30; Ovo 50; Queijo minas frescal 30; Iogurte natural desnatado 30; Uvas 100
LT08|lanche_tarde|BR/PT|Cottage com torradas e tomate|salgado|Cottage sobre as torradas e o biscoito de arroz, tomate em rodelas, sal e orégano.|Queijo cottage 100; Biscoito de arroz integral 20; Tomate 60; Pão integral 25
LT09|lanche_tarde|BR/PT|Shake de whey com banana e aveia|doce,líquido,prático|Bater tudo no liquidificador com gelo.|Whey Protein Concentrado 30; Banana 100; Aveia em flocos 20; Leite desnatado 200
LT10|lanche_tarde|BR|Iogurte com leite em pó e morangos|doce,sem whey|Misturar o leite em pó no iogurte até ficar cremoso.|Iogurte natural desnatado 170; Leite em pó desnatado 20; Morango 120; Granola sem açúcar 15
LT11|lanche_tarde|PT|Skyr com frutas vermelhas e amêndoas|doce,prático|Skyr na taça, frutas vermelhas por cima (pode descongelar antes) e amêndoas picadas.|Iogurte Skyr Natural 170; Frutas vermelhas congeladas 80; Amêndoas 15
LT12|lanche_tarde|PT|Tosta de broa com fiambre de peru e queijo|salgado|Tostar a broa, montar com o fiambre e o queijo. Maçã à parte.|Broa de milho 50; Fiambre de peru 40; Queijo minas frescal 30; Maçã 130
LT13|lanche_tarde|BR|Crepioca de cacau com banana|doce,receita|Bater ovo, clara, tapioca e cacau; rechear com banana e canela.|Ovo 50; Clara de ovo 33; Tapioca (goma pronta) 20; Cacau em pó 100% 5; Banana 80
LT14|lanche_tarde|BR|Mini pão de batata recheado de frango|salgado,receita,marmita|Purê de batata + tapioca vira massa; rechear com frango e requeijão, assar até dourar.|Batata inglesa cozida 100; Tapioca (goma pronta) 20; Frango desfiado 50; Requeijão light 15
PRE01|pre_treino|BR/PT|Pão com mel ou geleia + café|rápido,30-60 min antes|Pão com mel e café preto. Pouca gordura e fibra para digerir rápido.|Pão francês 50; Mel 15
PRE02|pre_treino|BR/PT|Banana com aveia e mel|rápido,30-60 min antes|Banana amassada ou em rodelas, aveia e mel por cima.|Banana 120; Aveia em flocos 15; Mel 10
PRE03|pre_treino|BR/PT|Biscoito de arroz com mel e banana|rápido,treino volumoso|Biscoito de arroz com mel e rodelas de banana por cima.|Biscoito de arroz integral 25; Mel 15; Banana 80
PRE04|pre_treino|BR/PT|Tâmaras + café|rápido,até 30 min antes|3–4 tâmaras com café preto (cafeína).|Tâmara seca 40
PRE05|pre_treino|BR|Pão com doce de leite e banana|rápido,30-60 min antes|Pão aberto com o doce de leite e rodelas de banana.|Pão francês 50; Dulce de Leche 20; Banana 60
PRE06|pre_treino|BR/PT|Iogurte batido com fruta e mel|1h antes|Bater o iogurte com a manga e o mel. Tomar gelado.|Iogurte natural desnatado 170; Manga 100; Mel 10
PRE07|pre_treino|BR|Tapioca com geleia|1h antes|Tapioca na frigideira antiaderente, recheio de geleia.|Tapioca (goma pronta) 50; Geleia sem açúcar 20
PRE08|pre_treino|BR/PT|Melancia com pitada de sal|treino em jejum/calor|Melancia em cubos com uma pitada de sal. Boa para quem treina cedo ou no calor.|Melancia 300
PRE09|pre_treino|BR/PT|Uva-passa com água de coco|cardio longo|Uva-passa e água de coco gelada antes ou durante o cardio.|Uva-passa 30; Água de coco 300
PRE10|pre_treino|BR/PT|Mingau de aveia com banana|1h30 antes|Cozinhar a aveia no leite por 3–4 min mexendo, banana e mel por cima.|Aveia em flocos 30; Leite desnatado 200; Banana 80; Mel 10
PRE11|pre_treino|BR/PT|Pão com ovo e fruta|1h30-2h antes|Ovo mexido ou cozido no pão, maçã à parte.|Pão francês 50; Ovo 50; Maçã 130
PRE12|pre_treino|BR|Batata-doce com frango (refeição 2h antes)|2h antes,refeição|Batata-doce cozida, frango desfiado temperado e legumes. Dá para levar em marmita.|Batata-doce cozida 150; Frango desfiado 80; Legumes cozidos variados 60
PRE13|pre_treino|BR|Cuscuz com mel e banana|1h antes|Cuscuz hidratado e cozido no vapor, mel e banana por cima.|Cuscuz de milho cozido 120; Mel 10; Banana 60
PRE14|pre_treino|PT|Torradas com geleia + iogurte proteico|1h antes|Torradas com geleia, Skyr à parte.|Pão integral 50; Geleia sem açúcar 20; Iogurte Skyr Natural 120
POS01|pos_treino|BR/PT|Shake de whey + banana + pão com mel|rápido|Bater o whey com água ou gelo. Pão com mel e a banana junto.|Whey Protein Concentrado 30; Banana 120; Pão francês 50; Mel 10
POS02|pos_treino|BR/PT|Pão com ovos mexidos + fruta|rápido|Ovo e claras mexidos na frigideira antiaderente, dentro do pão. Manga à parte.|Pão francês 50; Ovo 100; Clara de ovo 66; Manga 120
POS03|pos_treino|BR|Arroz, frango e legumes|refeição|Arroz, frango grelhado em tiras e legumes salteados no mesmo prato.|Arroz branco cozido 150; Peito de frango grelhado 120; Legumes cozidos variados 80
POS04|pos_treino|BR|Tapioca de frango + uva|refeição leve|Tapioca na frigideira, recheio de frango desfiado e requeijão. Uva à parte.|Tapioca (goma pronta) 60; Frango desfiado 80; Requeijão light 15; Uvas 120
POS05|pos_treino|BR/PT|Mingau proteico de aveia com whey e fruta|doce|Cozinhar aveia no leite, desligar o fogo e misturar o whey.|Aveia em flocos 40; Leite desnatado 200; Whey Protein Concentrado 25; Banana 80
POS06|pos_treino|BR/PT|Panqueca de banana com whey + mel|doce,receita|Amassar a banana, misturar ovo, claras, aveia e whey. Dourar na frigideira dos dois lados e regar com mel.|Banana 100; Ovo 50; Clara de ovo 66; Aveia em flocos 30; Whey Protein Concentrado 20; Mel 10
POS07|pos_treino|BR/PT|Macarrão com carne moída e molho|refeição|Refogar a carne moída, juntar o molho de tomate e misturar ao macarrão cozido.|Massa cozida 180; Carne moída magra cozida 110; Molho de tomate caseiro 80
POS08|pos_treino|BR|Batata com tilápia e salada|refeição|Tilápia grelhada com sal e limão, batata cozida e salada de folhas.|Batata inglesa cozida 250; Tilápia grelhada 150; Salada de folhas 60
POS09|pos_treino|BR/PT|Iogurte grego + granola + whey + frutas|doce,prático|Misturar o whey no iogurte, granola e frutas por cima.|Iogurte tipo Grego Natural Light 170; Whey Protein Concentrado 20; Granola sem açúcar 30; Morango 100; Banana 60
POS10|pos_treino|BR/PT|Wrap de frango com queijo|salgado,leva fácil|Aquecer o wrap, rechear com frango, muçarela e tomate. Pode dourar na frigideira.|Tortilha integral 80; Frango desfiado 100; Mussarela 20; Tomate 50
POS11|pos_treino|BR|Cuscuz com frango desfiado|salgado|Cuscuz no vapor, frango desfiado temperado e tomate picado por cima.|Cuscuz de milho cozido 180; Frango desfiado 100; Tomate 40
POS12|pos_treino|BR/PT|Arroz com atum e ovo|salgado,prático|Arroz com o atum escorrido e o ovo cozido ou mexido. Folhas ao lado.|Arroz branco cozido 150; Atum em água 80; Ovo 50; Salada de folhas 40
POS13|pos_treino|BR/PT|Pão com ovo na air fryer + iogurte|salgado|Ovos e muçarela dentro do pão na air fryer 6–8 min a 180 °C. Skyr à parte.|Pão francês 50; Ovo 100; Mussarela 15; Iogurte Skyr Natural 170
POS14|pos_treino|BR/PT|Leite com cacau e whey + banana|líquido,rápido|Bater leite, whey e cacau. Banana junto ou batida no shake.|Leite desnatado 300; Whey Protein Concentrado 25; Cacau em pó 100% 5; Banana 120
AL01|almoco|BR|Arroz, feijão, frango grelhado e salada|clássico|Arroz e feijão, frango grelhado com sal e alho, salada de folhas e tomate com o azeite.|Arroz branco cozido 130; Feijão carioca cozido 100; Peito de frango grelhado 130; Salada de folhas 80; Tomate 60; Azeite de oliva 5
AL02|almoco|BR|Arroz, feijão, carne acebolada e abobrinha|clássico|Carne em tiras grelhada com cebola, abobrinha refogada, arroz e feijão.|Arroz branco cozido 130; Feijão carioca cozido 100; Alcatra grelhada 120; Abobrinha refogada 100
AL03|almoco|BR|Arroz, feijão preto, carne moída e cenoura|clássico|Carne moída refogada com alho e cebola, cenoura cozida, arroz e feijão preto.|Arroz branco cozido 130; Feijão preto cozido 100; Carne moída magra cozida 120; Cenoura cozida 80
AL04|almoco|BR|Batata-doce, tilápia e brócolis|sem arroz|Tilápia grelhada com limão, batata-doce cozida e brócolis no vapor com o azeite.|Batata-doce cozida 180; Tilápia grelhada 160; Brócolis cozido 100; Azeite de oliva 5
AL05|almoco|BR/PT|Macarrão integral com frango e legumes|sem arroz|Macarrão integral com frango em tiras, legumes salteados e molho de tomate.|Macarrão integral cozido 160; Peito de frango grelhado 130; Legumes cozidos variados 100; Molho de tomate caseiro 60
AL06|almoco|BR/PT|Bowl de quinoa, grão-de-bico e frango|bowl|Montar o bowl: quinoa, grão-de-bico, frango em cubos, pepino e tomate, azeite por cima.|Quinoa cozida 100; Grão de bico cozido 60; Peito de frango grelhado 120; Pepino 60; Tomate 60; Azeite de oliva 5
AL07|almoco|BR|Arroz integral, sobrecoxa assada e vagem|clássico|Sobrecoxa assada no forno com temperos, arroz integral, feijão e vagem cozida.|Arroz integral 130; Sobrecoxa de frango assada sem pele 130; Vagem cozida 100; Feijão carioca cozido 80
AL08|almoco|PT|Bacalhau com batata, grão e brócolis|português|Bacalhau cozido com batata, regar com azeite e alho.|Bacalhau demolhado cozido 160; Batata inglesa cozida 200; Grão de bico cozido 50; Brócolis cozido 80; Azeite de oliva 8
AL09|almoco|BR/PT|Lombo de porco com arroz e couve|clássico|Lombo assado fatiado, arroz, feijão preto e couve refogada.|Lombo de porco assado 130; Arroz branco cozido 130; Couve refogada 60; Feijão preto cozido 80
AL10|almoco|BR/PT|Salmão, arroz e legumes|peixe|Salmão grelhado com sal e limão, arroz e legumes salteados.|Salmão grelhado 130; Arroz branco cozido 130; Legumes cozidos variados 100
AL11|almoco|BR|Escondidinho de mandioca com carne moída|receita|Purê de mandioca por cima da carne moída, queijo e forno.|Mandioca cozida 180; Carne moída magra cozida 120; Mussarela 15; Salada de folhas 60
AL12|almoco|PT|Pescada cozida com batata e cenoura|peixe,português|Pescada cozida, batata e cenoura cozidas, azeite por cima.|Pescada cozida 180; Batata inglesa cozida 200; Cenoura cozida 80; Azeite de oliva 8
AL13|almoco|PT|Feijão-frade com atum, ovo e arroz|português|Salada morna de feijão-frade com atum, ovo cozido, cebola roxa e azeite; arroz ao lado.|Feijão-frade cozido 120; Atum em água 80; Ovo 50; Arroz branco cozido 100; Cebola roxa 20; Azeite de oliva 5
AL14|almoco|BR/PT|Salada de macarrão com frango|fria,marmita|Misturar macarrão, frango, milho, cenoura e folhas com molho de iogurte e mostarda.|Massa cozida 130; Frango desfiado 110; Milho cozido 40; Cenoura cozida 40; Salada de folhas 40; Iogurte natural desnatado 40
AL15|almoco|BR/PT|Arroz, lentilha, frango e abóbora|clássico|Arroz, lentilha cozida, frango grelhado e abóbora cozida ou assada.|Arroz branco cozido 120; Lentilhas cozidas 100; Peito de frango grelhado 120; Abóbora cabotiá / menina cozida 100
JA01|jantar|BR/PT|Omelete de cottage e espinafre + salada|low carb|Bater os ovos com o cottage, juntar o espinafre e fazer a omelete. Salada de folhas ao lado.|Ovo 150; Queijo cottage 60; Espinafre refogado 80; Salada de folhas 80
JA02|jantar|BR/PT|Salmão com legumes e batata|peixe|Salmão grelhado, legumes salteados e batata cozida.|Salmão grelhado 130; Legumes cozidos variados 120; Batata inglesa cozida 120
JA03|jantar|BR/PT|Frango com purê de abóbora e vagem|leve|Frango grelhado, abóbora cozida amassada em purê e vagem cozida.|Peito de frango grelhado 140; Abóbora cabotiá / menina cozida 150; Vagem cozida 100
JA04|jantar|BR|Crepioca recheada de frango|prático|Bater os ovos com a tapioca, fazer como panqueca e rechear com frango, requeijão e tomate.|Ovo 100; Tapioca (goma pronta) 30; Frango desfiado 80; Requeijão light 15; Tomate 50
JA05|jantar|BR/PT|Wrap de atum com ovo e salada|prático|Wrap com atum escorrido, ovo cozido picado, pepino e folhas. Enrolar e servir.|Tortilha integral 40; Atum em água 80; Ovo 50; Pepino 40; Salada de folhas 40
JA06|jantar|BR|Pizza proteica de Rap10|prático,receita|Rap10 de base, molho, frango, queijo e tomate; air fryer 5 min.|Tortilha integral 40; Molho de tomate caseiro 40; Frango desfiado 80; Mussarela 25; Tomate 40
JA07|jantar|BR|Escondidinho rápido de batata com frango|micro-ondas|Batata no micro-ondas 5–7 min, amassar, frango e queijo por cima.|Batata inglesa cozida 180; Frango desfiado 90; Mussarela 20
JA08|jantar|BR|Cuscuz com carne moída e vinagrete|nordestino|Cuscuz no vapor, carne moída refogada e vinagrete de tomate e cebola roxa.|Cuscuz de milho cozido 150; Carne moída magra cozida 100; Tomate 60; Cebola roxa 20
JA09|jantar|BR/PT|Sopa de legumes com frango|sopa|Cozinhar os legumes, bater ou deixar em pedaços e juntar o frango desfiado.|Frango desfiado 100; Batata inglesa cozida 100; Cenoura cozida 60; Abóbora cabotiá / menina cozida 80; Couve refogada 30
JA10|jantar|BR/PT|Camarão com abobrinha e arroz|peixe|Camarão salteado no azeite com alho, abobrinha refogada e arroz.|Camarão grelhado 150; Abobrinha refogada 150; Arroz branco cozido 100; Azeite de oliva 5
JA11|jantar|BR/PT|Bowl de atum com grão-de-bico|bowl,frio|Montar o bowl: atum escorrido, grão-de-bico, tomate, pepino e cebola roxa, azeite por cima.|Atum em água 100; Grão de bico cozido 80; Tomate 60; Pepino 60; Cebola roxa 20; Azeite de oliva 5
JA12|jantar|BR/PT|Carne grelhada com salada e abacate|low carb|Carne grelhada fatiada sobre a salada de folhas e tomate, abacate em cubos.|Alcatra grelhada 130; Salada de folhas 100; Tomate 60; Abacate 50
JA13|jantar|BR|Arroz cremoso com frango e legumes|prático|Arroz cozido com o frango desfiado e os legumes, finalizar com o requeijão para ficar cremoso.|Arroz branco cozido 120; Frango desfiado 100; Legumes cozidos variados 80; Requeijão light 15
JA14|jantar|BR|Tilápia com batata-doce e salada|peixe|Tilápia grelhada com limão, batata-doce cozida e salada de folhas.|Tilápia grelhada 160; Batata-doce cozida 120; Salada de folhas 80
JA15|jantar|PT|Sardinhas com batata e salada|português,peixe|Sardinhas escorridas, batata cozida, salada de folhas e tomate.|Sardinha em lata (óleo, escorrida) 100; Batata inglesa cozida 150; Salada de folhas 80; Tomate 60
JA16|jantar|PT|Ovos mexidos com cogumelos e torrada|prático|Ovos mexidos com os cogumelos salteados, pão torrado ao lado.|Ovo 150; Cogumelos 80; Pão integral 50
CE01|ceia|BR/PT|Iogurte grego com chia|pré-sono|Misturar a chia no iogurte e esperar 10 min.|Iogurte tipo Grego Natural Light 170; Chia 10
CE02|ceia|BR/PT|Cottage com morangos|pré-sono|Cottage com morangos picados por cima.|Queijo cottage 120; Morango 80
CE03|ceia|BR/PT|Leite morno com cacau|pré-sono|Aquecer o leite e misturar o cacau. Pode adoçar com adoçante.|Leite desnatado 250; Cacau em pó 100% 5
CE04|ceia|PT|Skyr com nozes|pré-sono|Skyr com nozes picadas por cima.|Iogurte Skyr Natural 170; Nozes 10
CE05|ceia|BR/PT|Ovos cozidos com tomate|salgado|Ovos cozidos com tomate em rodelas, sal e orégano.|Ovo 100; Tomate 80
$seed$, E'\n') AS line
WHERE trim(line) <> '';

INSERT INTO public.meal_bank (code, slot, origin, name, tags, prep)
SELECT code, slot, origin, name,
  array_remove(array(SELECT trim(t) FROM unnest(string_to_array(tags, ',')) t), ''),
  NULLIF(prep, '')
FROM _meal_bank_seed;

INSERT INTO public.meal_bank_items (meal_id, food_id, grams, ordem)
SELECT mb.id, f.id, v.grams, v.ordem
FROM (
  SELECT s.code, (t.ord - 1)::int AS ordem,
    (regexp_match(trim(t.v), '^(.+?)\s+([0-9.]+)$'))[1] AS food_name,
    (regexp_match(trim(t.v), '^(.+?)\s+([0-9.]+)$'))[2]::numeric AS grams
  FROM _meal_bank_seed s, unnest(string_to_array(s.items, ';')) WITH ORDINALITY AS t(v, ord)
) v
JOIN public.meal_bank mb ON mb.code = v.code
JOIN public.foods f ON f.name = v.food_name;