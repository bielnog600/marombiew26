import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { SCAN_CUTS, type ScanMeasurements } from '@/lib/assessment3dGeometry';
import { disposeScan, loadScanModel, normalizeScan } from './scanModel';

export type CaptureScan = () => Promise<{ front: string; side: string; back: string }>;
interface Props {
  bytes: ArrayBuffer; format: string; height: number; up: string; turn: number; unit: number;
  settings: ScanMeasurements; onMeasured: (m: ScanMeasurements, originalHeight: number, warning: boolean) => void;
  captureRef: React.MutableRefObject<CaptureScan | null>; onError: (message: string) => void;
}

function Capture({ captureRef, height, model }: { captureRef: Props['captureRef']; height: number; model: THREE.Object3D }) {
  const { gl, scene, camera, invalidate } = useThree();
  useEffect(() => {
    captureRef.current = async () => {
      const background = scene.background;
      const rings: THREE.Object3D[] = [];
      scene.traverse(o => { if (o.name === 'measurement-ring') { rings.push(o); o.visible = false; } });
      const neutral = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim();
      scene.background = new THREE.Color(`hsl(${neutral.replace(/\s+/g, ',')})`);
      const aspect = gl.domElement.width / gl.domElement.height;
      const extent = Math.max(height * 0.6, new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x / aspect * 0.6);
      const ortho = new THREE.OrthographicCamera(-extent * aspect, extent * aspect, extent, -extent, 0.1, height * 10);
      const images: Record<string, string> = {};
      try {
        for (const [key, x, z] of [['front', 0, 3], ['side', -3, 0], ['back', 0, -3]] as const) {
          ortho.position.set(x * height, height / 2, z * height); ortho.lookAt(0, height / 2, 0); ortho.updateProjectionMatrix();
          gl.render(scene, ortho); images[key] = gl.domElement.toDataURL('image/jpeg', 0.85);
        }
      } finally { scene.background = background; rings.forEach(o => { o.visible = true; }); gl.render(scene, camera); invalidate(); }
      return { front: images.front, side: images.side, back: images.back };
    };
    return () => { captureRef.current = null; };
  }, [captureRef, gl, scene, camera, height, model, invalidate]);
  return null;
}

function FrameModel({ height, model }: { height: number; model: THREE.Object3D }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const bounds = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const distance = Math.max(height, bounds.x / (size.width / size.height)) / (2 * Math.tan(camera.fov * Math.PI / 360)) * 1.2;
    camera.position.set(0, height / 2, distance); camera.lookAt(0, height / 2, 0); camera.updateProjectionMatrix(); invalidate();
  }, [camera, size, height, model, invalidate]);
  return null;
}

export default function ScanViewer(props: Props) {
  const [source, setSource] = useState<THREE.Object3D | null>(null);
  const [measured, setMeasured] = useState<ScanMeasurements>({});
  const workerRef = useRef<Worker | null>(null), request = useRef(0);
  const callbacks = useRef(props); callbacks.current = props;
  const [palette] = useState(() => {
    const css = getComputedStyle(document.documentElement);
    const color = (key: string) => `hsl(${css.getPropertyValue(key).trim().replace(/\s+/g, ',')})`;
    return { background: color('--muted'), surface: color('--muted-foreground'), ring: [color('--primary'), color('--chart-2'), color('--chart-3'), color('--chart-5')] };
  });
  useEffect(() => {
    let cancelled = false, loaded: THREE.Object3D | null = null;
    loadScanModel(props.bytes, props.format).then(model => { loaded = model; if (!cancelled) setSource(model); else disposeScan(model); }).catch(e => { if (!cancelled) callbacks.current.onError(e.message); });
    return () => { cancelled = true; if (loaded) disposeScan(loaded); };
  }, [props.bytes, props.format]);
  const normalized = useMemo(() => source ? normalizeScan(source, props.height, props.up, props.turn, props.unit) : null, [source, props.height, props.up, props.turn, props.unit]);
  useEffect(() => {
    const worker = new Worker(new URL('./measure.worker.ts', import.meta.url), { type: 'module' }); workerRef.current = worker;
    worker.onerror = () => callbacks.current.onError('Não foi possível calcular os cortes do scan.');
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);
  useEffect(() => {
    const worker = workerRef.current; if (!normalized || !worker) return;
    const id = ++request.current;
    worker.onmessage = event => {
      if (event.data.requestId !== request.current) return;
      if (event.data.error) { callbacks.current.onError(event.data.error); return; }
      setMeasured(event.data.measurements);
      callbacks.current.onMeasured(event.data.measurements, normalized.originalHeightCm, normalized.warning);
    };
    worker.postMessage({ triangles: normalized.triangles, height: props.height, settings: props.settings, requestId: id });
  }, [normalized, props.height, props.settings]);
  if (!normalized) return <p className="p-8 text-center text-muted-foreground" role="status">Carregando modelo 3D…</p>;
  const size = new THREE.Box3().setFromObject(normalized.model).getSize(new THREE.Vector3());
  const distance = Math.max(props.height, size.x) * 1.8;
  return <div className="h-[420px] w-full overflow-hidden bg-muted sm:h-[480px]" aria-label="Visualizador do scan 3D">
    <Canvas key={`${props.height}-${props.up}-${props.turn}`} dpr={[1, 1.5]} frameloop="demand" gl={{ preserveDrawingBuffer: true }} camera={{ position: [0, props.height / 2, distance], near: 0.1, far: distance * 10, fov: 42 }}>
      <color attach="background" args={[palette.background]} />
      <ambientLight intensity={1.1} /><directionalLight position={[distance, distance, distance]} intensity={2} />
      <Environment resolution={64}><Lightformer intensity={2} position={[0, props.height, props.height]} scale={[props.height, props.height, 1]} /></Environment>
      <primitive object={normalized.model} />
      <gridHelper args={[props.height * 1.5, 12, palette.surface, palette.surface]} position={[0, -0.1, 0]} />
      {SCAN_CUTS.map((cut, i) => {
        const m = measured[cut.key]; if (!m?.hull?.length) return null;
        return <Line key={cut.key} name="measurement-ring" points={[...m.hull, m.hull[0]].map(p => [p[0], props.height * m.percent / 100, p[1]])} color={palette.ring[i % palette.ring.length]} lineWidth={2} depthTest={false} />;
      })}
      <OrbitControls target={[0, props.height / 2, 0]} minDistance={props.height * 0.3} maxDistance={distance * 3} />
      <Capture captureRef={props.captureRef} height={props.height} model={normalized.model} />
      <FrameModel height={props.height} model={normalized.model} />
    </Canvas>
  </div>;
}