# Progressão de carga mais precisa

## O que será ajustado
- Aprender o degrau de carga separadamente para cada aluno e exercício, priorizando os últimos 60 dias e sem depender de equipamento ou academia.
- Sugerir somente cargas já registradas ou a carga atual mais o degrau aprendido. Sem histórico confiável, mostrar orientação de reps e reserva sem inventar kg.
- Comparar a sessão mais recente com a última execução anterior do mesmo exercício, mesmo em outro dia/plano ou após uma semana sem treinar.
- Pedir RIR opcional, com 0 / 1 / 2 / 3+, somente na última série de trabalho, tanto no aluno quanto no Modo Treino do admin. Não bloquear conclusão nem alterar descansos.
- Avaliar pirâmides e repetições por série individualmente; excluir reconhecimento da decisão; usar a parte principal de drop/rest-pause e manter suas partes no volume.
- Atualizar sugestões do aluno, admin e revisão semanal com texto direto e metas por série quando necessário.

## Regras de decisão
- Topo da faixa e RIR ≥ 2 permitem subir; RIR ≤ 1 mantém a carga. Sem RIR, preservar confirmação conservadora pelo histórico, sem presumir reserva.
- Degrau acima de 10%: manter carga e aumentar reps primeiro, inclusive além do topo; liberar o degrau somente depois de superar o topo nas séries de trabalho e atender aos critérios de esforço.
- Semanas 2/3 permitem progressão; deload não aumenta carga ou reps. RPE médio da sessão é apenas auxiliar: ≤ 6 reforça progressão com topo atingido, 9–10 reforça manter; não substituir RIR registrado.
- Manter prioridade dos alvos explícitos do treinador e os campos de carga vazios: sugestão não vira registro automático.

## Detalhes técnicos
- Centralizar aprendizado e evidências em `loadIncrement.ts`, comparação por sessão em `weeklyProgression.ts` e metas numéricas em `quantitativeProgression.ts`, compartilhando os resultados entre telas.
- Usar `session_id` para separar sessões; para dados antigos sem esse identificador, usar a data de execução. Consultas não terão filtro por plano/dia para comparação.
- Usar a coluna existente `exercise_set_logs.rir`, preservando rascunhos e salvamento offline. Nenhuma tabela nova, migration ou regravação de histórico.
- Reconhecimento legado será identificado também pela prescrição quando não houver `set_type`; campos ausentes continuarão tolerados.

## Validação
- Testes determinísticos: Flexora da Suzane 50→60 kg (degrau de 20%, reps antes de carga), Búlgaro 10×10→10×12, halteres 12/14/16, troca de academia, isolamento entre alunos e exercícios, falta de histórico, RIR final, pirâmide, reconhecimento, métodos, intervalo entre sessões e deload.
- Executar testes afetados e suíte completa com mocks, conferir compilação automática e apresentação no celular/desktop.
- Não gerar treino/dieta nem chamar IA. Verificação de gravação autenticada dependerá da disponibilidade de sessão autorizada.