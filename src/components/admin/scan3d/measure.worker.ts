import { measureScan, type ScanMeasurements } from '@/lib/assessment3dGeometry';
let triangles = new Float32Array();
self.onmessage = (event: MessageEvent<{ triangles?: Float32Array; height: number; settings: ScanMeasurements; requestId: number }>) => {
  try {
    if (event.data.triangles) triangles = event.data.triangles;
    self.postMessage({ requestId: event.data.requestId, measurements: measureScan(triangles, event.data.height, event.data.settings) });
  } catch (error) { self.postMessage({ requestId: event.data.requestId, error: error instanceof Error ? error.message : 'Não foi possível medir a malha.' }); }
};