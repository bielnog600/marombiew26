import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { scanScale } from '@/lib/assessment3dGeometry';

export async function loadScanModel(bytes: ArrayBuffer, format: string) {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    throw new Error('O GLB precisa ter a malha e as texturas incorporadas, sem arquivos externos.');
  });
  let model: THREE.Object3D;
  if (format === 'obj') model = new OBJLoader(manager).parse(new TextDecoder().decode(bytes));
  else if (format === 'ply') {
    const geometry = new PLYLoader(manager).parse(bytes);
    if (!geometry.index) throw new Error('Este PLY é uma nuvem de pontos. Exporte uma malha com faces para medir perímetros.');
    geometry.computeVertexNormals();
    model = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: !!geometry.getAttribute('color'), roughness: 0.8 }));
  } else model = (await new GLTFLoader(manager).parseAsync(bytes, '')).scene;
  let vertices = 0;
  model.traverse(o => { if (o instanceof THREE.Mesh) vertices += o.geometry.index?.count ?? o.geometry.getAttribute('position')?.count ?? 0; });
  if (!vertices) { disposeScan(model); throw new Error('O arquivo não contém uma malha com faces.'); }
  if (vertices / 3 > 2000000) { disposeScan(model); throw new Error('Malha muito densa. Simplifique para até 2 milhões de faces no app de scan.'); }
  return model;
}

export function normalizeScan(source: THREE.Object3D, heightCm: number, up: string, turn: number, unit: number) {
  const model = new THREE.Group();
  const object = source.clone(true);
  model.add(object);
  if (up === 'z') object.rotation.x = -Math.PI / 2;
  if (up === 'x') object.rotation.z = Math.PI / 2;
  model.rotation.y = turn * Math.PI / 180;
  model.updateMatrixWorld(true);
  const initial = new THREE.Box3().setFromObject(model);
  const originalHeightCm = initial.max.y - initial.min.y;
  const scale = scanScale(originalHeightCm * unit, heightCm);
  model.scale.setScalar(heightCm / originalHeightCm);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  model.updateMatrixWorld(true);
  const chunks: Float32Array[] = [];
  let count = 0;
  model.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const geometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geometry.applyMatrix4(o.matrixWorld);
    const position = geometry.getAttribute('position');
    const data = Float32Array.from(position.array); chunks.push(data); count += data.length;
    geometry.dispose();
  });
  const triangles = new Float32Array(count); let offset = 0;
  chunks.forEach(chunk => { triangles.set(chunk, offset); offset += chunk.length; });
  return { model, triangles, warning: scale.warning, originalHeightCm: originalHeightCm * unit };
}

export function disposeScan(model: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  model.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(m);
      Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); });
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}