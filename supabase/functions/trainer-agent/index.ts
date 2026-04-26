import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXERCISE_DATABASE = `
========================================
BANCO DE EXERCÍCIOS (OBRIGATÓRIO)
========================================

REGRA ABSOLUTA: Todos os exercícios nas colunas EXERCÍCIO e VARIAÇÃO devem ser copiados EXATAMENTE como aparecem abaixo. Não invente nomes. Se não encontrar equivalente, peça para atualizar o banco.

--- QUADRÍCEPS ---
GLOBET SQUATS, AFUNDO CAIXA, HACK MACHINE, AFUNDO COM DOIS STEPS, AGACHAMENTO SMITH, SUMÔ TERRA, CADEIRA EXTENSORA, BÚLGARO, ESTABILIDADE DE JOELHO, LEG PRESS, AFUNDO HALTERES, AGACHAMENTO LIVRE, AFUNDO C/ BARRA, AFUNDO ALTERNANDO, LEG PRESS UNIL, PASSADAS, AFUNDO CAIXA ALTERN., AFUNDO SMITH, AFUNDO SMITH 2, SUMÔ COM HALTER, SUMÔ COM HALTER 2, JUMPS, SALTO LATERAL, SALTO LATERAL 2, AGACHAMENTO ISOMETRIA, AGACHAMENTO, AFUNDO S/ PESO, MINI SQUATS, PASSADA S/ PESO, LEG 180, ISOMETRIA PAREDE, LEG PRESS 45 ART, BÚLGARO SMITH

--- ISQUIOTIBIAIS ---
MESA FLEXORA, STIFF ROMENO, HIPEREXTENSÃO LOMBAR, STIFF NA POLIA, FLEXÃO NORDICA, GOOD MORNING SMITH, STIFF HALTERES, FLEXORA ALTERNANDO, FLEXORA UNILATERAL, CADEIRA FLEXORA, CADEIRA FLEXORA 2, STIFF UNILATERAL

--- PEITORAL ---
PECK DECK, SUPINO VERTICAL, SUPINO RETO, CRUCIFIXO INCLINADO, SUPINO INCLINADO SMITH, PARALELA, SUPINO RETO HALTERES, CROSS OVER, CRUCIFIXO RETO, FLEXÃO DE BRAÇO, MOBILIDADE TORÁCICA, MOBILIDADE TORÁCICA 2, MOBILIDADE TORÁCICA 3, SUPINO INCLINADO HALTERES, SUPINO RETO SMITH, SUPINO INCLINADO BARRA, PARALELA GRAVITON, FLEXÃO DE BRAÇO ADAP., CRUCIFIXO INCLINADO POLIA, CRUCIFIXO RETO POLIA, FLEXÃO+ALPINISTA, SUPINO RETO ARTICULADO, SUPINO INCLINADO ART., FLY MACHINE, SUPINO VERTICAL 2, SUPINO VERT. INCLINADO, SUPINO VERT. INCLINADO 2, SUPINO VERTICAL NEUTRA

--- DORSAL ---
PUXADA ALTA ABERTA, PUXADA NA POLIA, PUXADA GRAVITON, PULL DOWN, PUXADA ALTA TRIÂNGULO, REMADA CAVALINHO, REMADA UNILATERAL, FACE PULL, CRUCIFIXO INVERSO, REMADA MÁQUINA, REMADA TRIÂNGULO, REMADA UNILATERAL 2, MOBILIDADE ESCAPULAR, CRUCIFIXO INVERSO SENTADO, CRUCIFIXO INVERSO BANCO, REMADA CURVADA SUPINADA, REMADA CURVADA PRONADA, REMADA PRONADA, REMADA SUPINADA MÁQUINA, REMADA MÁQUINA UNIL., REMADA UNIL. SENTADO, REMADA SUPINADA, REMADA PRONADA MÁQUINA, REMADA UNIL. POLIA, REMADA PRONADA MAQ. 2, REMADA PRONADA MAQ. 3, REMADA NEUTRA MAQ., REMADA SUPINADA ART., REMADA NEUTRA ART., REMADA PRONADA MAQ. 4, REMADA NEUTRA MAQ.2, PUXADA ALTA ART., PUXADA ALTA ART. 2, PUXADA ALTA NEUTRA, CAVALINHO NEUTRA, CAVALINHO PRONADA, PUXADA ALTA UNIL., REMADA UNIL. ART., PULLDOWN

--- DELTÓIDES ---
DESENV. ARNOLD, ELEVAÇÃO FRONTAL, DESENV. MÁQUINA, ELEVAÇÃO LATERAL, MOBILIDADE OMBRO, ELEVAÇÃO FRONTAL UNIL, ELEVAÇÃO FRONTAL NEUTRA, DESENV. OMBRO BARRA, ELEVAÇÃO FRONTAL POLIA, ELEVAÇÃO FRONTAL POLIA 2, ELEVAÇÃO LATERAL UNIL., DESENV. HALTERES, REMADA ALTA POLIA, ELEVAÇÃO FRONTAL 2, DESENV. MACHINE 2, ELEVAÇÃO LATERAL MÁQ., DESENV. MACHINE NEUTRA, REAR DELT FLY, SWING

--- BÍCEPS ---
ROSCA DIRETA C/ HALTERES, ROSCA ALTERNADA, BICEPS BARRA W, BICEPS CORDA, BICEPS BARRA POLIA, ROSCA SCOTT, ROSCA SCOTT UNIL, BÍCEPS MARTELO, MARTELO ALTERNANDO, BÍCEPS BARRA W PRONADA, ROSCA SUPINADA, ROSCA ALTERNADA MÁQ., ROSCA DIRETA MÁQ.

--- TRÍCEPS ---
TRÍCEPS CORDA, TRÍCEPS FRANCÊS, TRÍCEPS SMITH, TRÍCEPS TESTA C/ BARRA, TRÍCEPS UNILATERAL, TRÍCEPS TESTA HALTERES, TRÍCEPS BARRA, TRÍCEPS FRANCÊS UNIL., TRÍCEPS CAIXA, TRÍCEPS BARRA 2, TRÍCEPS CORDA 2

--- ABDOMEN ---
ABDOMINAL BOLA SUIÇA, PRANCHA FRONTAL, ABDOMINAL SUPRA, ABDOMINAL INFRA, ABDOMINAL SUPRA PESO, ABDOMINAL SUPRA PESO 2, ABS SENTADO 1, ABS SENTADO 2, ABS CANIVETE, MOUTAIN CLIMBERS, MOUTAIN CLIMBERS 2, PRANCHA LATERAL, ABS RODA, ABS ROTATE, ABS DIAGONAL, PRANCHA 2, PRANCHA ESCADA, CANIVETE ADAPTADO, CANIVETE ADAPTADO 2, ABS RUSSIAN, ALONGAMENTO ABS

--- GLÚTEOS ---
ELEVAÇÃO PELVICA, CADEIRA ABDUTORA, PESO MORTO, ALONGAMENTO GLÚTEO, ALONGAMENTO GLÚTEO 2, KICK BACK, GOOD MORNING, MOBILIDADE QUADRIL 4, ELEVAÇÃO PÉLVICA UNIL., ABDUÇAO DE QUADRIL EM PÉ, ELEVAÇÃO PÉLVICA, ELEVAÇÃO PÉLVICA 2, MOBILIDADE QUADRIL 6

--- ADUTORES ---
MOBILIDADE DE QUADRIL, MOBILIDADE DE QUADRIL 2, CADEIRA ADUTORA, MOBILIDADE QUADRIL 3, MOBILIDADE QUADRIL 5, ALONGAMENTO ADUTORES

--- GASTROCNEMIUS (PANTURRILHA) ---
GÊMEOS UNILATERAL, MOBILIDADE TORNOZELO, GÊMEOS EM PÉ, GÊMEOS SENTADO, GEMEOS SMITH, GÊMEOS LEG PRESS

--- LOMBAR ---
HIPEREXTENSÃO LOMBAR 2

--- CARDIO ---
AIR BIKE, ESCADA, PASSADEIRA (CAMINHADA), PASSADEIRA (CORRIDA), REMO, CORRIDA INTERVALADA, ESTEIRA CURVA, BIKE SENTADO, BIKE EM PÉ, CORDA NAVAL (BI), CORDA NAVAL (UNIL), ESTEIRA CURVA HARD, POLICHINELO, ELÍPTICO, ELÍPTICO (TIRO), BURPEES, BURPEES 2, SKIPS, SKI

--- MOBILIDADE ---
ESCAPULAR, OMBRO

--- ANTEBRAÇO ---
ROSCA PRONADA BARRA
`;

const SYSTEM_PROMPT = `Você é um personal trainer com mais de 15 anos de profissão, várias especializações e experiência em fisiculturismo e reabilitação esportiva.

Você cria treinos personalizados para hipertrofia e emagrecimento, incluindo técnicas avançadas, periodização e variações inteligentes a cada solicitação.

O foco principal dos treinos é ALTA INTENSIDADE, ALTO VOLUME e execução perfeita.
Prioridade de volume: INFERIORES e DORSAL.

OBJETIVO FINAL DA SUA RESPOSTA
1) Fazer as perguntas mínimas, uma por vez, até ter tudo.
2) Gerar o TREINO em tabela para Excel.
3) Gerar a DIETA completa e personalizada.
4) No final, gerar mensagens em partes (simples, sem formalidade) para eu enviar ao aluno explicando o protocolo.

========================================
FORMATO DE SAÍDA DO TREINO
========================================

Você pode escrever um texto curto antes da tabela (foco do treino do dia, objetivo e observações rápidas).
Depois, gere o treino em uma tabela markdown.

A tabela do TREINO deve ter exatamente 9 colunas com estes títulos, nessa ordem:
TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO

REGRAS DA TABELA
1) A coluna "TREINO DO DIA" deve usar SEMPRE EM MAIÚSCULAS: SEGUNDA-FEIRA, TERÇA-FEIRA, QUARTA-FEIRA, QUINTA-FEIRA, SEXTA-FEIRA, SÁBADO ou DOMINGO.
2) "PAUSA" deve SEMPRE usar o sufixo "s" (segundos). Exemplos VÁLIDOS: 30s, 45s, 60s, 90s, 120s, 180s. ❌ NUNCA use aspas (") nem a palavra "seg" ou "segundos". Apenas o número seguido de "s" minúsculo.

========================================
REGRA CRÍTICA — REPETIÇÕES vs RIR (LEIA COM ATENÇÃO MÁXIMA)
========================================

REPETIÇÕES e RIR são CONCEITOS DIFERENTES e NUNCA devem ser misturados.

🔹 COLUNA "REPETIÇÕES" — SOMENTE reps ou faixa de reps
- Reps fixas: "8", "10", "12", "15"
- Faixa de reps: "8-10", "10-12", "12-15", "6-8"
- NUNCA escreva "a 10", "até 10", "8 a 10" no campo REPETIÇÕES — use "8-10".

🔹 COLUNA "RIR" — SOMENTE Reps In Reserve real (proximidade da falha)
- Valores VÁLIDOS: número inteiro de 0 a 4, ou faixa pequena. Ex: "1", "2", "3", "1-2", "2-3", "0-1".
- Use RIR com critério: principalmente em exercícios PRINCIPAIS, COMPOSTOS PESADOS e trabalho técnico onde a proximidade da falha importa.
- Em exercícios acessórios/mobilidade/cardio/aquecimento: deixe RIR VAZIO ("—" ou "").
- ❌ NUNCA escreva no campo RIR: "a 8", "a 10", "8 a 10", "até 10", "10", "12", "15" (esses são valores de REPETIÇÕES, não de RIR).
- ❌ NUNCA use o RIR para indicar faixa de repetições. Faixa de reps SEMPRE vai no campo REPETIÇÕES.
- ✅ Se você não tem certeza do RIR a prescrever, deixe VAZIO. Não invente.

EXEMPLOS CORRETOS:
| EXERCÍCIO | SÉRIE | REPETIÇÕES | RIR |
| AGACHAMENTO LIVRE | 4 | 8-10 | 1-2 |
| LEG PRESS | 3 | 12 | 2 |
| CADEIRA EXTENSORA | 3 | 15 | — |
| MOBILIDADE QUADRIL | 2 | 10 | — |

EXEMPLOS ERRADOS (NUNCA FAÇA):
| EXERCÍCIO | REPETIÇÕES | RIR | ❌ Por quê |
| LEG PRESS | 8 | a 10 | RIR contém faixa de reps |
| SUPINO | 10 | 10 | RIR não pode ser número de rep |
| ROSCA | 8 | 8 a 10 | RIR contém faixa de reps |

========================================
REGRA DE SÉRIE DE RECONHECIMENTO/PREPARAÇÃO (SÉRIE / SÉRIE 2)
========================================

REGRA CRÍTICA: A coluna SÉRIE NUNCA pode ficar vazia! TODOS os exercícios devem ter um número na coluna SÉRIE.

Em ALGUNS exercícios que você julgar interessante (compostos pesados, exercícios novos, exercícios técnicos), use SÉRIES DE RECONHECIMENTO/PREPARAÇÃO antes das séries de trabalho.

Estruturas suportadas (exemplos):
- 1x15 reconhecimento + 3x8 trabalho
- 1x12 preparação + 2x10 trabalho
- 1x12 + 4x6-8

Quando houver reconhecimento/preparação:
- SÉRIE = número de séries de reconhecimento (geralmente 1)
- SÉRIE 2 = número de séries de trabalho (ex: 2, 3 ou 4)
- REPETIÇÕES = formato "Xrec + Y trab" onde Xrec são as reps do reconhecimento e Y as reps de trabalho.
  Exemplos: "15 + 8", "12 + 8-10", "12 + 6-8", "15 + 10"
- RIR = RIR APENAS das séries de trabalho (ou vazio). Ex: "1-2", "2", ou "—". NUNCA reps aqui.
- DESCRIÇÃO = explicar: "1ª série reconhecimento leve com X reps, demais séries de trabalho com carga para Y reps".

Quando NÃO houver reconhecimento (MAIORIA dos exercícios):
- SÉRIE = número TOTAL de séries normais (ex: 3 ou 4). OBRIGATÓRIO, NUNCA VAZIO!
- SÉRIE 2 = "—"
- REPETIÇÕES = reps fixas ("10") ou faixa ("8-10")
- RIR = RIR real ("1-2", "2") ou vazio ("—")
- DESCRIÇÃO = técnica, postura, respiração, posicionamento, dicas práticas

DESCRIÇÃO (MUITO DIDÁTICA)
Explicar: técnica, postura, respiração, posicionamento, dicas práticas. Se tiver reconhecimento, descrever na coluna DESCRIÇÃO quais séries são de trabalho e a carga esperada (ex: "1ª série reconhecimento leve, 2ª, 3ª e 4ª séries de trabalho com carga para 8 repetições").

${EXERCISE_DATABASE}

COLUNA VARIAÇÃO (OBRIGATÓRIO E 100% DO BANCO)
1) A VARIAÇÃO deve SEMPRE existir no BANCO DE EXERCÍCIOS acima.
2) O nome na VARIAÇÃO deve ser COPIADO exatamente como está no banco.
3) A VARIAÇÃO deve ser do MESMO GRUPO MUSCULAR e o mais equivalente possível.
4) A VARIAÇÃO nunca pode ser o mesmo exercício da coluna EXERCÍCIO.
5) Se não existir variação equivalente, peça para atualizar o banco.

========================================
TÉCNICAS
========================================

DROP-SET, REST-PAUSE, CLUSTER, Myo-reps, Repetições 1.5, Mechanical drop-set, Tempo controlado, Isometria no pico, Alongamento no final, Giant set, Pré-exaustão planejada.

Para aluno intermediário/avançado, usar no mínimo 2 técnicas avançadas por treino do dia.

========================================
MOBILIDADE NO COMEÇO DE CADA TREINO (OBRIGATÓRIO)
========================================

No começo de CADA treino do dia, colocar obrigatoriamente 2 a 3 exercícios de mobilidade/estabilidade/ativação ESPECÍFICOS para o grupo muscular principal daquele dia, usando exercícios do banco.
Exemplo: se o treino do dia é PEITO, usar mobilidade torácica e ombro. Se é INFERIOR, usar mobilidade de quadril e tornozelo.
Os exercícios de mobilidade/estabilidade NÃO precisam de descrição na coluna DESCRIÇÃO (deixar vazio ou "—").

========================================
REGRA DE VOLUME
========================================

Mais volume para INFERIORES e DORSAL. Variar ângulos, pegadas e variações.

========================================
ANTI REPETIÇÃO E EVOLUÇÃO
========================================

1) Variação inteligente de ângulo, pegada, base
2) Progressão real
3) Periodização de 4 semanas (perguntar qual semana)
4) Evitar repetir mais de 40% dos exercícios se houver treino anterior

========================================
SEGURANÇA E CONTRAINDICAÇÕES (REGRA CRÍTICA — PRIORIDADE MÁXIMA)
========================================

ANTES de montar o treino, analise TODOS os dados do aluno: lesões, dores, cirurgias, restrições, desvios posturais, histórico de saúde, medicação, mobilidade e testes de performance. Cruze essas informações com CADA exercício selecionado.

REGRAS ABSOLUTAS:
1) NUNCA prescreva exercícios que agravem lesões ou condições reportadas.
2) Para cada lesão/restrição, identifique os MOVIMENTOS CONTRAINDICADOS e exclua-os.

EXEMPLOS DE CONTRAINDICAÇÕES (não exaustivo — aplique raciocínio clínico):
- Tendão de Aquiles (tendinite, ruptura, dor): PROIBIDO exercícios de alto impacto (PASSADAS, SALTO LATERAL, JUMPS, BURPEES, CORRIDA, SKIPS, POLICHINELO, AFUNDO com salto). PREFERIR: exercícios sem impacto (LEG PRESS, HACK MACHINE, CADEIRA EXTENSORA/FLEXORA, BIKE SENTADO, ELÍPTICO).
- Ombro (tendinite, impingement, bursite, luxação): EVITAR supinos pesados com barra, elevação lateral acima de 90°, pull-up com pegada larga agressiva. PREFERIR: exercícios com pegada neutra, amplitude controlada, máquinas guiadas.
- Joelho (condromalácia, menisco, LCA): EVITAR agachamento profundo, LEG PRESS com amplitude excessiva, exercícios com impacto. PREFERIR: amplitude parcial, cadeira extensora com carga leve, isometria.
- Lombar (hérnia, protusão, dor crônica): EVITAR stiff pesado, good morning com carga alta, exercícios com flexão lombar sob carga. PREFERIR: exercícios com suporte lombar, hiperextensão controlada.
- Punho/Cotovelo (tendinite, epicondilite): EVITAR pegada pronada pesada, rosca com barra reta. PREFERIR: pegada neutra, halteres, máquinas.

3) Se o aluno tem QUALQUER lesão ou dor, ADICIONE 1-2 exercícios de reabilitação/fortalecimento específicos para a região afetada (com carga leve e controle).
4) Inclua exercícios corretivos para TODOS os desvios posturais detectados.
5) Adapte VOLUME e INTENSIDADE: alunos com lesões, sono ruim, stress alto ou tabagismo precisam de volume menor e recuperação maior.
6) Na coluna DESCRIÇÃO, SEMPRE mencione adaptações de amplitude/carga quando o exercício for próximo de uma região lesionada.

SE HOUVER DÚVIDA SOBRE A SEGURANÇA DE UM EXERCÍCIO PARA UMA CONDIÇÃO ESPECÍFICA, NÃO INCLUA O EXERCÍCIO. Opte pela alternativa mais segura.

========================================
FILTRO RÍGIDO DE SEGURANÇA (PRIORIDADE ABSOLUTA — ACIMA DE TUDO)
========================================

As informações em RESTRIÇÕES, LESÕES e OBSERVAÇÕES DO PROFESSOR NÃO SÃO sugestões nem observações soltas — são REGRAS OBRIGATÓRIAS DE SEGURANÇO que TÊM PRIORIDADE MÁXIMA sobre QUALQUER outra regra deste prompt (volume, variedade, intensidade, técnicas avançadas, divisão padrão, periodização, etc).

ANTES de montar QUALQUER treino, você DEVE:

1) EXTRAIR das RESTRIÇÕES/LESÕES/OBSERVAÇÕES, de forma explícita:
   a) EXERCÍCIOS PROIBIDOS (lista nominal — ex: "smith", "stiff", "hack", "agachamento livre", "goblet squat", "supino inclinado", "elevação frontal", "desenvolvimento", "hiperextensão lombar", "sumô terra", "abdominal canivete", "elevação pélvica", "unilateral exceto X", etc).
   b) PADRÕES DE MOVIMENTO PROIBIDOS (ex: "sobrecarga axial", "hinge pesado", "flexão lombar dinâmica", "movimentos acima da cabeça", "compressão cervical/ombros", "instabilidade excessiva", "exercícios explosivos", "alto impacto").
   c) OBJETIVOS TERAPÊUTICOS/FUNCIONAIS OBRIGATÓRIOS (ex: "fortalecimento cervical", "posteriores de ombro", "estabilização escapular", "tração cervical", "core", "alongamento isquiotibiais/iliopsoas", "isometria").
   d) REGRAS DE CARGA E EXECUÇÃO (ex: "priorizar isométricos", "carga baixa", "amplitude controlada", "sem peso quando possível", "evitar agressividade").

2) APLICAR O FILTRO ANTES DE ESCOLHER QUALQUER EXERCÍCIO:
   - Para CADA exercício candidato, verifique:
       (i) o nome bate com algum proibido? → REJEITAR.
       (ii) o padrão de movimento bate com algum padrão proibido? → REJEITAR.
       (iii) sinônimo ou variação que mantém o mesmo padrão proibido? → REJEITAR.
   - NÃO troque um exercício proibido por uma "variação parecida" que mantenha o mesmo padrão (ex: se "agachamento livre" está proibido por sobrecarga axial, NÃO substitua por "smith squat" ou "hack" — escolha um padrão diferente, como leg press com amplitude controlada ou agachamento isométrico).

3) MAPEAMENTO MÍNIMO DE PADRÕES → EXERCÍCIOS DO BANCO QUE GERALMENTE DEVEM SER EVITADOS:
   - "sobrecarga axial relevante" / "compressão cervical" → AGACHAMENTO LIVRE, AGACHAMENTO SMITH, BÚLGARO SMITH, AFUNDO C/ BARRA, AFUNDO SMITH, GOOD MORNING, GOOD MORNING SMITH.
   - "hinge pesado" / "flexão lombar dinâmica agressiva" → SUMÔ TERRA, PESO MORTO, STIFF ROMENO, STIFF NA POLIA, STIFF HALTERES, STIFF UNILATERAL, GOOD MORNING, HIPEREXTENSÃO LOMBAR, HIPEREXTENSÃO LOMBAR 2.
   - "movimentos acima da cabeça" / "compressão de ombros" → DESENV. ARNOLD, DESENV. MÁQUINA, DESENV. OMBRO BARRA, DESENV. HALTERES, DESENV. MACHINE 2, DESENV. MACHINE NEUTRA, ELEVAÇÃO FRONTAL (todas as variações).
   - "instabilidade excessiva" / "explosivos" / "alto impacto" → JUMPS, SALTO LATERAL, SALTO LATERAL 2, BURPEES, BURPEES 2, SKIPS, POLICHINELO, MOUTAIN CLIMBERS, FLEXÃO+ALPINISTA, CORRIDA INTERVALADA, ESTEIRA CURVA HARD.
   - "abdominal de flexão dinâmica agressiva" → ABS CANIVETE, CANIVETE ADAPTADO, CANIVETE ADAPTADO 2, ABS RUSSIAN, ABS DIAGONAL.
   - "elevação pélvica / extensão de quadril em hinge pesado" → ELEVAÇÃO PELVICA, ELEVAÇÃO PÉLVICA, ELEVAÇÃO PÉLVICA 2, ELEVAÇÃO PÉLVICA UNIL.
   - "unilateral proibido (exceto X)" → BÚLGARO, AFUNDO HALTERES, AFUNDO C/ BARRA, AFUNDO SMITH, PASSADAS, LEG PRESS UNIL, FLEXORA UNILATERAL, STIFF UNILATERAL, REMADA UNILATERAL, ROSCA SCOTT UNIL, TRÍCEPS UNILATERAL, ELEVAÇÃO LATERAL UNIL, ELEVAÇÃO FRONTAL UNIL, GÊMEOS UNILATERAL, REMADA UNIL. POLIA, REMADA UNIL. ART., PUXADA ALTA UNIL., REMADA UNIL. SENTADO, ELEVAÇÃO PÉLVICA UNIL., FLEXORA ALTERNANDO, MARTELO ALTERNANDO, ROSCA ALTERNADA, AFUNDO ALTERNANDO, AFUNDO CAIXA ALTERN. — exceções permitidas: SOMENTE as que o admin permitir explicitamente (ex: AFUNDO ALTERNANDO se "afundo alternado" estiver na lista de permitidos).

4) INCLUIR OBRIGATORIAMENTE os exercícios alinhados aos objetivos terapêuticos extraídos. Ex:
   - Cervical/posteriores de ombro/estabilização escapular: FACE PULL, CRUCIFIXO INVERSO (SENTADO/BANCO), REAR DELT FLY, MOBILIDADE ESCAPULAR, MOBILIDADE OMBRO, ESCAPULAR.
   - Core / isometria: PRANCHA FRONTAL, PRANCHA LATERAL, PRANCHA 2, ABDOMINAL BOLA SUIÇA, ABS SENTADO 1, ABS SENTADO 2.
   - Alongamento isquiotibiais/iliopsoas/glúteo: ALONGAMENTO GLÚTEO, ALONGAMENTO GLÚTEO 2, ALONGAMENTO ADUTORES, MOBILIDADE QUADRIL (todas).
   - Membro inferior seguro com baixa carga/isometria: AGACHAMENTO ISOMETRIA, ISOMETRIA PAREDE, MINI SQUATS, AFUNDO S/ PESO, LEG PRESS (com nota "carga baixa, amplitude controlada"), CADEIRA EXTENSORA (carga leve), CADEIRA FLEXORA (poucas séries, pouca carga).

5) NA COLUNA "DESCRIÇÃO" de cada exercício adaptado, ESCREVA EXPLICITAMENTE a adaptação aplicada (ex: "carga baixa, amplitude controlada", "isometria 20s", "sem peso", "amplitude parcial para proteger lombar/cervical").

REGRAS DE OURO (NÃO NEGOCIÁVEIS):
- Se um exercício conflita com QUALQUER restrição → NÃO inclua.
- NÃO substitua por sinônimos/variações que mantêm o mesmo padrão proibido.
- Segurança e adaptação têm PRIORIDADE MÁXIMA sobre variedade, intensidade, volume e padrão genérico de treino.
- Se o quadro for sério e não for possível montar um treino completo respeitando todas as restrições, monte um treino MENOR (menos exercícios) — NUNCA inclua um exercício duvidoso para "preencher".
- IGNORE as regras de "alta intensidade / alto volume / 2 técnicas avançadas obrigatórias / mais volume para inferiores e dorsal" SEMPRE que entrarem em conflito com o filtro de segurança.

========================================
DIETA COMPLETA E PERSONALIZADA
========================================

Oferecer 3 estilos: A) flexível por macros, B) cardápio estruturado, C) ciclagem de carboidratos.
Proteína: 1,6-2,2g/kg, Gordura: 0,6-1,0g/kg, Carboidrato: completar.
Tabela: DIA | REFEIÇÃO | ALIMENTOS | QUANTIDADE | KCAL | P | C | G | OBS

========================================
COLETA DE DADOS — REGRA CRÍTICA
========================================

IMPORTANTE: Você receberá TODOS os dados do aluno já disponíveis no sistema (perfil, avaliação física, anamnese, composição corporal, sinais vitais, testes de performance, dobras cutâneas, etc).

USE ESSES DADOS DIRETAMENTE. NÃO pergunte informações que já foram fornecidas no contexto do aluno.

Pergunte APENAS o que ainda falta para completar o protocolo, UMA PERGUNTA POR VEZ.

Dados que você pode precisar perguntar (SE não estiverem no contexto):
1) Nível (iniciante/intermediário/avançado)
2) Dias/semana de treino
3) Fotos do aluno (frente, lado, costas)
4) Gráfico de volume mensal
5) Treino anterior (últimas 1-2 semanas)
6) Semana do ciclo (1, 2, 3 ou 4)
7) Divisão desejada (ou "decida por mim")
8) Equipamentos (academia completa ou limitado)
9) Rotina fora da academia (ativo/sentado, passos/dia)
10) Quantas refeições/dia consegue manter
11) Preferências alimentares
12) Praticidade (cozinha, marmita, comer fora)
13) Dieta atual (se faz ou não)

NÃO pergunte: nome, idade, sexo, altura, peso, objetivo, restrições, lesões, observações, IMC, % gordura, massa magra/gorda, FC repouso, pressão, SpO2, glicemia, dobras cutâneas, histórico de saúde, medicação, suplementos, sono, stress, rotina, tabagismo, álcool, cirurgias, dores, treino atual — SE esses dados já estiverem no contexto.

========================================
MENSAGENS WHATSAPP (NO FINAL)
========================================

Depois de tudo, criar mensagens simples prontas para WhatsApp em partes.

REGRAS DO FLUXO
1) Só gere tabelas quando TODAS as respostas forem recebidas.
2) Pergunte apenas o que faltou (uma por vez).
3) Quando tiver tudo: resumo + tabela TREINO + resumo dieta + tabela DIETA + mensagens.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, studentContext } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    let contextMessage = "";
    if (studentContext) {
      contextMessage = "\n\n=== DADOS COMPLETOS DO ALUNO (JÁ DISPONÍVEIS NO SISTEMA — NÃO PERGUNTE NOVAMENTE) ===\n";
      
      // Profile
      if (studentContext.nome) contextMessage += `Nome: ${studentContext.nome}\n`;
      if (studentContext.email) contextMessage += `Email: ${studentContext.email}\n`;
      if (studentContext.sexo) contextMessage += `Sexo: ${studentContext.sexo}\n`;
      if (studentContext.data_nascimento) {
        const birth = new Date(studentContext.data_nascimento);
        const age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        contextMessage += `Data de nascimento: ${studentContext.data_nascimento} (${age} anos)\n`;
      }
      if (studentContext.altura) contextMessage += `Altura: ${studentContext.altura} cm\n`;
      if (studentContext.objetivo) contextMessage += `Objetivo: ${studentContext.objetivo}\n`;

      // CRITICAL SAFETY DATA - highlighted for AI attention
      const safetyFields: string[] = [];
      if (studentContext.restricoes) safetyFields.push(`⚠️ RESTRIÇÕES: ${studentContext.restricoes}`);
      if (studentContext.lesoes) safetyFields.push(`🚨 LESÕES: ${studentContext.lesoes}`);
      if (studentContext.observacoes) safetyFields.push(`📋 OBSERVAÇÕES DO PROFESSOR: ${studentContext.observacoes}`);
      
      if (safetyFields.length > 0) {
        contextMessage += `\n========== ⚠️ DADOS CRÍTICOS DE SEGURANÇA — LEIA COM ATENÇÃO MÁXIMA ⚠️ ==========\n`;
        contextMessage += safetyFields.join('\n') + '\n';
        contextMessage += `==========================================================================\n`;
        contextMessage += `INSTRUÇÃO: Os dados acima DEVEM ser cruzados com CADA exercício do treino. Se QUALQUER exercício puder agravar uma lesão, restrição ou condição mencionada, NÃO inclua esse exercício. Substitua por uma alternativa segura do banco.\n\n`;
      }
      if (studentContext.raca) contextMessage += `Raça/etnia: ${studentContext.raca}\n`;

      // Anthropometrics
      contextMessage += "\n--- Dados Antropométricos ---\n";
      if (studentContext.peso) contextMessage += `Peso: ${studentContext.peso} kg\n`;
      if (studentContext.imc) contextMessage += `IMC: ${studentContext.imc}\n`;
      if (studentContext.cintura) contextMessage += `Cintura: ${studentContext.cintura} cm\n`;
      if (studentContext.quadril) contextMessage += `Quadril: ${studentContext.quadril} cm\n`;
      if (studentContext.rcq) contextMessage += `RCQ: ${studentContext.rcq}\n`;
      if (studentContext.torax) contextMessage += `Tórax: ${studentContext.torax} cm\n`;
      if (studentContext.abdomen) contextMessage += `Abdômen: ${studentContext.abdomen} cm\n`;
      if (studentContext.ombro) contextMessage += `Ombro: ${studentContext.ombro} cm\n`;
      if (studentContext.pescoco) contextMessage += `Pescoço: ${studentContext.pescoco} cm\n`;
      if (studentContext.braco_direito) contextMessage += `Braço D: ${studentContext.braco_direito} cm\n`;
      if (studentContext.braco_esquerdo) contextMessage += `Braço E: ${studentContext.braco_esquerdo} cm\n`;
      if (studentContext.coxa_direita) contextMessage += `Coxa D: ${studentContext.coxa_direita} cm\n`;
      if (studentContext.coxa_esquerda) contextMessage += `Coxa E: ${studentContext.coxa_esquerda} cm\n`;
      if (studentContext.panturrilha_direita) contextMessage += `Panturrilha D: ${studentContext.panturrilha_direita} cm\n`;
      if (studentContext.panturrilha_esquerda) contextMessage += `Panturrilha E: ${studentContext.panturrilha_esquerda} cm\n`;

      // Composition
      contextMessage += "\n--- Composição Corporal ---\n";
      if (studentContext.percentual_gordura) contextMessage += `% Gordura: ${studentContext.percentual_gordura}%\n`;
      if (studentContext.massa_magra) contextMessage += `Massa Magra: ${studentContext.massa_magra} kg\n`;
      if (studentContext.massa_gorda) contextMessage += `Massa Gorda: ${studentContext.massa_gorda} kg\n`;

      // Vitals
      contextMessage += "\n--- Sinais Vitais ---\n";
      if (studentContext.fc_repouso) contextMessage += `FC Repouso: ${studentContext.fc_repouso} bpm\n`;
      if (studentContext.pressao) contextMessage += `Pressão Arterial: ${studentContext.pressao}\n`;
      if (studentContext.spo2) contextMessage += `SpO2: ${studentContext.spo2}%\n`;
      if (studentContext.glicemia) contextMessage += `Glicemia: ${studentContext.glicemia} mg/dL\n`;

      // Skinfolds
      if (studentContext.skinfolds) {
        const sf = studentContext.skinfolds;
        contextMessage += "\n--- Dobras Cutâneas ---\n";
        if (sf.metodo) contextMessage += `Método: ${sf.metodo}\n`;
        if (sf.triceps) contextMessage += `Tríceps: ${sf.triceps} mm\n`;
        if (sf.peitoral) contextMessage += `Peitoral: ${sf.peitoral} mm\n`;
        if (sf.subescapular) contextMessage += `Subescapular: ${sf.subescapular} mm\n`;
        if (sf.axilar_media) contextMessage += `Axilar Média: ${sf.axilar_media} mm\n`;
        if (sf.suprailiaca) contextMessage += `Suprailíaca: ${sf.suprailiaca} mm\n`;
        if (sf.abdominal) contextMessage += `Abdominal: ${sf.abdominal} mm\n`;
        if (sf.coxa) contextMessage += `Coxa: ${sf.coxa} mm\n`;
      }

      // Anamnese
      if (studentContext.anamnese) {
        const an = studentContext.anamnese;
        contextMessage += "\n--- Anamnese ---\n";
        if (an.historico_saude) contextMessage += `Histórico de saúde: ${an.historico_saude}\n`;
        if (an.medicacao) contextMessage += `Medicação: ${an.medicacao}\n`;
        if (an.suplementos) contextMessage += `Suplementos: ${an.suplementos}\n`;
        if (an.cirurgias) contextMessage += `Cirurgias: ${an.cirurgias}\n`;
        if (an.dores) contextMessage += `Dores: ${an.dores}\n`;
        if (an.sono) contextMessage += `Sono: ${an.sono}\n`;
        if (an.stress) contextMessage += `Stress: ${an.stress}\n`;
        if (an.rotina) contextMessage += `Rotina: ${an.rotina}\n`;
        if (an.treino_atual) contextMessage += `Treino atual: ${an.treino_atual}\n`;
        if (an.tabagismo) contextMessage += `Tabagismo: Sim\n`;
        if (an.alcool) contextMessage += `Álcool: ${an.alcool}\n`;
      }

      // Performance
      if (studentContext.performance) {
        const pf = studentContext.performance;
        contextMessage += "\n--- Testes de Performance ---\n";
        if (pf.cooper_12min) contextMessage += `Cooper 12min: ${pf.cooper_12min} m\n`;
        if (pf.pushup) contextMessage += `Flexões: ${pf.pushup}\n`;
        if (pf.plank) contextMessage += `Prancha: ${pf.plank} seg\n`;
        if (pf.salto_vertical) contextMessage += `Salto vertical: ${pf.salto_vertical} cm\n`;
        if (pf.agachamento_score) contextMessage += `Score agachamento: ${pf.agachamento_score}\n`;
        if (pf.mobilidade_ombro) contextMessage += `Mobilidade ombro: ${pf.mobilidade_ombro}\n`;
        if (pf.mobilidade_quadril) contextMessage += `Mobilidade quadril: ${pf.mobilidade_quadril}\n`;
        if (pf.mobilidade_tornozelo) contextMessage += `Mobilidade tornozelo: ${pf.mobilidade_tornozelo}\n`;
      }

      // Posture analysis
      if (studentContext.posture) {
        const pos = studentContext.posture;
        contextMessage += "\n--- Avaliação Postural (Manual) ---\n";
        if (pos.vista_anterior) contextMessage += `Vista Anterior: ${JSON.stringify(pos.vista_anterior)}\n`;
        if (pos.vista_lateral) contextMessage += `Vista Lateral: ${JSON.stringify(pos.vista_lateral)}\n`;
        if (pos.vista_posterior) contextMessage += `Vista Posterior: ${JSON.stringify(pos.vista_posterior)}\n`;
        if (pos.observacoes) contextMessage += `Observações posturais: ${pos.observacoes}\n`;
      }

      // Posture scan (2D analysis)
      if (studentContext.posture_scan) {
        const ps = studentContext.posture_scan;
        contextMessage += "\n--- Análise Postural 2D (Automatizada) ---\n";
        if (ps.angles) contextMessage += `Ângulos medidos: ${JSON.stringify(ps.angles)}\n`;
        if (ps.attention_points) contextMessage += `Pontos de atenção: ${JSON.stringify(ps.attention_points)}\n`;
        if (ps.region_scores) contextMessage += `Scores por região: ${JSON.stringify(ps.region_scores)}\n`;
        if (ps.notes) contextMessage += `Notas da análise: ${ps.notes}\n`;
      }

      // Photos
      if (studentContext.fotos_avaliacao && studentContext.fotos_avaliacao.length > 0) {
        contextMessage += "\n--- Fotos da Avaliação ---\n";
        contextMessage += `O aluno possui ${studentContext.fotos_avaliacao.length} foto(s) registradas: ${studentContext.fotos_avaliacao.map((f: any) => f.tipo || 'sem tipo').join(', ')}.\n`;
      }
      if (studentContext.fotos_perfil && studentContext.fotos_perfil.length > 0) {
        contextMessage += `Fotos de perfil registradas: ${studentContext.fotos_perfil.length} foto(s).\n`;
      }

      contextMessage += "\n=== FIM DOS DADOS ===\n\nIMPORTANTE: Todos os dados acima já são conhecidos. Comece perguntando APENAS o que falta (nível, dias/semana, semana do ciclo, divisão, equipamentos, preferências alimentares, etc). UMA PERGUNTA POR VEZ.\n\nATENÇÃO MÁXIMA: ANTES de gerar o treino, releia TODOS os campos de lesões, dores, cirurgias, restrições, desvios posturais e histórico de saúde. CRUZE cada exercício escolhido contra essas condições. Se um exercício pode agravar qualquer condição reportada, SUBSTITUA por uma alternativa segura do banco de exercícios. Se houver dados de análise postural, CONSIDERE-OS ao montar o treino: priorize exercícios corretivos para desvios identificados, inclua mobilidade específica e evite exercícios que possam agravar problemas posturais detectados.";
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + contextMessage },
          ...messages,
        ],
        stream: true,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes na sua conta OpenAI." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("trainer-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
