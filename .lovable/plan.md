# Diagnóstico — falha na dieta da Eduarda (review_required)

## O que aconteceu (pelos registros da geração)
A geração rodou duas vezes: 1ª tentativa (modelo principal) reprovou; 2ª tentativa (modelo reserva) também reprovou e o sistema devolveu "revisão necessária" somando os motivos das duas.

### 1. nutrition_invalid — proteína baixa no almoço e jantar (1ª tentativa)
- Regra: almoço e jantar precisam ter **no mínimo 30 g de proteína cada**; café da manhã no mínimo 15 g.
- Gerado: jantar com 23 g em todos os dias e almoço com 22–27 g.
- Causa real: a meta total é só **92 g de proteína** (2 g/kg, correto para 46 kg), dividida em 5 refeições. Com 30 + 30 + 15 já vão 75 g, sobrando ~17 g para os 2 lanches — mas o shake noturno com whey + leite sozinho já passa de 25 g. A IA "espalhou" a proteína e o almoço/jantar ficaram abaixo do piso. O piso de 30 g é fixo e não leva em conta o peso baixo.
- A 2ª tentativa passou nesta regra.

### 2. day_targets_invalid — carboidrato por dia fora da tolerância (1ª tentativa)
- Regra: cada dia precisa ficar a ±15 g de carboidrato da meta do dia.
- Gerado: SEG/QUA/SEX com +33 g e SÁB/DOM com −49 g.
- Causa: os ±150/−225 kcal por dia são aplicados no carboidrato (≈ +37 g / −56 g). Os desvios indicam que a IA montou praticamente o **mesmo cardápio em todos os dias** (perto da média), ignorando a variação calórica diária. Não é o total de 266 g em si.

### 3. food_contract_invalid — alimento fora do catálogo (2ª tentativa)
- Regra: todo alimento precisa usar o ID real de um item do banco; alimento sem correspondência única reprova.
- Na 1ª tentativa o catálogo estava ok. Na 2ª, o modelo reserva devolveu alimento(s) sem ID válido. Os nomes digitados "Whey protein" e "Leite" não existem exatamente no banco (existem "Whey Protein Isolado", "Leite integral", "Leite Ninho", "Leite Mimosa Sem Lactose" etc.), o que é o suspeito mais provável — "Pasta de amendoim" existe. Os registros não mostram qual item foi; confirmar é o primeiro passo da correção.

### O que NÃO causou
- Idade 15 anos: nenhuma regra de validação usa a idade (só entra no cálculo da meta).
- Peso baixo: só indiretamente, por tornar a proteína total pequena para o piso fixo de 30 g.
- 266 g de carboidrato (~5,8 g/kg): nenhuma regra limita carboidrato por kg.

## Correção proposta (não aplicada)
1. **Registrar o motivo da 2ª tentativa** com detalhes (qual alimento falhou no catálogo) e devolver ao app os dias/refeições reprovados, para o card de erro mostrar exatamente o problema.
2. **Piso de proteína proporcional**: almoço/jantar = menor entre 30 g e ~25% da proteína diária (aqui ≈ 23 g); café = menor entre 15 g e ~12%.
3. **Reforçar no pedido à IA as metas de cada dia** (tabela kcal/C por dia) e, antes de reprovar, aplicar o ajuste automático de porções de carboidrato já existente no app para encaixar cada dia na meta.
4. **Lista de alimentos**: ao adicionar nomes livres no wizard, associar ao alimento do banco (ex.: "Whey protein" → "Whey Protein Isolado", "Leite" → escolher "Leite integral"), avisando se não houver correspondência.
5. Contorno imediato para gerar a dieta da Eduarda hoje: trocar na lista "Whey protein" e "Leite" pelos nomes exatos do banco e manter o shake noturno como uma das 5 refeições.

## Detalhes técnicos
- Piso: `validateDietNutrition` em `_shared/planSimilarity.ts` (padrão 30/15 g).
- Metas diárias: `validateDayTargets` (`_shared/dayTargets.ts`) com tolerância oficial C ±15.
- Gate final: `diet-agent/index.ts` `reviewRequired(validity2.reason)` concatena `fallbackReasons` da 1ª tentativa com o motivo da 2ª; falta log `food_contract` da 2ª tentativa.
