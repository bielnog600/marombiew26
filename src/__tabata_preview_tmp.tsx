import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import TabataExecucao from './pages/TabataExecucao';
import { parseTabata } from './lib/tabataParser';
const md = (window as any).__MD__ as string;
createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[{ pathname: '/t', state: { tabata: parseTabata(md), preview: true } }]}>
    <Routes><Route path="/t" element={<TabataExecucao />} /></Routes>
  </MemoryRouter>,
);
