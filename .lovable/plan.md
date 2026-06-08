## Objetivo

Transformar **Consultoria > Alertas** em um painel semanal acionável por aluno, focado em aderência, progressão e ações de WhatsApp — eliminando o ruído de notificações operacionais leves.

## 1. Topo simplificado (3 cards)

Substituir os 4 cards atuais do `EngagementOverviewCards` por 3:

- **Precisam de atenção** — alunos com regressão, baixa aderência, treino mal registrado ou sem progresso
- **Sem progresso** — aderência ≥ 75% mas sem ganho de carga/reps na semana
- **Dados insuficientes** — treinaram mas <30% dos sets têm carga/reps, ou planos sem logs

Cada card é clicável e filtra a lista abaixo.

## 2. Lista principal — Card semanal por aluno

Novo componente `StudentWeeklyCard.tsx`. Um card por aluno ativo com plano de treino, mostrando:

```text
┌─────────────────────────────────────────────────────┐
│ Nome do Aluno              [estado: Manter semana]  │
│ Aderência: 3 de 4 treinos (75%) • Sets c/ carga 82% │
│                                                     │
│ Evoluiu:    Supino reto +5kg • Agachamento +2 reps  │
│ Regrediu:   Remada baixa -5kg                       │
│ Sem registro: Stiff, Rosca direta                   │
│                                                     │
│ Ação sugerida: Manter semana e cobrar registro de   │
│ carga em Stiff/Rosca.                               │
│                                                     │
│ [Ver aluno] [Reanalisar] [WhatsApp] [Copiar resumo] │
└─────────────────────────────────────────────────────┘
```

**Estado da semana** (já existe em `weeklyAdherence.ts`):
`apto_avancar` · `manter_semana` · `repetir_semana` · `dados_insuficientes` · `sugerir_reanalise`

**Progressão/Regressão**: comparar `exercise_set_logs` da semana anterior vs. 2 semanas atrás por `exercise_name`, calculando delta de peso máximo e reps máximas. Listar até 3 melhorias e 3 pioras.

**Sem registro**: exercícios planejados (do `ai_plans.conteudo`) sem nenhum log na semana.

**Ação sugerida**: regra baseada no `status` do `AdherenceReport`:
- `apto_avancar` → "Liberar progressão de carga"
- `manter_semana` → "Manter semana atual"
- `repetir_semana` → "Repetir semana, cobrar presença"
- `dados_insuficientes` → "Cobrar registro de carga/reps"
- `sugerir_reanalise` → "Reanalisar plano"

## 3. Ações por card

- **Ver aluno** → navega para perfil
- **Reanalisar** → abre `WorkoutRenewalPanel` (já existe) com o plano atual
- **WhatsApp** → abre `wa.me/<telefone>` com mensagem pré-preenchida do resumo
- **Copiar resumo** → copia para clipboard texto formatado (nome, aderência, evoluiu, regrediu, ação)

## 4. Filtros e ordenação

Topo da lista:
- Filtro: Todos · Precisam atenção · Sem progresso · Dados insuficientes
- Ordenação padrão: prioridade (regressão > dados insuficientes > sem progresso > ok)

## 5. Seção secundária colapsável "Outros avisos"

Mover para um `<Collapsible>` recolhido por padrão, no fim da aba:
- Aniversários
- Água baixa
- Sem telefone
- Mensagem semanal
- Reavaliação vencida
- Ficha mensal pendente
- Financeiros / pacote

Reutiliza a lista atual de `useNotifications` + alertas comportamentais não relacionados a treino.

## 6. O que sai da aba

Removidos da tela principal (continuam disponíveis em "Outros avisos"):
- `app_opened` do dia
- `agua_baixa`
- Aniversários
- Mensagem semanal
- Sem telefone
- Reavaliação vencida (vira aviso secundário)

## Detalhes técnicos

**Novos arquivos:**
- `src/lib/weeklyProgression.ts` — compara exercise_set_logs de 2 janelas semanais e retorna `{improved[], regressed[], missing[]}`
- `src/hooks/useStudentsWeeklySummary.ts` — para cada aluno ativo: busca plano de treino ativo, roda `buildAdherenceReport` + `weeklyProgression`, retorna lista pronta para renderizar
- `src/components/consultoria/StudentWeeklyCard.tsx` — UI do card
- `src/components/consultoria/OtherAlertsSection.tsx` — Collapsible com notificações leves

**Arquivos editados:**
- `src/components/consultoria/EngagementOverviewCards.tsx` — reduz para 3 cards (precisam_atencao, sem_progresso, dados_insuficientes)
- `src/pages/Consultoria.tsx` — bloco `tab === 'alertas'` reescrito para usar `useStudentsWeeklySummary` + filtros, renderizar `StudentWeeklyCard` em loop, e `OtherAlertsSection` no rodapé

**Mantido:**
- `useBehavioralAlerts` / `useNotifications` continuam existindo (usados em "Outros avisos" e no bell global)
- Lógica de classificação `classifyBehavioral` removida do Consultoria
- Tabela `behavioral_alerts` e edge function não mudam — só a UI

## Fora de escopo

- Nada de mudança em outras abas (Renovações, Check-ins, Visão)
- Edge function `behavioral-alerts-generator` continua igual
- Sem mudanças no banco
