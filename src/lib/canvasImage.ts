export const loadBasicImage = (src: string, crossOrigin = true): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin && !src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem.'));
    img.src = src;
  });

export const loadImageForCanvas = async (src: string): Promise<{ image: HTMLImageElement; cleanup: () => void }> => {
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return { image: await loadBasicImage(src, false), cleanup: () => {} };
  }

  try {
    const response = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await loadBasicImage(objectUrl, false);
      return { image, cleanup: () => URL.revokeObjectURL(objectUrl) };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  } catch {
    return { image: await loadBasicImage(src, true), cleanup: () => {} };
  }
};

export const getCanvasFitSize = (width: number, height: number, maxSide: number) => {
  const scale = Math.min(1, maxSide / Math.max(width || 1, height || 1));
  return {
    width: Math.max(1, Math.round((width || 1) * scale)),
    height: Math.max(1, Math.round((height || 1) * scale)),
  };
};