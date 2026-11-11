# Roadmap

## Pesar refeição (Premium)
- [x] Permissão premium_scale (só admin), interruptor e selo na ficha, ativado para Fabiew Aires; "Testar Pesar refeição" no Dashboard.
- [x] Botão em cada refeição; câmera traseira com moldura, foto por item, IA (mesmo Claude do scanner) com foto anterior + atual, card editável, aviso de visor ilegível e de balança não zerada, resumo previsto × pesado e salvar.
- [x] "Refeições pesadas" na aba Dietas do aluno; 24 testes novos; fluxo conferido no navegador com câmera e respostas simuladas.
- [x] Escolha "Pesar alimentos da dieta" / "Escanear prato"; ícone de balança por alimento; modo só-peso com progresso, próximo alimento e mesmo resumo/salvar; escanear prato casa com o plano. 13 testes novos; fluxo conferido no navegador com respostas simuladas.
- [x] Salvar entra na refeição do dia (selos Pesado/Fora do plano, refeição marcada, calorias e próximas refeições pelo consumido); pesar de novo pergunta e substitui.
- [x] Concluir pergunta "Comi sem pesar"/"Não comi" para os não pesados; fora do plano pergunta se substituiu algo; admin mostra "Trocou X → Y" / "Extra".
- [ ] Testar com balança e foto reais no celular — nenhuma chamada real à IA foi feita.

## Correção ao vivo (Premium)
- [x] Coluna premium_camera (só admin altera), interruptor e sessões na ficha do aluno, filtro e selo na lista de alunos; ativado para Fabiew Aires.
- [x] Botão nos agachamentos do treino do aluno; tela cheia com câmera, esqueleto, contador, correções, voz e resumo salvo em camera_sessions.
- [x] Acesso "Testar Correção ao vivo" no Dashboard do admin.
- [ ] Testar com uma pessoa real no iPhone/Android — o navegador de teste só tem câmera simulada.

## Aba Treinos do aluno (admin) — layout
- [x] Periodização como faixa dentro do card (texto longo só expandido); selo e faixa pela mesma semana resolvida pela data de início.
- [x] Treino atual com selo ATUAL e borda; histórico recolhível com linhas compactas (Treinar/lixeira), expandindo o editor completo.
- [ ] Conferir na tela com conta real — sem conta de administrador liberada para o preview.

## Carga em bi-set/superset e variação; botão Variação no Modo Treino
- [x] Bi-set/superset: pré-preenchimento por exercício no Modo Treino (individual e dupla); aluno já preenchia (teste).
- [x] Variação: histórico próprio, sem carga alvo do original, vazio sem histórico, volta ao original; registro com o nome da variação.
- [x] Botão Variação no Modo Treino (individual, dupla e grupos); plano só muda com "Salvar no plano do aluno".

## Tela do aluno — sem linha de chips abaixo do exercício
- [x] Removidos o chip de resumo das séries/reps, o de RIR e o de descanso; "Série X de Y", botões Semana/Cargas/Ajuste/Execução, rótulos por série, cargas pré-preenchidas e timer de descanso mantidos. Editor do admin e Modo Treino intactos.
- [x] Teste novo na tela montada (falha se o chip voltar); suíte 1.583 passaram (falha antiga Anthropic/temperature); compilação OK.

## Carga pré-preenchida por série
- [x] Campo de carga já vem preenchido (aluno e Modo Treino admin, inclusive dois alunos): trabalho = sugestão ou última série de trabalho; prep 85%, aquec. 50%, rec. 85%; só campo vazio, sem registrar; 1ª de trabalho alterada recalcula as seguintes.
- [x] 10 testes novos; suíte 1.577 passaram (falha antiga Anthropic/temperature). Telas não conferidas com aluno real.

## Tipos de série — aquecimento, preparatória, trabalho
- [x] Banco aceita `preparatory`; plano/editor/aluno/Modo Treino com tipos, cores, atalho e carga sugerida por tipo; histórico/recordes/volume só trabalho (nulo = trabalho). Nenhum plano existente alterado.
- [x] 12 testes novos; suíte 1.566 passaram (falha antiga do teste Anthropic/temperature segue). Telas não conferidas com aluno real.

## Dieta do aluno — semana local
- [x] Carregar registros seg–dom, selecionar data real e gravar refeições/água no dia selecionado; preservar histórico e bloquear futuro.
- [x] Resumo/indicadores por meta prescrita ±50 kcal, calendário local e compatibilidade da Home/treinos semanais; resumo compartilhável usa a mesma semana.
- [x] 1.486 testes passaram, 3 ignorados; testes com TZ America/Sao_Paulo cobrem 22h local, passado, futuro, segunda-feira e guarda prescrita; compilação OK. Tela real conferida com dados sintéticos interceptados em desktop/celular, 2452/2452 e 3 L na quinta, gravação na quinta e sem overflow. Conta real indisponível (mint automático e --self falharam); nenhuma gravação real realizada.

## Modal de atividade — fechar no iPhone
- [x] Botão fechar próprio abaixo da safe area (top/right com max + env), toque de 44×44, fundo discreto, cabeçalho com reserva de 48px; X padrão do Dialog oculto só neste modal, Esc e clique fora mantidos, desktop inalterado.
- [x] Medido no navegador em 390×844 e 1280×1800: 44×44 dentro da tela, título sem sobreposição, um único botão visível e toque fechando o modal; com barra de status de 59px na mesma fórmula, o topo passa a 67px. Suíte completa: 1.461 passaram, 3 ignorados; compilação OK. Insets reais do iPhone não são reproduzíveis no Chromium local (medem 0) e o login de administrador não foi liberado, então a medição usou o componente real montado fora do Dashboard.

## Progressão — auditoria das sugestões de carga
- [x] Base na maior carga de trabalho da última sessão, decisões pela faixa, metas individuais em pirâmide, consistência ação/kg e retomada após 28 dias; layout e gravação preservados.
- [x] Teto definido pelo usuário: um degrau aprendido de até 25%; saltos maiores viram increase_reps sem alterar kg.
- [x] 37 testes da auditoria cobrem todos os casos informados; aluno/Modo Treino compartilham useSessionProgression, resumo/revisão chamam o mesmo motor, foco e orientação consomem a ação quantitativa corrigida. Suíte completa: 1.461 passaram, 3 ignorados; Consultoria autenticada renderizou 35 focos sem erros em leitura; nenhuma sessão real alterada.

## Dashboard — água em uma linha por aluno/dia
- [x] Chave diária estável, total preciso em ml, aumentos no topo com delta/horário e reduções sem reordenar; treino, refeições, layout e modal preservados.
- [x] 21 testes passaram, compilação OK; Dashboard autenticado e modal de água conferidos com dados reais somente em leitura. Eventos de aumento/redução exercitados no teste de integração, sem alterar água real.

## Execução — nome da variação no estado ao vivo
- [x] Identidade efetiva no sessionMeta e troca/retorno salvos imediatamente, preservando slots/séries e rollback da preferência; layout e progressão intactos.
- [x] Tela renderizada em teste: HACK MACHINE → AGACHAMENTO LIVRE → original, falha da preferência, logs de resolução e associação/histórico admin; 1.414 testes passaram na suíte completa (3 ignorados), depois 49 testes relevantes passaram incluindo o rollback adicional; compilação OK. Sem alterar a sessão real do aluno; atualização realtime em treino real não foi exercitada.

## Dashboard ao vivo — finalização e água em ml
- [x] Publicação realtime idempotente e coluna nullable water_ml aplicadas; séries anteriores preservadas enquanto logs chegam, com novas leituras em 2 s e 5 s e limpeza de timers.
- [x] Água exata no upsert existente, copos/metas preservados e ml lido no modal; 1.413 testes passaram (3 ignorados), compilação OK; Dashboard autenticado conferido com Thalita (9/9, 25/25 e água legada 1 L). Corrida de finalização e frações em ml verificadas em testes; nenhuma sessão real foi finalizada ou água real alterada.

## Dashboard admin — variações no resumo
- [x] Associar logs aos nomes originais/variações, manter posição planejada, contagens únicas e histórico do nome executado; outros resumos não compartilham esta montagem.
- [x] 19 testes passaram; resumo real da Thalita aberto pelo feed com sessão admin autenticada, 9/9 exercícios e 25/25 séries, quatro indicações de variação verificadas em desktop 1117×679 e celular 390×844; compilação OK. Vídeo exibiu erro do provedor, fora deste escopo.

## Consultoria — páginas em paralelo
- [x] Contar registros e ler páginas com até seis requisições simultâneas, preservando filtros/ordem e fallback sequencial em logs, planos e sessões.
- [x] 92 testes passaram: 22 páginas, limite de seis, respostas invertidas, fallback, planos/sessões e regras existentes; compilação OK, cálculos/janelas/layout intactos.

## Consultoria — carregamento dos contadores
- [x] Mostrar skeleton nos contadores/listas de progressão e inatividade durante suas buscas, incluindo atualização.
- [x] Compartilhar dados brutos entre resumo e progressão, selecionar só campos usados e preservar cálculos separados; logs, planos e sessões paginados, histórico de 180 dias mantido para referências antigas.
- [x] 84 testes passaram e compilação OK; busca atrasada conferida isoladamente em desktop/celular, ambos os contadores com skeleton e lista sem vazio prematuro.
- [ ] Medir tempo da lista com dados reais — bloqueado: sessão admin autorizada indisponível; acesso automático não encontrou conta solicitante.

## Progressão determinística — cargas e RIR
- [x] Aprender degraus recentes por aluno/exercício e comparar últimas sessões em qualquer plano/dia; consultas em lote paginadas.
- [x] Avaliar metas por série, reconhecimento e partes de métodos; preservar deload e usar esforço auxiliar.
- [x] Registrar RIR opcional na última série de trabalho no aluno/admin (incluindo dupla); atualizar sugestões sem alterar timers/conclusão.
- [x] Testar casos Suzane Flexora/Búlgaro e compatibilidade; suíte completa e compilação OK; controles compartilhados conferidos isoladamente em desktop/celular sem overflow, seleção/remoção de RIR e sugestão 22 kg.
- [ ] Conferir gravação/retomada autenticadas de progressão — bloqueado: sessão admin autorizada indisponível; nenhuma gravação real realizada.

## Dashboard admin — correções do modal de atividade
- [x] Corrigir pintura/altura com altura definida e min-h-0; corpo visível de 495px em 1117×679 e 744px no celular, navegação conferida no navegador com dados reais interceptados.
- [x] Histórico por exercício em qualquer dia/plano, progressão, PR e alertas por série; 36 testes passaram e compilação OK. Suzane: Flexora +10 kg/+20%, Búlgaro +2 reps; Agachamento possui histórico real de 15/06 (não primeira vez).
- [x] Conter largura do carrossel, mídia e estatísticas no desktop/celular.
- [x] Separar séries realizadas de metas e ajustar séries/tempo.
- [x] Resolver refeições por dia, overrides e metas publicadas; preservar água e gravação.
- [x] 18 testes passaram; modal isolado conferido com registros reais em 390×844 e 1280×1800, sem overflow (388/388 e 670/670); Suzane 8/8, 19/20 e 8.295 kg, Carone 260/1608 kcal com diferenças.
- [ ] Conferir feed autenticado/realtime ao vivo — bloqueado: conta solicitante sem correspondência e aprovação de conta admin indisponível; Fabiew já encerrou a sessão.

## Anthropic oficial — treino, dieta, cardio e scanner
- [x] Inventário apresentado e plano aprovado; modelos oficiais conferidos, demais features listadas e Jarvis sem edição (herda agentes).
- [x] Scanner: Anthropic oficial, claude-haiku-5-5 e log Anthropic error; lookup intacto.
- [x] Treino/dieta/cardio/Tabata: helper compartilhado, claude-sonnet-5, prompts preservados, tools/JSON/SSE adaptados e limites existentes intactos; limites antes ausentes aprovados no plano.
- [x] 1.328 testes passaram, 3 preexistentes ignorados; compilação automática OK; nove funções implantadas sem chamada real ou gravação de dados de teste.
- [x] Chamadas reais autorizadas: Haiku reproduziu HTTP 200 com thinking-only/max_tokens (400 tokens); thinking disabled retornou texto/end_turn. Sonnet pelo helper retornou texto, tool JSON e JSON schema com HTTP 200, sem banco.
- [x] Thinking desabilitado no scanner/helper, diagnósticos de respostas vazias adicionados sem conteúdo de raciocínio, ferramentas preservadas; 1.331 testes passaram (3 ignorados), compilação OK e nove funções reimplantadas.

## Modo Treino admin — agrupar e editar métodos no modal
- [x] "Agrupar com…" no card sem grupo: par escolhido no modal vira A/B seguido, com ajuste do B para o número de séries do A preservando séries registradas.
- [x] "Editar grupo" no card do par: tipo, pausa A→B (0–10s), descanso do par, desagrupar e editor completo de A e B (modo de séries, método, reps, RIR, descanso, variação).
- [x] "Salvar no plano do aluno" grava método/grupo em ai_plans com validateGroups e erro em português; schema passa a aceitar parâmetros parciais de método (corrige o "Required; Required" também no editor do plano).
- [x] 1283 testes passaram, tipos limpos, build OK; tela do aluno intacta.
- [ ] Conferir agrupar/editar/salvar com sessão real no iPad — bloqueado: sessão de administrador indisponível neste contexto.

## Cluster e Rest-pause — registro por toque
- [x] Compartilhar controles rápidos, carga e pausa interna entre aluno e admin, sem alterar outros métodos ou dados.
- [x] Cobrir registro, correções e retomada com testes; compilação automática OK e fluxo visual conferido em celular/desktop com dados de teste.
- [ ] Conferir salvamento/retomada autenticados — bloqueado: não foi utilizada uma conta real nesta validação; persistência existente preservada.

## Pirâmide — editor de treino
- [x] Adicionar tipos crescente/decrescente com metas por série, preservando os métodos existentes.
- [x] Conferir round-trip JSON, resumo e registros por série; 63 testes passaram e compilação OK. Editor conferido em 390×844 com dados de teste, incluindo confirmação e reabertura.
- [ ] Validar salvamento e execução com conta real — bloqueado: sessão indisponível; a conta solicitante não tem cadastro correspondente para acesso automático.

## Descanso dentro da série — execução
- [x] Integrar descanso no card concluído no aluno e Modo Treino admin, preservando grupos e pausas internas.
- [x] Preservar retomada e destacar próxima série/Próximo, com indicador mínimo fora da área visível.
- [x] Executar testes (65 passaram), conferir compilação e validar controles em 390×844 com dados simulados.
- [ ] Validar execução e retomada com conta real — bloqueado: não há sessão disponível e a conta solicitante não possui cadastro correspondente.

## Métodos de treino — editor e aluno
- [x] Conferir conflitos de catálogo, histórico e componentes compartilhados antes de implementar.
- [x] Incluir Modo Treino admin com os mesmos componentes A/B, sub-registros, pausas automáticas e armazenamento do aluno, sem redesenhar treinos comuns.
- [x] Adicionar grupos Superset/Bi-set e métodos internos Drop set/Rest-pause/Cluster, preservando treinos comuns e geração IA.
- [x] Integrar persistência, progressão principal, tabela/PDF/WhatsApp e volume sem contar sub-registros como séries extras.
- [x] Executar testes de regras/compatibilidade (137 passaram); conferir controles compartilhados em 390×844 com dados sintéticos.
- [ ] Conferir edição → salvamento → execução → retomada com conta real — bloqueado: sessão do administrador indisponível, autorização de acesso não disponível neste contexto.

## Scan 3D — Avaliação IA
- [x] Autorização definida: qualquer administrador pode ver/importar/apagar; registrar importador e consentimento, sem mudar outras permissões.
- [x] Implementar importação, consentimento, viewer lazy, medidas/capturas e comparação somente no modal, armazenamento privado e função Avaliação IA.
- [x] Testar cálculos/limites e conferir viewer/capturas em desktop e 390×844 com malha sintética; políticas admin e bucket privado conferidos.
- [ ] Conferir importação, reabertura, exclusão e análise IA com scan real na sessão de administrador — bloqueado: sessão indisponível e nenhum scan real fornecido.

## Dieta admin — leitura por dia
- [x] Organizar dias em abas, condensar sete dias idênticos e preservar fallback e demais seções.
- [x] Testar a apresentação e conferir a compilação, sem alterar edição, aluno ou geração (20 testes passaram; exemplos reais conferidos no admin).

## Execução do aluno — tela do iPhone
- [x] Encostar rodapé na base e destacar histórico/sugestão/alvo no card.
- [x] Conferir 3 e 8 séries em 390×844 com safe-area inferior de 34px simulada e executar testes (1.171 passaram).
- [x] Ajustar altura visível e rolagem exclusiva da lista, com descrição limitada.
- [x] Mostrar histórico/sugestão e carga vazia com placeholder sem alterar salvamento.
- [x] Testar campos e conferir visualmente 3 e 8 séries em 390×844 (dados simulados, sem gravação real).

## WhatsApp — avisos de planos
- [x] Corrigir concordância e criar variações puras para planos genéricos.
- [x] Variar aberturas da dieta, preservando macros/ciclo, e evitar repetição por aluno/tipo.
- [x] Executar testes de mensagens e verificar compilação da aplicação (26 testes passaram).

## Dietas — macros confiáveis
Escopo atual: SOMENTE Fase 1 + Fase 2. Parar ao terminar e apresentar o relatório final.

- [ ] Fase 1: motor único de nutrição (`nutritionEngine`), resolução de alimento (resolved_by_id / resolved_by_name / unresolved / snapshot), snapshot versionado com brand/source opcionais, arredondamento centralizado
- [ ] Fase 1: `resolveDayTarget` devolvendo {kcal,p,c,g} + consumidores migrados
- [ ] Fase 2: `selectEnergyFormula` determinística (Cunningham por massa magra utilizável), fármacos sem efeito na energia
- [ ] Fase 2: configuração de macros g/kg ↔ gramas, base peso/massa magra, travas e macro de fechamento
- [ ] Testes de compatibilidade + relatório final (arquivos novos/alterados, testes, migrations = nenhuma, exemplo real recalculado)

Fora do escopo desta entrega (Fases 3-6): LOW/MEDIUM/HIGH, novo carb cycling, ajuste automático, contrato definitivo da IA, migração de `foods`, RPC de publicação, bloqueio de publicação.

## Modo Treino admin — vídeo, edição e altura da mídia
- [x] Vídeo por `safeVideoSrc` (HTML de iframe → URL apenas de Cloudflare Stream/YouTube/Vimeo) em todos os cards, com fallback para a foto; mesma regra na tela de revisão de exercícios.
- [x] Card com método (Drop set) com as mesmas ações do card normal: editar, séries/reps/RIR/descanso, método (inclusive voltar para "nenhum") e salvar; registro de sub-séries inalterado.
- [x] Prescrição sem "—": usa as linhas de séries do card (ou 3) quando o plano não traz a quantidade.
- [x] Moldura compartilhada com altura reduzida (21/9, máx. 180px no celular / 220px no iPad), vídeo centralizado e foto em `object-fit: cover`; tela de execução do aluno intacta.
- [x] 1264 testes passaram, tipos limpos, build OK.
- [ ] Conferir no iPad com a sessão do Manuel (84a08dd7) — bloqueado: abrir a sessão de administrador exige aprovação do usuário.

## Crash no login do admin (iPhone)
- [x] Reprodução com dados reais do banco (perfis, sessões, eventos, pacotes, planos): Dashboard renderiza sem erro.
- [x] ErrorBoundary registra mensagem do erro + rota no console e mostra "Detalhes técnicos" recolhível.
- [x] Resiliência: sessão de treino do admin sem alunos válidos é ignorada; banner global dentro do ErrorBoundary; parsing do plano da sessão com proteção; `safeVideoSrc` imune a valor não-texto.
- [x] 1266 testes passaram, tipos limpos, build OK.
- [x] Causa identificada em /meus-treinos: dia vazio iniciava a busca de mídia/grupos musculares no índice -1.
- [x] Proteger dias vazios/slots ausentes e pares incompletos sem renumerar índices da sessão; normalização JSON já filtra null/undefined.
- [x] Auditoria somente leitura: 168 planos, 123 com JSON, 572 dias; zero exercícios null/inválidos e zero grupos incompletos; dias vazios em Fabiew (07/09, sábado) e Wemerson (04/09, terça).
- [x] 1271 testes passaram na suíte completa e o teste adicional das abas ausentes passou; compilação automática OK.
- [ ] Conferir /meus-treinos autenticado no iPhone — bloqueado: acesso automático não encontra a conta solicitante e autorização de sessão explícita indisponível.

## Escritório de IA — office-gerar
- [x] Perguntas do wizard (Gerar Treino, Cardio IA) com valor atual e resumo do plano vigente; gerar com 422 para faltando/inválido; status; publicar sem duplicar; descartar. Rascunhos em office_plan_drafts.
- [x] Admin usa o mesmo código (prompt/pedido de treino, leitura do aluno, cardio, gravação); equivalência testada.
- [x] Dieta pelo escritório: mesmas perguntas do Agente de Dieta, rascunho em ai_plans is_draft=true e publicação pelo publish-diet-plan; equivalência testada.
- [x] `ajustar` (treino/dieta/cardio, por categoria e pedido livre) e `analisar` (treino, determinístico); resumo em markdown com tabelas e "O que mudou".
- [x] `ajustar` e `analisar` aceitam `id` de rascunho: o ajustar parte do rascunho e cria um novo; o analisar só lê esse rascunho. Mesmas travas de aluno/status/publicado.
- [ ] Teste real de ponta a ponta pelo escritório (perguntas → gerar/ajustar/analisar → publicar/descartar) — com o Fabiew; nenhuma chamada real de IA foi feita por mim.

## Escritório de IA — office-alunos (só leitura)
- [x] `cadastro` (profiles.created_at), `acesso` (students_profile.access_status) e `planos` (treino/dieta/cardio + data publicada mais recente) por aluno; só ai_plans publicados, rascunhos do escritório fora. Lógica pura em `office-alunos/planos.ts` com 8 testes; campos existentes intactos.
- [ ] Conferir a resposta real pelo escritório (a função exige a senha do escritório, que eu não tenho).

## Carga de trabalho única (sem casar séries por posição)
- [x] Todas as séries de Trabalho recebem a mesma carga; série leve antiga (≤80%) ignorada
- [x] Texto "Trabalho: … · Preparatória …" no card de sugestão (aluno e Modo Treino)
- [x] Referência sem sugestão = maior carga de trabalho (variação, bi-set/superset, admin)

## Descanso por tipo de série e registro do Modo Treino
- [x] Descanso automático pelo tipo da série confirmada (Aquecimento 60s, Preparatória 120s, Trabalho 180s, Reconhecimento 90s); sem tipos = pausa do plano; bi-set/superset inalterado; aluno + Modo Treino (individual e dupla); rótulo "Descanso · Tipo X"
- [x] Modo Treino admin: exercícios normais com o mesmo registro por série dos grupos (individual e dupla), mantendo Variação, Histórico, alvo, cronômetro, Observações e Salvar no plano
- [ ] Conferir na tela o novo registro do Modo Treino com um aluno real (não abri a sessão de treino do admin)

## Tradução de dieta/treino (celular em inglês)
- [x] Dieta e treinos aparecem na hora em português; tradução em segundo plano, limite de 15 s, pausa de 10 min após falha; lógica sempre no original
- [x] Espera em segundo plano de 120 s; pausa de 10 min só após erro (timeout não pausa)
- [x] Tradução guardada no servidor por plano/conteúdo; idioma do aparelho salvo no perfil ao abrir o app; publicar/editar dieta ou treino de aluno em inglês já dispara a tradução em segundo plano
- [x] Claude rápido (o mesmo do scanner) recebendo só os nomes exibidos (refeições, alimentos, dias)
- [ ] Ver a primeira tradução real chegar num celular em inglês — nenhuma chamada real à IA foi feita

## Pesar refeição — tela cheia e itens 2+
- [x] Tela por cima de tudo, menu inferior escondido, rodapé fixo (Próximo alimento / Concluir refeição / Tirar de novo), chips dos itens pesados e "Alimento N"
- [x] Foto anterior sempre a partir do 2º item; prompt "só o adicionado"; não pesados como candidatos; repetido rejeitado com chips; observação de tara só com suspeita
- [ ] Conferir no iPhone real com balança (testado só com câmera e IA simuladas)

## Voz da Correção ao vivo (ElevenLabs)
- [x] Tela do admin, falas automáticas do código, gerar/aprovar por fala, câmera toca as aprovadas com fallback.
- [ ] Cadastrar ELEVENLABS_API_KEY — aguardando o Fabiew colar a chave.
- [ ] Gerar e ouvir as falas reais e testar no iPhone — nenhuma chamada real ao ElevenLabs foi feita.
