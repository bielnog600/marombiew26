import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Buckets privados que guardam mídia sensível de aluno.
 * As URLs gravadas no banco continuam no formato "public" (identificador estável),
 * mas o acesso real exige uma signed URL de curta duração.
 */
export const PRIVATE_PHOTO_BUCKETS = ['assessment-photos', 'scan-photos'] as const;
export type PrivatePhotoBucket = (typeof PRIVATE_PHOTO_BUCKETS)[number];

const SIGNED_TTL_SECONDS = 60 * 30; // 30 min
const REFRESH_MARGIN_MS = 60 * 1000;

const cache = new Map<string, { url: string; expiresAt: number }>();

export interface StorageRef { bucket: PrivatePhotoBucket; path: string }

/** Extrai bucket/path de uma URL de storage (public, signed ou authenticated). */
export function extractPrivateStorageRef(rawUrl: string | null | undefined): StorageRef | null {
  if (!rawUrl) return null;
  for (const bucket of PRIVATE_PHOTO_BUCKETS) {
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
      `/storage/v1/object/${bucket}/`,
    ];
    for (const marker of markers) {
      const idx = rawUrl.indexOf(marker);
      if (idx >= 0) {
        const path = rawUrl.slice(idx + marker.length).split('?')[0];
        if (!path) return null;
        return { bucket, path: decodeURIComponent(path) };
      }
    }
  }
  return null;
}

/** Resolve uma URL exibível. Retorna a original quando não for bucket privado. */
export async function resolvePhotoUrl(rawUrl: string | null | undefined): Promise<string | null> {
  if (!rawUrl) return null;
  const ref = extractPrivateStorageRef(rawUrl);
  if (!ref) return rawUrl;

  const key = `${ref.bucket}/${ref.path}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return cached.url;

  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;

  cache.set(key, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000 });
  return data.signedUrl;
}

/** Resolve várias URLs de uma vez, preservando a ordem. */
export async function resolvePhotoUrls(urls: (string | null | undefined)[]): Promise<(string | null)[]> {
  return Promise.all(urls.map((u) => resolvePhotoUrl(u)));
}

/** Resolve um objeto { chave: url } mantendo as chaves. */
export async function resolvePhotoUrlMap<T extends Record<string, string | null | undefined>>(
  input: T,
): Promise<Record<keyof T, string | null>> {
  const entries = Object.entries(input);
  const resolved = await resolvePhotoUrls(entries.map(([, v]) => v));
  const out = {} as Record<keyof T, string | null>;
  entries.forEach(([k], i) => { out[k as keyof T] = resolved[i]; });
  return out;
}

/**
 * Hook: recebe uma lista de URLs armazenadas e devolve um resolvedor síncrono.
 * Enquanto a signed URL não chega, retorna undefined (a UI mostra placeholder).
 */
export function useSignedPhotoUrls(urls: (string | null | undefined)[]) {
  const stableKey = useMemo(() => urls.filter(Boolean).join('|'), [urls]);
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const list = stableKey ? stableKey.split('|') : [];
    if (list.length === 0) return;
    (async () => {
      const resolved = await resolvePhotoUrls(list);
      if (cancelled) return;
      const next: Record<string, string> = {};
      list.forEach((raw, i) => { const r = resolved[i]; if (r) next[raw] = r; });
      setMap((prev) => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [stableKey]);

  return (url: string | null | undefined): string | undefined => {
    if (!url) return undefined;
    if (!extractPrivateStorageRef(url)) return url;
    return map[url];
  };
}

/** Hook para uma única URL. */
export function useSignedPhotoUrl(url: string | null | undefined): string | undefined {
  const resolver = useSignedPhotoUrls([url]);
  return resolver(url);
}
