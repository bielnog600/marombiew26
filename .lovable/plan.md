# Pirâmide no editor de treino

- Adicionar **Pirâmide** ao seletor, com tipos **Crescente** e **Decrescente**.
- Reaproveitar os campos existentes de repetições por série. Sugerir 12/10/8/6 no tipo crescente e a sequência inversa no decrescente, respeitando a quantidade de séries do exercício.
- Exibir o método e a orientação de carga no resumo e na execução; registrar carga e reps por série pelos controles existentes, sem calcular cargas automaticamente.
- Preservar os demais métodos, histórico, descanso, grupos e treinos já salvos.

## Detalhes técnicos
- Salvar a direção em `method.slug` (`pyramid_up`/`pyramid_down`) e as metas em `setScheme.per_set`, sem criar sub-registros ou alterar o banco.
- Testar os dois tipos, troca de tipo, persistência JSON e execução por série; verificar a compilação.