import { createRoot } from 'react-dom/client';
import './index.css';
import LiveActivityDetailDialog from './components/admin/LiveActivityDetailDialog';

declare global {
  interface Window {
    __probeClosed?: boolean;
  }
}

createRoot(document.getElementById('root')!).render(
  <LiveActivityDetailDialog
    activity={{
      kind: 'water',
      studentId: 'probe-student',
      studentName: 'Gaby Pereira',
      at: new Date().toISOString(),
      date: '2026-10-30',
      addedGlasses: 2,
    }}
    onClose={() => {
      window.__probeClosed = true;
    }}
  />,
);
