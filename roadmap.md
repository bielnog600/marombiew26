# Roadmap

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
