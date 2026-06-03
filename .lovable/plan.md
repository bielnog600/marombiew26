### Plano de Refinamento da Agenda MAROMBIEW

O objetivo é transformar a interface da Agenda para uma experiência mais premium e organizada, focando em hierarquia visual, clareza e densidade de informação sem alterar a lógica subjacente.

#### 1. Estrutura do Cabeçalho e Ações
- Criar um novo componente de cabeçalho (`AgendaHeader`) para gerenciar:
  - Título e subtítulo "Agenda de atendimentos".
  - Ações no lado direito (filtros, configurações, botão "Agendar").
  - Segmented control para alternar entre "Dia/Semana/Mês".

#### 2. Redesenho dos Cards KPI (Dashboard)
- Reduzir o grid do topo para 4 cards: "Hoje", "Próxima", "Pendentes", "Cancelados".
- Estilizar como cards compactos, com ícones sutis e tipografia clara (valor em destaque, label em tamanho menor).

#### 3. Controle e Navegação Temporal
- Implementar o "Segmented Control" refinado (Dia, Semana, Mês).
- Melhorar a barra de navegação com "Hoje" centralizado e botões de seta mais limpos.
- Exibir a data atual com formato amigável ("Qua, 04 Jun 2026").

#### 4. Refinamento da Grade e Cards de Evento
- **Grade (DayView):** Ajustar o espaçamento, divisões de 30 minutos mais suaves e melhorar o contraste das horas. Linha de tempo atual (present line) será mais destacada em vermelho.
- **Card de Evento:**
  - Melhorar a hierarquia: Horário (negrito) > Nome do Aluno > Tipo da Aula/Local.
  - Usar badges mais elegantes (com cores de fundo leves) para os status de agendamento (Confirmada, Pendente, etc.).
  - Adicionar indicadores visuais (ícones menores) para "Grupo/Duo", "Recorrente".

#### 5. Sistema de Cores e Status
- Padronizar as cores dos status em toda a interface para leitura instantânea:
  - Agendada: Verde/Primário
  - Pendente: Amarelo/Âmbar
  - Reagendada: Azul
  - Cancelada: Vermelho/Cinza suave

#### 6. Implementação Técnica
- Criar novos componentes especializados dentro de `src/components/agenda/` para manter `Agenda.tsx` limpo.
- Utilizar `tailwind` para o design system (Dark Mode + Amarelo).
- Manter a lógica de drag-and-drop e a estrutura de estados do `Agenda.tsx`.

---

**Arquivos a serem criados/editados:**
- `src/components/agenda/AgendaHeader.tsx` (Novo)
- `src/components/agenda/AgendaStats.tsx` (Novo)
- `src/components/agenda/AgendaNavigation.tsx` (Novo)
- `src/components/agenda/AgendaGrid.tsx` (Novo)
- `src/pages/Agenda.tsx` (Refatoração para usar novos componentes)
