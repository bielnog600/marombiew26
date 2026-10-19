import React from 'react';
import { createRoot } from 'react-dom/client';
import { ExerciseMediaFrame } from './components/training/ExerciseMediaFrame';

const EMBED_HTML =
  '<div class="cp-embed"><iframe src="https://iframe.videodelivery.net/9e36probe000"></iframe></div>';

export function mountProbe(el: HTMLElement) {
  createRoot(el).render(
    <div className="w-full">
      <div data-probe="video">
        <ExerciseMediaFrame embed={EMBED_HTML} imageUrl="https://placehold.co/600x400" alt="LEG 180" />
      </div>
      <div data-probe="foto">
        <ExerciseMediaFrame embed={null} imageUrl="https://placehold.co/600x400" alt="Cadeira extensora" />
      </div>
      <div data-probe="inseguro">
        <ExerciseMediaFrame embed="https://evil.example.com/v.mp4" imageUrl={null} alt="Host não permitido" />
      </div>
    </div>,
  );
}
