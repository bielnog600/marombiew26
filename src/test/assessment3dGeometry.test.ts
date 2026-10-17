import { describe, expect, it } from 'vitest';
import { SCAN_MAX_BYTES, convexHull, hullPerimeter, measureScan, scanScale, scanValues, sliceContours, validateScanUpload } from '@/lib/assessment3dGeometry';

function box(x: number, width: number, depth: number, height = 100) {
  const p = [[x-width/2,0,-depth/2],[x+width/2,0,-depth/2],[x+width/2,height,-depth/2],[x-width/2,height,-depth/2],[x-width/2,0,depth/2],[x+width/2,0,depth/2],[x+width/2,height,depth/2],[x-width/2,height,depth/2]];
  const faces = [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[3,2,6],[3,6,7],[0,3,7],[0,7,4],[1,5,6],[1,6,2]];
  return faces.flatMap(f => f.flatMap(i => p[i]));
}
describe('scan 3D geometry and import constraints', () => {
  it('requires explicit consent before upload', () => { expect(() => validateScanUpload('body.obj', 100, false)).toThrow(); });
  it('accepts exactly 50 MB and rejects larger files', () => { expect(SCAN_MAX_BYTES).toBe(52428800); expect(validateScanUpload('body.glb', SCAN_MAX_BYTES, true)).toBe('glb'); expect(() => validateScanUpload('body.ply', SCAN_MAX_BYTES+1, true)).toThrow(); });
  it('accepts only OBJ PLY GLB, rejects empty files', () => { for (const ext of ['obj','ply','glb']) expect(validateScanUpload(`scan.${ext}`, 10, true)).toBe(ext); expect(() => validateScanUpload('scan.zip', 10, true)).toThrow(); expect(() => validateScanUpload('scan.obj', 0, true)).toThrow(); });
  it('warns only for height discrepancy above 5%', () => { expect(scanScale(190,200).warning).toBe(false); expect(scanScale(189,200).warning).toBe(true); expect(scanScale(100,200).factor).toBe(2); });
  it('calculates tape-like convex hull perimeter in cm', () => { expect(hullPerimeter(convexHull([[0,0],[10,0],[10,20],[0,20],[5,5]]))).toBe(60); expect(sliceContours(new Float32Array(box(0,10,20)),50)[0].perimeter).toBe(60); });
  it('isolates right and left thigh contours instead of wrapping both legs', () => {
    const triangles = new Float32Array([...box(-15,10,20),...box(15,12,20)]);
    expect(sliceContours(triangles,44)).toHaveLength(2);
    const measures = measureScan(triangles,100);
    expect(measures.coxa_direita.value).toBe(60); expect(measures.coxa_esquerda.value).toBe(64);
    expect(measures.cintura.value).toBeNull();
  });
  it('does not invent circumference for an open surface', () => { expect(sliceContours(new Float32Array([0,0,0,10,100,0,20,0,0]),50)).toHaveLength(0); });
  it('manual correction wins while cut position remains adjustable', () => {
    const m = measureScan(new Float32Array(box(0,10,20)),100,{ cintura: { percent: 62, value: 82.3, manual: true, hull: [] } });
    expect(m.cintura.value).toBe(82.3); expect(m.cintura.percent).toBe(62); expect(scanValues(m).cintura).toBe(82.3);
  });
});