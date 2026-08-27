import { supabase } from '@/integrations/supabase/client';

export const SOCIAL_BUCKET = 'social-media';

export interface SocialPost {
  id: string;
  kind: 'reel' | 'carousel';
  title: string | null;
  student_id: string | null;
  file_paths: string[];
  cover_path: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const uploadSocialFile = async (blob: Blob, ext: string, folder: string) => {
  const path = `${folder}/${uid()}.${ext}`;
  const { error } = await supabase.storage.from(SOCIAL_BUCKET).upload(path, blob, {
    contentType: blob.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return path;
};

export const saveSocialPost = async (input: {
  kind: 'reel' | 'carousel';
  title?: string | null;
  studentId?: string | null;
  filePaths: string[];
  coverPath?: string | null;
  meta?: Record<string, unknown>;
}) => {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sessão expirada.');
  const { error } = await supabase.from('social_media_posts' as never).insert({
    created_by: userId,
    kind: input.kind,
    title: input.title ?? null,
    student_id: input.studentId ?? null,
    file_paths: input.filePaths,
    cover_path: input.coverPath ?? null,
    meta: input.meta ?? {},
  } as never);
  if (error) throw error;
};

export const listSocialPosts = async (): Promise<SocialPost[]> => {
  const { data, error } = await supabase
    .from('social_media_posts' as never)
    .select('id, kind, title, student_id, file_paths, cover_path, meta, created_at')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []) as unknown as SocialPost[];
};

export const signSocialPath = async (path: string, expiresIn = 3600) => {
  const { data } = await supabase.storage.from(SOCIAL_BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
};

export const deleteSocialPost = async (post: SocialPost) => {
  if (post.file_paths.length) {
    await supabase.storage.from(SOCIAL_BUCKET).remove(post.file_paths);
  }
  const { error } = await supabase.from('social_media_posts' as never).delete().eq('id', post.id);
  if (error) throw error;
};
