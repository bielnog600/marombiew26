import { useEffect, useRef } from 'react';

/**
 * Leitura contínua do código de barras no vídeo que já está aberto (sem IA,
 * sem custo). O zxing é carregado só quando a leitura liga.
 */
export function useLiveBarcode(opts: {
  enabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onCode: (code: string) => void;
}) {
  const onCodeRef = useRef(opts.onCode);
  onCodeRef.current = opts.onCode;
  const { enabled, videoRef } = opts;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let controls: { stop: () => void } | null = null;
    const start = async () => {
      const v = videoRef.current;
      if (!v) return;
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'), import('@zxing/library'),
      ]);
      if (cancelled) return;
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 350 });
      const c = await reader.decodeFromVideoElement(v, (res) => {
        if (res && !cancelled) onCodeRef.current(res.getText());
      });
      if (cancelled) c.stop(); else controls = c;
    };
    // Espera o vídeo ter imagem antes de ligar o leitor.
    const timer = window.setTimeout(() => { void start().catch(() => undefined); }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); controls?.stop(); };
  }, [enabled, videoRef]);
}
