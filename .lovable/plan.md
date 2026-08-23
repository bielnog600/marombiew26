# Plano de Restauração da Consultoria Admin

Restaurar a estrutura de navegação completa da página de Consultoria, mantendo as novas funcionalidades de Alertas e Progressão Semanal implementadas recentemente.

## Alterações Propostas

### UI e Navegação (`src/pages/Consultoria.tsx`)
- **Restaurar Arquitetura de Abas**: Voltar a usar a navegação por abas horizontais scrolláveis com os itens: Dashboard, Alertas, Alunos, Dietas, Treinos, Fichas, Vídeos, Notificações.
- **Aba Alertas**: Manter a nova organização de follow-up (Para falar hoje, Já falados, Voltam depois, Inativos +3 dias, Progressão semana) dentro desta aba.
- **Aba Alunos**: Restaurar o uso do componente `ConsultoriaStudentSearch`.
- **Aba Vídeos**: Restaurar o uso do componente `AllExecutionVideos`.
- **Aba Notificações**: Restaurar o uso do componente `PushNotificationsToday`.
- **Aba Fichas**: Implementar listagem de questionários (respondida, pendente, sem ficha).

### Módulos de Ciclo (Dietas e Treinos)
- **Implementar `getCycleInfo`**: Função centralizada para calcular dias decorridos, dias restantes, status (ok, atenção, vencido) e progresso, baseada na regra de 35/45 dias.
- **Aba Dietas**: Listar alunos com última dieta, contagem, progresso visual (barra colorida) e badges de status.
- **Aba Treinos**: Listar alunos com último treino, contagem, progresso visual e badges de status.
- **Lógica Visual**:
  - < 35 dias: Verde (OK)
  - 35-44 dias: Laranja (Atenção)
  - >= 45 dias: Vermelho (Vencido)

### Otimização de Dados
- **Busca em Lote**: Restaurar a query em lote da tabela `ai_plans` para evitar problemas de performance (N+1) ao listar os ciclos de todos os alunos.

## Detalhes Técnicos

### Funções de Apoio
```typescript
type CycleStatus = 'ok' | 'atencao' | 'vencido';

const getCycleInfo = (dateStr: string | null) => {
  if (!dateStr) return { days: 0, remaining: 0, status: 'vencido' as const, progress: 100 };
  const days = differenceInDays(new Date(), new Date(dateStr));
  const remaining = Math.max(0, 45 - days);
  let status: CycleStatus = 'ok';
  if (days >= 45) status = 'vencido';
  else if (days >= 35) status = 'atencao';
  const progress = Math.min(100, (days / 45) * 100);
  return { days, remaining, status, progress };
};
```

### Componentes de UI
- Reutilizar `Progress` do shadcn com cores dinâmicas.
- Garantir `overflow-x-auto` nas abas para suporte mobile.

### Segurança e Integridade
- Manter RLS e políticas de acesso existentes.
- Garantir que a Progressão Semanal e a Telemetria não sejam alteradas, apenas realocadas na UI.
