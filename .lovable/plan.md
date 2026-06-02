## Periodização Adaptativa por Aderência

Refinar a lógica de avanço semanal do treino para que dependa da execução real do aluno (não só do calendário).

---

### 1. Novo módulo: `src/lib/weeklyAdherence.ts`

Função pura que recebe `plan` + `exercise_set_logs` da semana anterior e retorna:

```ts
type AdherenceStatus =
  | 'apto_avancar'        // ≥75% sessões + ≥70% exercícios com carga/reps
  | 'manter_semana'       // 50-74% — manter semana atual mais 7 dias
  | 'repetir_semana'      // 25-49% — repetir a mesma semana
  | 'dados_insuficientes' // <25% ou sem logbook
  | 'sugerir_reanalise';  // padrão anômalo (ex: cargas zeradas, reps faltando)

interface AdherenceReport {
  status: AdherenceStatus;
  sessionsPlanned: number;
  sessionsExecuted: number;
  exercisesPlanned: number;
  exercisesLogged: number;
  setsWithLoad: number;
  setsTotal: number;
  reasonLabel: string;     // mensagem PT-BR para o aluno
  detailLabel: string;     // detalhe secundário
  canAutoAdvance: boolean;
}
```

Métricas:
- **% sessões realizadas** = dias com ≥1 set logado / dias planejados no markdown
- **% exercícios principais com registro** = exercícios distintos logados / exercícios planejados
- **% sets com carga+reps** = sets com `weight_kg>0 && reps>0` / sets totais

Limiares (constantes ajustáveis no topo do arquivo):
- `apto`: sessões ≥75% E exercícios ≥70% E setsCompletos ≥70%
- `manter`: sessões ≥50% (ou exercícios ≥50%)
- `repetir`: sessões ≥25%
- `dados_insuficientes`: <25% ou 0 logs
- `sugerir_reanalise`: ≥50% sessões mas <30% sets com carga/reps (treinou mas não registrou)

---

### 2. Hook: `src/hooks/useWeeklyAdherence.ts`

```ts
useWeeklyAdherence(plan) -> { report, loading }
```

- Calcula janela da semana anterior baseada em `plan.fase_inicio_data` + `plan.fase`
- Busca `exercise_set_logs` desse intervalo para `student_id`
- Parseia `plan.conteudo` (via `parseTrainingSections`) para obter dias e exercícios planejados
- Devolve `AdherenceReport`

---

### 3. Bloquear/sinalizar avanço automático

Hoje a "fase" (semana_1..semana_4) é texto no plano, sem auto-advance ativo. Garantir que:

- **Nenhum job ou trigger** avance `fase` automaticamente sem checar aderência. (Verificar `supabase/functions/` por cron de progressão — se existir, adicionar gate.)
- A UI passa a exibir o estado de aderência e só sugere avanço quando `canAutoAdvance === true`.

---

### 4. Banner de aderência

Novo componente `src/components/training/WeeklyAdherenceBanner.tsx`:

- Renderiza badge colorido conforme `status`:
  - verde "Apto para avançar"
  - amarelo "Semana mantida por falta de registros suficientes"
  - laranja "Repetindo semana — execução parcial"
  - cinza "Dados insuficientes — Complete os registros para liberar progressão mais precisa"
  - violeta "Sugerir reanálise pelo coach — registros pouco confiáveis na semana passada"
- Mostra mini-stats (X/Y sessões, X/Y exercícios registrados)
- CTA "Ver detalhes" abre Sheet com breakdown completo

---

### 5. Integração nas telas

**Aluno** — `src/pages/MeusTreinos.tsx`: banner no topo do treino ativo.

**Admin** — `src/components/student/StudentTrainingTab.tsx`: banner ao expandir o plano + bloquear botão "Avançar fase" automático quando `!canAutoAdvance` (substituir por confirmação explícita "Avançar mesmo assim").

---

### 6. Mensagens PT-BR (em `weeklyAdherence.ts`)

```
apto_avancar       → "Apto para avançar de semana"
manter_semana      → "Semana mantida por falta de registros suficientes"
repetir_semana     → "Repetindo a semana — execução parcial na semana anterior"
dados_insuficientes→ "Complete os registros para liberar progressão mais precisa"
sugerir_reanalise  → "Na semana passada não houve registros confiáveis de cargas e repetições"
```

---

### Arquivos alterados/criados

- `src/lib/weeklyAdherence.ts` (novo)
- `src/hooks/useWeeklyAdherence.ts` (novo)
- `src/components/training/WeeklyAdherenceBanner.tsx` (novo)
- `src/pages/MeusTreinos.tsx` (banner aluno)
- `src/components/student/StudentTrainingTab.tsx` (banner admin + gate de avanço)

Sem mudanças de schema — usa `exercise_set_logs` e `ai_plans` existentes.

---

### Resultado

Progressão semanal passa a depender de aderência real. Aluno vê claramente por que a semana foi mantida/repetida. Admin recebe sinal explícito antes de avançar fase.
