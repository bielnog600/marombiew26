# Correção cirúrgica: referência exata e redundância funcional

## Objetivo
Preservar protocolos detalhados fornecidos pelo professor e bloquear apenas duplicidades nominais ou equivalências funcionais fortes, sem alterar o roteamento Luna → Terra, o schema estruturado, o fluxo legado, dieta, dependências ou UI visível.

## Implementação
1. **Política determinística de referência**
   - Criar um módulo compartilhado que classifique o texto como `free` ou `exact` por sinais estruturais conservadores (dias/sessões, exercícios e parâmetros como séries, reps, descanso, ordem ou foco).
   - Tratar frases condicionais como “somente em amplitude sem dor” como adaptação, não como proibição automática.
   - Enviar ao trainer-agent o modo e o texto da referência sem adicionar controles visuais.

2. **Prompt de referência exata**
   - Substituir a regra genérica de “apoio secundário” pelo bloco explícito de arquitetura prioritária quando o modo for `exact`.
   - Preservar dias, foco, ordem, padrão de movimento, quantidade, séries, reps, descanso, volume e prioridade muscular.
   - Permitir substituição apenas por segurança/restrição explícita, equipamento, catálogo ou autorização do professor; manter função e evitar redundância.
   - Ajustar somente a interpretação de condições de dor para distinguir “proibido” de “permitido com adaptação”.

3. **Hard gate conservador de redundância**
   - Evoluir o validador compartilhado para retornar separadamente `exactDuplicate` e `strongFunctionalDuplicate`.
   - Implementar famílias fortes explícitas e normalizadas (leg press, supino reto, supino inclinado, puxada equivalente com mesmo padrão/pegada e cadeira flexora equivalente), sem usar “mesmo grupo muscular” como duplicidade.
   - Garantir que Hack + Leg Press, Flexora + Stiff, Remada + Puxada, Supino + Crucifixo, Extensora + Leg Press e Hip Thrust + Abdutora continuem permitidos.

4. **Integração à política Luna → Terra**
   - Fazer `criticalValid` exigir ausência de duplicata exata, ausência de equivalente funcional forte e zero mismatch crítico de catálogo.
   - Ignorar `high_similarity` como gatilho de variação quando `referenceMode === "exact"`.
   - Manter fallback por falha técnica, JSON/schema inválido, catálogo crítico e redundância forte; Terra inválida retorna `422 review_required`; orçamento absoluto permanece em 2 chamadas.

5. **Testes e validação**
   - Cobrir classificação `free`/`exact`, preservação do bloco e condição “sem dor”.
   - Cobrir o caso Lower A de referência e todas as combinações permitidas/proibidas solicitadas.
   - Cobrir Luna → Terra, Terra → 422 e ausência de retry por similaridade em modo exato.
   - Executar `deno check` nos módulos modificados, `deno test --allow-read --allow-env supabase/functions/`, `npm test` e `npm run build`, reportando resultados reais.

## Arquivos previstos
- `supabase/functions/_shared/trainerReferencePolicy.ts` (novo)
- `supabase/functions/_shared/workoutRedundancy.ts`
- `supabase/functions/_shared/trainerRoutingPolicy.ts`
- `supabase/functions/trainer-agent/index.ts` (edições localizadas)
- `src/pages/TreinoIA.tsx` (somente payload/prompt interno; UI inalterada)
- testes Deno compartilhados/existentes
