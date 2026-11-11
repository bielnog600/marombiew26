/**
 * Fila de voz da Correção ao vivo (lógica pura, com saídas injetadas).
 * - Cada fala vira trechos: áudio aprovado (voz gravada) ou voz do celular (fallback).
 * - Um trecho por vez, na ordem (número primeiro, depois a correção), sem sobreposição.
 * - Uma fala nova interrompe a anterior, como a voz do celular já fazia.
 */
import { phraseKeyForText, splitSpeech } from './phrases';

export type VoiceSegment =
  | { kind: 'clip'; key: string; text: string }
  | { kind: 'tts'; text: string };

/** Trechos de uma fala: trecho com áudio aprovado toca o áudio, o resto usa a voz do celular. */
export function resolveVoiceSegments(texts: readonly string[], hasClip: (key: string) => boolean): VoiceSegment[] {
  const out: VoiceSegment[] = [];
  for (const text of texts) {
    const parts = splitSpeech(text);
    const keys = parts.map((p) => phraseKeyForText(p));
    // Fala fora do catálogo continua inteira na voz do celular.
    if (keys.some((k) => k == null)) {
      out.push({ kind: 'tts', text });
      continue;
    }
    parts.forEach((part, i) => {
      const key = keys[i]!;
      out.push(hasClip(key) ? { kind: 'clip', key, text: part } : { kind: 'tts', text: part });
    });
  }
  return out;
}

export interface VoiceOutputs {
  /** Toca o áudio aprovado; resolve quando termina; rejeita se não conseguir tocar. */
  playClip(key: string): Promise<void>;
  /** Fala pela voz do celular; resolve quando termina. */
  speakTts(text: string): Promise<void>;
  /** Para o que estiver tocando agora (áudio e voz do celular). */
  stop(): void;
  hasClip(key: string): boolean;
}

export class VoiceQueue {
  private generation = 0;
  private running: Promise<void> = Promise.resolve();

  constructor(private readonly out: VoiceOutputs) {}

  /** Interrompe a fala atual e fala `texts` em sequência. */
  say(texts: readonly string[]): Promise<void> {
    const segments = resolveVoiceSegments(texts.filter((t) => t && t.trim()), (k) => this.out.hasClip(k));
    const gen = ++this.generation;
    this.out.stop();
    const previous = this.running;
    const job = (async () => {
      // A anterior já foi parada; espera ela soltar a saída antes de começar.
      await previous.catch(() => undefined);
      for (const seg of segments) {
        if (gen !== this.generation) return;
        if (seg.kind === 'clip') {
          try {
            await this.out.playClip(seg.key);
          } catch {
            if (gen !== this.generation) return;
            await this.out.speakTts(seg.text).catch(() => undefined);
          }
        } else {
          await this.out.speakTts(seg.text).catch(() => undefined);
        }
      }
    })();
    this.running = job;
    return job;
  }

  cancel(): void {
    this.generation++;
    this.out.stop();
  }
}
