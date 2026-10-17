# Roadmap

## Scan 3D — Avaliação IA
- [x] Autorização definida: qualquer administrador pode ver/importar/apagar; registrar importador e consentimento, sem mudar outras permissões.
- [ ] Implementar importação, consentimento, viewer lazy, medidas/capturas e comparação somente no modal, armazenamento privado e função Avaliação IA.
- [ ] Testar permissões, medidas e fluxo completo, sem alterar os demais fluxos.

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
