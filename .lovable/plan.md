# Métodos de treino no editor e no app do aluno

## Compatibilidade encontrada
- Drop set, Rest-pause e Cluster já existem no catálogo como rótulos, mas ainda não têm execução por partes. Reutilizar esses métodos, sem duplicar o catálogo nem alterar a geração por IA.
- O histórico atual guarda uma carga/repetição por série. Será necessário armazenamento adicional para as partes, com identidade do exercício no plano, mantendo a série principal como referência da progressão.
- O salvamento do editor não preserva todos os dados de método hoje; corrigir esse caminho junto com os novos campos.
- O botão atual de WhatsApp envia apenas um aviso de plano disponível, não o treino completo. Acrescentar um resumo de grupos/métodos somente quando existirem, preservando mensagens de treinos comuns.

## Editor do personal
- Permitir selecionar dois exercícios e agrupá-los como Superset ou Bi-set, exigindo o mesmo número de séries. Bloco com rótulo A1/A2, pausa A→B configurável entre 0 e 10 segundos, arraste do bloco inteiro e Desagrupar.
- Adicionar seletor de método ao lado de Modo de séries, com aplicação na última série por padrão ou em todas.
- Drop set: 1–3 drops e redução padrão de 25%. Rest-pause: 10–20 segundos, padrão 15, duas mini-séries por padrão. Cluster: quantidade de blocos e reps por bloco, pausa de 15–30 segundos, padrão 20.
- Preservar os campos nas edições e versões de planos já salvos; não converter automaticamente métodos antigos em grupos.

## Execução do aluno
- Grupo em um único card com abas A/B, mantendo vídeo, prescrição, sugestões e entradas independentes.
- Após registrar A, aguardar a pausa curta configurada e abrir B; após B, iniciar o descanso do grupo e retornar ao A na próxima série. Mostrar o progresso A/B por série.
- Nas séries com método, mostrar entradas separadas para principal/drops, mini-séries ou blocos. Sugerir cargas dos drops pela redução configurada e iniciar pausas internas automaticamente.
- Preservar todas as partes e o ponto de execução ao sair, retomar, finalizar ou cancelar o treino, inclusive no caminho offline existente.
- Usar somente a parte principal ou o primeiro bloco para sugestão de carga e comparação Sugestão × Execução. Treinos comuns mantêm a apresentação e o comportamento atuais.

## Modo Treino do admin
- Reutilizar os componentes de execução do aluno para grupos A/B e sub-registros, com o mesmo fluxo e pausas automáticas.
- Gravar no mesmo armazenamento e histórico, identificando a execução pelo administrador; preservar o restante do modal e o funcionamento de treinos comuns.

## Apresentação e histórico
- Mostrar grupos e métodos na tabela e nos caminhos de exportação de treino; manter a ordem A1/A2 e a informação de última/todas as séries.
- Acrescentar resumo ao aviso de WhatsApp apenas para planos com esses recursos.
- Histórico exibe todas as partes sem tratá-las como séries extras nos alertas de volume.

## Detalhes técnicos
- Manter `conteudo_json` como fonte da verdade, com campos opcionais `grupo_id`, `tipo_grupo`, `ordem_grupo`, pausa do grupo e configuração de `metodo`. Normalização e projeção para formatos antigos devem preservar esses campos.
- Compatibilizar a nova configuração com `method.slug/params` já existente, evitando duas configurações divergentes para o mesmo método.
- Usar armazenamento aditivo para sub-registros, identificado por sessão, exercício estável do plano e série. Preservar os registros atuais e as permissões de aluno/administrador; não renumerar drops como séries de trabalho.
- Adaptar leitores/gravações e os componentes compartilhados necessários aos novos métodos no aluno e no Modo Treino admin; não redesenhar o restante do modal nem alterar algoritmos de progressão dos treinos comuns.
- Não modificar funções de geração por IA, dietas, avaliações ou dados de planos existentes automaticamente.

## Verificação
- Testar grupos de exatamente dois exercícios, séries iguais, movimento do bloco, desagrupamento e persistência após editar.
- Testar limites e padrões de cada método, aplicação última/todas, cargas de drops e pausas A/B e internas.
- Testar retomada com sub-registros, histórico completo, progressão pela parte principal e volume sem séries extras.
- Testar compatibilidade de treinos antigos sem métodos/grupos e tabela/exportação/mensagem.
- Conferir editor, execução do aluno e Modo Treino admin em celular e desktop, executar os testes pertinentes e verificar a compilação automática.