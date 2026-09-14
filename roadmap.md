# Roadmap

## Dietas — macros confiáveis
Escopo atual: SOMENTE Fase 1 + Fase 2. Parar ao terminar e apresentar o relatório final.

- [ ] Fase 1: motor único de nutrição (`nutritionEngine`), resolução de alimento (resolved_by_id / resolved_by_name / unresolved / snapshot), snapshot versionado com brand/source opcionais, arredondamento centralizado
- [ ] Fase 1: `resolveDayTarget` devolvendo {kcal,p,c,g} + consumidores migrados
- [ ] Fase 2: `selectEnergyFormula` determinística (Cunningham por massa magra utilizável), fármacos sem efeito na energia
- [ ] Fase 2: configuração de macros g/kg ↔ gramas, base peso/massa magra, travas e macro de fechamento
- [ ] Testes de compatibilidade + relatório final (arquivos novos/alterados, testes, migrations = nenhuma, exemplo real recalculado)

Fora do escopo desta entrega (Fases 3-6): LOW/MEDIUM/HIGH, novo carb cycling, ajuste automático, contrato definitivo da IA, migração de `foods`, RPC de publicação, bloqueio de publicação.
