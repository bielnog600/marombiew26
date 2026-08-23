import { ImgHTMLAttributes } from 'react';
import { useSignedPhotoUrl } from '@/lib/storagePhotos';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
};

/**
 * <img> para fotos guardadas em buckets privados (assessment-photos / scan-photos).
 * Resolve uma signed URL de curta duração antes de renderizar.
 */
export const SignedImage = ({ src, className, ...rest }: Props) => {
  const resolved = useSignedPhotoUrl(src);
  if (!src) return null;
  if (!resolved) {
    return <div className={`bg-muted animate-pulse ${className ?? ''}`} aria-hidden />;
  }
  return <img src={resolved} className={className} {...rest} />;
};

export default SignedImage;
