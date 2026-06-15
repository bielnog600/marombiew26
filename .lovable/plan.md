# Vídeos de Execução do Aluno

Permitir que o aluno grave/envie um vídeo curto por exercício durante o treino, com upload para Cloudflare Stream, e revisão pelo admin no perfil do aluno.

## 1. Banco de dados (nova migração)

Criar tabela `exercise_execution_videos`:

```text
id                  uuid pk
student_id          uuid not null → auth.users
workout_session_id  uuid null     → workout_sessions
plan_id             uuid null     → ai_plans
exercise_name       text not null
exercise_id         uuid null     → exercises
cf_uid              text not null  (Cloudflare Stream UID)
playback_url        text not null
thumbnail_url       text null
duration_seconds    int  null
status              text default 'uploading'  -- uploading|ready|error|pending_review|reviewed|needs_redo
admin_note          text null
reviewed_at         timestamptz null
reviewed_by         uuid null
created_at          timestamptz default now()
updated_at          timestamptz default now()
unique (student_id, workout_session_id, exercise_name)  -- 1 vídeo por exercício por sessão
```

Index em `(student_id, created_at desc)`.

GRANTs:
- `authenticated`: SELECT/INSERT/UPDATE/DELETE
- `service_role`: ALL

RLS:
- Aluno: pode SELECT/INSERT/UPDATE/DELETE seus próprios vídeos (`student_id = auth.uid()`)
- Admin (`has_role(auth.uid(),'admin')`): pode SELECT/UPDATE todos (para revisão e nota)

Trigger `update_updated_at` em UPDATE.

## 2. Edge function `student-video-upload`

Hoje `cloudflare-stream-upload` é **admin-only**. Criar nova função similar mas aberta a `authenticated` (com validação de JWT em código). Retorna `uploadURL`, `uid`, `playbackUrl`. `maxDurationSeconds` limitado a 30s no servidor.

## 3. UI — Aluno (sem mudar layout principal)

Novo componente `ExerciseVideoCapture.tsx` — botão compacto adicionado ao final do `ExerciseLogCard`, na mesma linha do "Salvar":

- Botão **"Gravar execução"** (ícone Video) — abre `<input type="file" accept="video/*" capture="environment">`.
- Botão secundário **"Da galeria"** — `<input type="file" accept="video/*">`.
- Após selecionar:
  1. Valida duração ≤ 30s via `<video>.duration`.
  2. Chama edge `student-video-upload` para obter `uploadURL`.
  3. `PUT` do arquivo direto no Cloudflare via `XMLHttpRequest` (para progress).
  4. Insere linha em `exercise_execution_videos` com `status='pending_review'`.
- Estados visuais: idle / enviando (com %) / enviado (check verde) / erro (botão "Reenviar").
- Se houver vídeo existente para esse exercício+sessão, mostra "✓ Vídeo enviado" + botão "Substituir".
- **Offline**: se sem conexão, mostra aviso "Sem conexão — envie depois" e não enfileira binário (Cloudflare exige upload direto). Re-tentável quando voltar online.

Plumbing no `TreinoExecucao.tsx`: passar `sessionId`, `planId` para o card. `ExerciseLogCard` recebe novo prop opcional `videoCaptureSlot` e renderiza o componente.

## 4. UI — Admin / Consultoria

Em `AlunoDetail.tsx`, na aba **Treinos**, adicionar sub-seção/aba **"Vídeos de execução"**: novo componente `StudentExerciseVideos.tsx`.

Lista (mais recentes primeiro) com cards:
- Thumbnail (Cloudflare gera automático: `https://videodelivery.net/{uid}/thumbnails/thumbnail.jpg`)
- Nome do exercício • duração • data • sessão (dia/fase se disponível)
- Badge de status (pendente revisão / revisado / pedir novo)
- Ações: **Assistir** (modal com iframe Cloudflare), **Marcar revisado**, **Pedir novo vídeo** (muda status → `needs_redo`), **Nota** (textarea inline), **WhatsApp** (link `wa.me` reusando telefone do perfil).

Badge de contador "N vídeos pendentes" no header da aba.

## 5. Detalhes técnicos

- Cloudflare Stream Direct Creator Upload: usar `tus` opcional, mas para simplicidade usar `POST` (Cloudflare aceita PUT/POST no `uploadURL`).
- Thumbnail: derivada do `uid` (`https://videodelivery.net/{uid}/thumbnails/thumbnail.jpg?time=2s&height=200`).
- Duração persistida do `<video>.duration` lido antes do upload.
- Tipos: regenerar `src/integrations/supabase/types.ts` automaticamente após migração.

## Arquivos

**Novos**
- `supabase/migrations/<ts>_exercise_execution_videos.sql`
- `supabase/functions/student-video-upload/index.ts`
- `src/components/training/ExerciseVideoCapture.tsx`
- `src/components/admin/StudentExerciseVideos.tsx`

**Editados**
- `src/components/training/ExerciseLogCard.tsx` — novo prop slot + renderização.
- `src/pages/TreinoExecucao.tsx` — passar `sessionId`, `planId`, `exerciseName` ao card.
- `src/pages/AlunoDetail.tsx` — adicionar sub-aba "Vídeos de execução" dentro de Treinos.

## Fora de escopo (próximas iterações)
- Compressão client-side (depende de FFmpeg.wasm, pesado).
- Enfileiramento offline do binário em IndexedDB.
- Múltiplos vídeos por exercício/sessão.
