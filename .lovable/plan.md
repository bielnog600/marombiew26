# Camada de Periodização — Plano de Implementação

## Auditoria (o que já existe e será reutilizado)

- `ai_plans` já tem `fase` (semana_1/2/3/deload), `fase_inicio_data`, `cycle_days` (45 = ciclo inteiro), `version`, `parent_plan_id`, `protocols` (jsonb), `renewal_mode`, `cycle_status`, `is_draft`.
- `src/lib/trainingPhase.ts` + `src/lib/currentPhase.ts` já são a fonte única da fase semanal → viram **week strategy** dentro do modelo maior (nada é removido).
- `weekContext.ts` / `weeklyTraining.ts` / `weeklyProgression.ts` / `quantitativeProgression.ts` já resolvem janela, aderência, performance e progressão determinística → serão consumidos pelo resolver, sem duplicar matemática.
- `workout-renewal-analyzer` já decide renovação por ciclo → recebe a decisão do resolver.
- `trainer-agent` já recebe contexto estruturado (nível, dias, split, equipamento, restrições, referência) → ganha bloco de periodização.
- `TreinoIA.tsx` já tem seletores (nível, dias, split, semana) → ganha o seletor de periodização no mesmo padrão.

Sem arquitetura paralela: a periodização é uma camada acima das fases já existentes.

## Etapas

**B — Schema (backward-compatible)**
Migration aditiva em `ai_plans`, tudo nullable com fallback `legacy`:
`periodization_model`, `periodization_reason`, `macrocycle_weeks`, `block_type`, `block_number`, `block_total`, `block_start_date`, `block_end_date`, `week_number`, `week_strategy`, `volume_target` (low/moderate/moderate_high/high), `load_intensity_target`, `effort_target` (RIR), `rep_strategy`, `next_block_type`.
Enums em TS (não no banco) para evoluir sem migration: modelos `automatica | linear | ondulatoria | blocos | concorrente` + preparados `linear_reversa | trifasica` (não selecionáveis nesta versão). Planos antigos → `legacy` resolvido como linear equivalente.

**C — Periodization Resolver (`src/lib/periodization.ts`, determinístico)**
- `selectModel(ctx)`: heurística com candidatos elegíveis + motivo textual (iniciante/2–4 dias → linear; intermediário-avançado com múltiplos estímulos → ondulatória; objetivo por fases → blocos; musculação + cardio/corrida → concorrente). A IA só escolhe dentro dos elegíveis.
- `resolveWeekStrategy(model, weekNumber, blockType)`: mapeia S1/S2/S3/S4 para volume/intensidade/RIR/faixa de reps por modelo.
- `resolveNextStep(state, adherence, performance, feedback)`: `continue_block | advance_block | deload | repeat_week | review_required`. Nunca avança só por tempo; dados insuficientes → regra temporal conservadora ou review.
- Espelhado em `supabase/functions/_shared/periodization.ts` (mesma lógica para o agente).

**E/F — Contexto e efeito real na prescrição**
`trainer-agent` recebe PERIODIZATION_MODEL, BLOCK, BLOCK_NUMBER/TOTAL, WEEK, WEEK_STRATEGY, VOLUME_TARGET, INTENSITY_TARGET, RIR_TARGET, PREVIOUS/NEXT_BLOCK. Cada modelo altera de fato a saída:
- linear → progressão entre semanas, anchors fixos;
- ondulatória → faixas de reps/ênfase distintas por sessão (tensão/hipertrofia/volume), proibido dois dias quase iguais;
- blocos → característica do bloco domina volume/intensidade/acessórios;
- concorrente → coordena com cardio, evita dias duros consecutivos (regras conservadoras).
Validador determinístico pós-geração: modelo/bloco/semana válidos, coerência modelo×estratégia, deload não vira overload, volume dentro da faixa, ondulatória com dias realmente diferenciados. Falha → retry com motivo (mesmo padrão dos validadores atuais).

**D — UI do gerador**
Em `TreinoIA.tsx`, bloco "Periodização" com Automática (default) / Linear / Ondulatória / Por blocos / Concorrente, cada uma com descrição de uma linha. Automática mostra o modelo escolhido + motivo após gerar.

**G — Renovação**
`workout-renewal-analyzer` passa a chamar o resolver antes do agente: performance + aderência + feedback → próximo bloco/semana → geração → validadores → rascunho. Anchors classificados MANTER/PROGREDIR/ROTACIONAR/REMOVER; gate de similaridade atual mantido (queda drástica sem razão técnica → review).

**Progressão**
`quantitativeProgression` continua determinística; o bloco só define o contexto (acumulação prioriza reps/volume, intensificação prioriza carga, deload sem overload agressivo).

**H — Telas**
- Card "Periodização" no plano (admin e aluno) com modelo, bloco X de Y, semana N/4, objetivo, volume, intensidade, RIR, próximo bloco. Linguagem simples para o aluno, detalhe técnico no admin.
- Home admin: rascunho automático mostra modelo + bloco.

**I — Testes** (`src/test/periodization.test.ts`) cobrindo os 18 casos da especificação: elegibilidade automática, respeito à escolha manual, efeito de cada modelo, metadados de bloco, cardio no concorrente, plano legado, anchors na renovação, similaridade, deload, determinismo da progressão e build.

## Fora desta versão
Trifásica completa, %1RM, CTL/ATL/TSB, diagnóstico de fadiga, auto-publicação, ferramentas de distribuição (piramidal/high-low/polarizada) — apenas o espaço no schema.

## Entrega
Implementação em etapas B→I nesta ordem, com relatório final (arquitetura, reuso das fases, schema, decisão automática, integrações, telas, migrations, testes PASS/FAIL, débitos técnicos).
