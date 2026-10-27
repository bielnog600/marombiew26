# Anthropic oficial para treino, dieta, cardio e scanner

## Resultado
Migrar apenas as chamadas abaixo para `https://api.anthropic.com/v1/messages`, com o secret existente `ANTHROPIC_API_KEY`. Não consultar a IA de verdade até você confirmar a troca da chave. Não alterar banco, publicação de planos, cálculos nutricionais nem telas.

Os IDs solicitados estão documentados pela Anthropic: `claude-haiku-5-5` e `claude-sonnet-5`. Sonnet 5 continua disponível, embora a documentação recomende Sonnet 5.5; manteremos **Sonnet 5**, como solicitado.

## Inventário antes da migração

Todos os modelos abaixo são os configurados no código atual. A lista de secrets não contém `AI_PRIMARY_MODEL` nem `AI_FALLBACK_MODEL`, portanto não há substituição por esses secrets na lista disponível.

| Função / chamada | Provedor atual | Modelo atual | Limite de saída atual |
|---|---|---|---|
| `food-scanner`: extract / evaluate | KYRON, formato Anthropic | `claude-haiku-4-5` | 1.200 / 400 |
| `trainer-agent`: geração JSON e tentativas alternativas | OpenAI oficial | `gpt-5.6-luna` / `gpt-5.6-terra` | 16.000 |
| `trainer-agent`: geração markdown | OpenAI oficial | `gpt-4o` | 16.000 |
| `training-edit-agent`: edição de exercícios/dias | OpenAI oficial | `gpt-4o` | 4.000 |
| `diet-agent`: geração JSON, candidatos e correções | OpenAI oficial | `gpt-5.6-luna` / `gpt-5.6-terra` | 24.000 |
| `diet-agent`: geração/ajuste markdown | OpenAI oficial | `gpt-4o` | 16.000 |
| `diet-edit-agent`: edição por IA | OpenAI oficial | `gpt-4o` | 4.000 |
| `diet-edit-agent`: sugestões de refeição | OpenAI oficial | `gpt-4o` | 2.000 |
| `diet-renewal-analyzer`: recomendação de manter/ajustar/renovar | OpenAI oficial | `gpt-4o-mini` | Não definido |
| `diet-renewal-analyzer`: geração direta de contingência | OpenAI oficial | `gpt-4o` | 8.000 |
| `workout-renewal-analyzer`: recomendação e ajustes de treino | OpenAI oficial | `gpt-4o-mini` | Não definido |
| `cardio-agent`: geração semanal com tool | OpenAI oficial | `gpt-4o` | Não definido |
| `tabata-agent`: geração de treino Tabata | OpenAI oficial | `gpt-4o` | Não definido |

`weight-checkin-review` e `low-cost-auto-review` não chamam um modelo diretamente: reutilizam os analisadores acima. Ajustes determinísticos (`dietAutoAdjust`, reequilíbrio e reparos nutricionais) não são chamadas de IA e ficam intactos.

## Limites: decisão necessária antes de alterar

A Anthropic exige `max_tokens`, mas quatro chamadas atualmente não informam limite. Proposta para essas chamadas:
- Recomendação de renovação de dieta: **4.000**.
- Recomendação de renovação de treino: **4.000**.
- Cardio semanal: **16.000**.
- Tabata: **16.000**.

**A aprovação do plano autoriza apenas estes novos limites para as chamadas sem limite.** Todos os limites já definidos serão preservados.

Aviso: 4.000 tokens na edição de muitos exercícios/alimentos pode cortar uma resposta extensa; 2.000 nas sugestões tende a comportar três alternativas curtas, mas não garante respostas longas. Não há evidência de que sejam insuficientes especificamente no Sonnet 5 sem testar; não aumentaremos esses limites sem nova autorização.

## Implementação

1. Scanner: trocar somente a URL base, modelo e identificação dos logs para `Anthropic error`; manter busca Open Food Facts, cache, prompts, imagem base64 e respostas.
2. Criar um helper compartilhado exclusivo das funções migradas, usando o secret `ANTHROPIC_API_KEY`, versão `2023-06-01` e modelo `claude-sonnet-5`.
3. Preservar literalmente prompts e schemas. Adaptar ferramentas e escolha obrigatória para o formato Anthropic; preservar saída estruturada estrita e JSON. Traduzir as respostas e streams para os envelopes já esperados pelo aplicativo, sem modificar o front.
4. Preservar validações, tentativas alternativas, limites, cancelamento, estatísticas de uso e persistência existentes. As tentativas atuais passarão a usar o mesmo Sonnet 5, sem fallback para OpenAI.
5. Compartilhar o mapeamento de erros solicitado: 429 → “Muitas solicitações agora. Tente de novo em instantes.”; 401/402/403 ou erro de crédito/billing → “Créditos de IA esgotados.”; demais, incluindo 529 → “Não foi possível consultar a IA agora.”. Logs com status e corpo, sem chave.
6. Atualizar os testes do scanner e adicionar testes simulados do helper: autenticação, modelos, limites, ferramentas, JSON estrito, streaming, cancelamento e erros.
7. Rodar testes e implantar somente as nove funções alteradas. Sem chamada real de IA, sem registrar escaneamentos ou gerar planos de teste no banco.

## Fora da migração

| Função / recurso | Provedor/modelo atual ou dependência |
|---|---|
| `jarvis-bridge` | Não chama IA diretamente; invoca `trainer-agent` e `diet-agent` |
| `body-composition-ai` | OpenAI; modelos do router (`gpt-5.6-terra` / `gpt-5.6-luna`) |
| `posture-ai-analysis` | OpenAI; `gpt-4o` |
| `organize-exercise-variations` | OpenAI; `gpt-4o` |
| `human-first-review` (metadados de exercícios) | Gateway Lovable; `openai/gpt-5.5` |
| `food-search-ai` (cadastro/busca de alimentos, não geração de dieta) | OpenAI; `gpt-4o-mini` |
| `translate-plan` (tradução, não geração/edição de prescrição) | Gateway Lovable; `google/gemini-2.5-flash` |

Não alterar o router compartilhado atual, pois também atende avaliação corporal. Nenhuma outra chamada KYRON foi encontrada além do scanner.

**Jarvis:** seu código fica intacto, mas as operações de gerar treino/dieta herdarão a Anthropic ao chamar os agentes migrados. Isolar Jarvis no provedor antigo exigiria mudar seu fluxo, o que está fora do pedido.

## Detalhes técnicos
- Helper em `supabase/functions/_shared/anthropic.ts`, sem redirecionar chamadas de outros módulos.
- Schemas strict via saída estruturada Anthropic; function calling via `tools[].input_schema` e `tool_choice` correspondente.
- Adaptador SSE mantém `choices[].delta.content`, uso e `[DONE]` esperados atualmente; converte `max_tokens` em indicação de truncamento já reconhecida pelo aplicativo.
- Documentar a fronteira de integração em `AGENTS.md` e atualizar o roadmap.

Referências oficiais: [modelos](https://platform.claude.com/docs/en/about-claude/models/overview), [Sonnet 5](https://docs.anthropic.com/en/docs/about-claude/models/whats-new-sonnet-5), [streaming](https://docs.anthropic.com/en/api/messages-streaming).