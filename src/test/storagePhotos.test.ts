import { describe, it, expect } from 'vitest';
import { extractPrivateStorageRef } from '@/lib/storagePhotos';

const BASE = 'https://proj.supabase.co/storage/v1/object';

describe('extractPrivateStorageRef', () => {
  it('extrai bucket/path de URL pública de assessment-photos', () => {
    expect(extractPrivateStorageRef(`${BASE}/public/assessment-photos/uid-1/aid-2/frente.jpg`)).toEqual({
      bucket: 'assessment-photos',
      path: 'uid-1/aid-2/frente.jpg',
    });
  });

  it('extrai bucket/path de URL assinada de scan-photos (descarta query)', () => {
    expect(extractPrivateStorageRef(`${BASE}/sign/scan-photos/uid-1/123_front.jpg?token=abc`)).toEqual({
      bucket: 'scan-photos',
      path: 'uid-1/123_front.jpg',
    });
  });

  it('ignora bucket público de exercícios', () => {
    expect(extractPrivateStorageRef(`${BASE}/public/exercise-images/supino.jpg`)).toBeNull();
  });

  it('ignora data URLs, blob URLs e vazios', () => {
    expect(extractPrivateStorageRef('data:image/png;base64,AAA')).toBeNull();
    expect(extractPrivateStorageRef('blob:http://localhost/abc')).toBeNull();
    expect(extractPrivateStorageRef(null)).toBeNull();
    expect(extractPrivateStorageRef(undefined)).toBeNull();
  });
});
