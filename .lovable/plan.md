# office-gerar: gerar, publicar e descartar treino, dieta e cardio pelo escritório de IA

## Como funciona hoje

### Onde ficam os 3 geradores
A chamada à IA já acontece no servidor, mas **a preparação e o salvamento ficam na tela do admin**:

| Gerador | IA (servidor) | Preparação e salvamento (tela do admin) |
|---|---|---|
| Gerar Treino | `trainer-agent` | `TreinoIA.tsx` (~1.800 linhas): monta o prompt do wizard, escolhe a divisão, decide a periodização antes da IA, define perfil de exercícios e equipamentos e salva com `createWorkoutPlanJSON`; o plano anterior fica como `renovado` |
| Agente de Dieta | `diet-agent` (já faz alvos, banco de alimentos, ajustes e validação) | `DietaIA.tsx` (~4.200 linhas): reúne contexto, ancora TMB/GET, chama o agente e salva |
| Cardio IA | `cardio-agent` | `CardioIA.tsx`: contexto, zonas Karvonen, modalidades, frequência, e depois insere direto |

Por isso o servidor sozinho ainda não consegue gerar igual ao admin: falta a parte que hoje roda na tela.

### Rascunho e publicado
- **Dieta:** é a única com rascunho de verdade. O admin salva em `ai_plans` com `is_draft = true`, e a publicação passa pela função `publish-diet-plan` (atômica, com versão e metas). As telas do aluno só leem `is_draft = false`.
- **Treino:** não tem rascunho. Ao salvar, o treino já é publicado. "Meus Treinos" e "Minha Área" pegam o treino mais recente **sem olhar `is_draft`**.
- **Cardio:** também não tem rascunho. A Minha Área mostra o cardio mais recente sem filtro.

Consequência: se eu gravar um rascunho de treino ou cardio em `ai_plans`, o aluno passa a vê-lo na hora. A solução abaixo não muda nada no app do aluno.

## Solução

### 1. Tabela nova `office_plan_drafts` (só admin e servidor têm acesso)
Guarda os rascunhos do escritório: tipo, aluno, instruções, plano gerado, resumo legível, situação (`gerando` / `pronto` / `erro` / `publicado` / `descartado`), erro e datas.
- **Treino e cardio:** o rascunho fica só aqui. O aluno não vê nada até o `publicar`.
- **Dieta:** o rascunho é salvo também em `ai_plans` com `is_draft = true`, igual o admin faz. Assim, ao publicar, usamos exatamente o `publish-diet-plan`. O aluno já ignora esses rascunhos hoje.

### 2. Levar a preparação para código compartilhado, sem mudar o admin
- A montagem do prompt e do contexto do treino, da dieta e do cardio sai das telas e vai para módulos sem dependência de tela, em `supabase/functions/_shared/planBuilders/`.
- As telas do admin passam a importar esses mesmos módulos.
- Antes de cada extração, crio um teste de equivalência: com as mesmas entradas, a versão antiga e a nova precisam gerar prompt e corpo da chamada **idênticos**.
- O salvamento do treino (`createWorkoutPlanJSON` + marcar o anterior como `renovado`) e o do cardio também vão para um módulo compartilhado.

### 3. Edge function `office-gerar` (POST, header `x-office-token`, comparação resistente a ataques de tempo, sem JWT de usuário, sem CORS aberto)
- `gerar { tipo, aluno, instrucoes? }`
  - Encontra o aluno por id, e-mail ou nome. Se o nome bater com mais de um aluno, devolve 409 com a lista.
  - Lê os dados do aluno no servidor e monta tudo com os mesmos módulos do admin.
  - Chama o mesmo agente (`trainer-agent` / `diet-agent` / `cardio-agent`) internamente e com autenticação.
  - Salva o rascunho e responde `{ id, status, resumo_legivel }`. O resumo traz o plano completo em texto: dias, exercícios, séries, reps, RIR e pausa; refeições, alimentos e macros; sessões de cardio.
- `publicar { tipo, id }`
  - **Dieta:** `publish-diet-plan`.
  - **Treino:** o mesmo salvamento do botão do admin.
  - **Cardio:** o mesmo insert do Cardio IA.
  - Depois marca o rascunho como `publicado`. Se for chamado de novo, devolve o mesmo resultado sem duplicar.
- `descartar { tipo, id }`: apaga o rascunho. No caso da dieta, apaga também a linha `is_draft = true` em `ai_plans`. Rascunho já publicado → 409.
- `status { id }`: mostra o andamento (veja a premissa 3).

### 4. Testes
Equivalência dos construtores; autenticação, 401/405/409 e validação das entradas; resolução do aluno; resumo legível; publicar e descartar sem duplicar. **Não faço nenhuma chamada real de IA sem a sua autorização.** O teste completo de ponta a ponta fica para você liberar.

## Premissas (corrija se alguma estiver errada)
1. **Wizard de treino sem perguntas:** como não há tela, uso o que o admin usa quando deixa no "auto": divisão, dias e quantidade de exercícios no automático, semana do ciclo seguindo o plano anterior e equipamento completo. O texto de `instrucoes` entra como observações do professor; por exemplo, "4x semana" vira 4 dias e "foco em glúteo" vira prioridade.
2. **Dieta:** segue o mesmo modo "auto" do admin (fórmula, nº de refeições e estilo pelo padrão atual). As `instrucoes` entram como observações.
3. **Tempo de geração:** a dieta pode passar do limite de uma chamada. Por isso o `gerar` espera até ~120 s. Se ficar pronto, devolve o resumo; se não, devolve `{ id, status: 'gerando' }`, e o seu motor consulta com `status` até receber `pronto`.
4. **Admin:** os rascunhos de dieta aparecem na aba Dieta como já aparecem hoje. Os de treino e cardio só existem pelo escritório; posso mostrá-los no admin depois, se você quiser.

## Fora do escopo
Mudar o app do aluno, as regras dos geradores, o banco de alimentos/exercícios, as tolerâncias ou o formato de gravação.

## Detalhes técnicos
- Migration: `office_plan_drafts` com RLS (só admin via `has_role`), GRANTs, índice `(student_id, tipo, status)`.
- `supabase/config.toml`: `[functions.office-gerar] verify_jwt = false`.
- Chamadas internas aos agentes usam a service role. Se algum agente exigir sessão de admin hoje, aceito um caminho interno assinado pelo mesmo `OFFICE_FEED_TOKEN`, sem mudar o caminho do admin.
- Registro das decisões novas no `AGENTS.md`.
