# Substituir alimento — layout compacto no iPhone

## Mudanças visíveis
- Transformar o diálogo compartilhado em bottom sheet escuro, com cabeçalho fixo (título, busca e X de 44×44 px afastado do notch), lista rolável e rodapé com Cancelar.
- Reduzir cada substituto a uma linha compacta: nome e quantidade; abaixo macros, selo e apenas diferenças relevantes. Combinações e “Melhor para você” seguem o mesmo padrão.
- Substituir os cartões “Mesma proteína/Mesmas calorias” por um segmento único no topo. O modo proteína continua padrão e a troca recalcula as quantidades exibidas em toda a lista; se não houver diferença entre os modos, o segmento não se repete/desnecessariamente.
- Ao tocar numa opção, destacá-la e abrir no rodapé “Refeição depois” e a confirmação. Cancelar, tocar fora e arrastar a folha para baixo fecham sem substituir.
- Compactar o resumo do alimento atual e retirar deltas zerados e totais repetidos das linhas.

## Dados e lógica
- Filtrar o alimento atual por id/nome e remover nomes quase iguais com os mesmos macros antes de montar substitutos, recomendações e combinações.
- Manter o motor, porções, avisos, recomendações por objetivo e callbacks de gravação existentes; nenhuma dieta será alterada durante os testes.

## Verificação
- Testes para exclusão do original/duplicados, alternância proteína/calorias, seleção/confirmação e área do botão fechar.
- Conferir a folha em viewport de iPhone, incluindo rolagem, safe area, arraste e ausência de overflow; rodar testes relevantes, suíte e verificar o build.
