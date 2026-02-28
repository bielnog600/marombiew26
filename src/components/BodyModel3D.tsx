import React, { useRef, useMemo, useState, Suspense, useCallback, ErrorInfo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { User, RotateCcw, Info } from 'lucide-react';

// ── Types ──
export interface BodyMeasurement {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  status: 'ok' | 'attention' | 'risk' | 'strength' | 'cardio' | 'core';
  history?: { date: string; value: number }[];
}

export interface BodyModel3DProps {
  measurements: BodyMeasurement[];
  defaultGender?: 'male' | 'female';
}

// ── Status colors ──
const STATUS_COLORS: Record<string, string> = {
  ok: '#22c55e',
  attention: '#f59e0b',
  risk: '#ef4444',
  strength: '#3b82f6',
  cardio: '#06b6d4',
  core: '#8b5cf6',
};

const STATUS_LABELS: Record<string, string> = {
  ok: 'Ok',
  attention: 'Atenção',
  risk: 'Risco elevado',
  strength: 'Força',
  cardio: 'Cardio',
  core: 'Core',
};

// ── GLB model paths ──
const MODEL_PATHS: Record<string, string> = {
  male: '/models/male-fitness.glb',
  female: '/models/female-fitness.glb',
};

// ── Model credits (CC-BY attribution) ──
export const MODEL_CREDITS = {
  male: {
    title: 'Sports Guy — Fitness Male Model',
    author: 'A definir',
    license: 'CC Attribution (CC BY 4.0)',
    url: '',
  },
  female: {
    title: 'Gym Girl — Fitness Female Model',
    author: 'A definir',
    license: 'CC Attribution (CC BY 4.0)',
    url: '',
  },
};

// ── Marker positions per gender ──
const MARKER_POSITIONS: Record<string, Record<string, [number, number, number]>> = {
  male: {
    pescoco: [0, 2.35, 0.18],
    ombro: [0.55, 2.05, 0.05],
    torax: [0, 1.7, 0.25],
    abdomen: [0, 1.15, 0.25],
    cintura: [0.48, 1.05, 0.05],
    quadril: [0.45, 0.7, 0.05],
    braco_direito: [0.72, 1.65, 0],
    braco_esquerdo: [-0.72, 1.65, 0],
    antebraco: [0.72, 1.05, 0],
    coxa_direita: [0.24, -0.05, 0.1],
    coxa_esquerda: [-0.24, -0.05, 0.1],
    panturrilha_direita: [0.24, -1.15, 0.1],
    panturrilha_esquerda: [-0.24, -1.15, 0.1],
  },
  female: {
    pescoco: [0, 2.25, 0.16],
    ombro: [0.48, 1.95, 0.05],
    torax: [0, 1.6, 0.25],
    abdomen: [0, 1.1, 0.25],
    cintura: [0.42, 1.0, 0.05],
    quadril: [0.48, 0.65, 0.05],
    braco_direito: [0.62, 1.55, 0],
    braco_esquerdo: [-0.62, 1.55, 0],
    antebraco: [0.62, 0.95, 0],
    coxa_direita: [0.22, -0.1, 0.1],
    coxa_esquerda: [-0.22, -0.1, 0.1],
    panturrilha_direita: [0.22, -1.15, 0.1],
    panturrilha_esquerda: [-0.22, -1.15, 0.1],
  },
};

// ── Camera presets ──
const CAMERA_PRESETS = {
  front: { position: new THREE.Vector3(0, 1.2, 4.5), target: new THREE.Vector3(0, 1, 0) },
  side: { position: new THREE.Vector3(4.5, 1.2, 0), target: new THREE.Vector3(0, 1, 0) },
  back: { position: new THREE.Vector3(0, 1.2, -4.5), target: new THREE.Vector3(0, 1, 0) },
};

// ── Smooth body part (procedural fallback) ──
const SmoothPart = ({ position, args, color, scale }: {
  position: [number, number, number];
  args: [number, number, number, number];
  color: string;
  scale?: [number, number, number];
}) => (
  <mesh position={position} scale={scale}>
    <capsuleGeometry args={args} />
    <meshStandardMaterial color={color} roughness={0.55} metalness={0.08} />
  </mesh>
);

// ── Interactive marker ──
const Marker = ({ position, measurement, onClick, isSelected }: {
  position: [number, number, number];
  measurement: BodyMeasurement;
  onClick: () => void;
  isSelected: boolean;
}) => {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const color = STATUS_COLORS[measurement.status];

  useFrame((state) => {
    if (meshRef.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.15;
      meshRef.current.scale.setScalar(isSelected ? 1.4 : hovered ? 1.2 : s);
    }
  });

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      >
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 1.2 : hovered ? 0.8 : 0.4}
          transparent
          opacity={0.9}
        />
      </mesh>
      {(hovered || isSelected) && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.08, 0.12, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}
      {hovered && !isSelected && (
        <Html distanceFactor={6} position={[0, 0.15, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="bg-background/95 border border-border rounded-lg px-3 py-2 shadow-xl min-w-[120px] backdrop-blur-sm">
            <p className="text-xs font-semibold text-foreground">{measurement.label}</p>
            <p className="text-sm font-bold" style={{ color }}>{measurement.value ?? '—'} {measurement.unit}</p>
            <p className="text-[10px] font-medium" style={{ color }}>{STATUS_LABELS[measurement.status]}</p>
          </div>
        </Html>
      )}
    </group>
  );
};

// ── Camera controller ──
const CameraController = ({ preset }: { preset: keyof typeof CAMERA_PRESETS | null }) => {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useFrame(() => {
    if (preset && controlsRef.current) {
      const target = CAMERA_PRESETS[preset];
      camera.position.lerp(target.position, 0.05);
      controlsRef.current.target.lerp(target.target, 0.05);
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableZoom={true}
      enablePan={false}
      minDistance={2.5}
      maxDistance={7}
      minPolarAngle={Math.PI / 6}
      maxPolarAngle={Math.PI / 1.3}
    />
  );
};

// ── GLB Model Loader ──
const GLBModel = ({ gender }: { gender: 'male' | 'female' }) => {
  const modelPath = MODEL_PATHS[gender];
  const { scene } = useGLTF(modelPath);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetHeight = 3.5;
    const scaleFactor = targetHeight / maxDim;
    clone.scale.setScalar(scaleFactor);
    clone.position.set(
      -center.x * scaleFactor,
      -box.min.y * scaleFactor - 0.5,
      -center.z * scaleFactor
    );
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) {
          mat.roughness = Math.max(mat.roughness, 0.3);
          mat.metalness = Math.min(mat.metalness, 0.15);
          mat.envMapIntensity = 0.5;
        }
      }
    });
    return clone;
  }, [scene]);

  return <primitive object={clonedScene} />;
};

// ── GLB error boundary ──
class GLBErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

// ── Procedural male body (fallback) ──
const MaleBody = () => {
  const bodyColor = '#3a3f4a';
  const skinColor = '#5a6275';
  return (
    <group position={[0, -0.5, 0]}>
      <mesh position={[0, 2.75, 0]}>
        <sphereGeometry args={[0.32, 24, 24]} />
        <meshStandardMaterial color={skinColor} roughness={0.45} />
      </mesh>
      <SmoothPart position={[0, 2.35, 0]} args={[0.1, 0.12, 12, 16]} color={skinColor} />
      <mesh position={[0, 1.75, 0]}>
        <capsuleGeometry args={[0.38, 0.5, 12, 24]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <capsuleGeometry args={[0.34, 0.4, 12, 24]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.05} />
      </mesh>
      <SmoothPart position={[0.48, 2.05, 0]} args={[0.12, 0.05, 12, 16]} color={bodyColor} />
      <SmoothPart position={[-0.48, 2.05, 0]} args={[0.12, 0.05, 12, 16]} color={bodyColor} />
      <mesh position={[0, 0.7, 0]}>
        <capsuleGeometry args={[0.36, 0.15, 12, 24]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} />
      </mesh>
      <SmoothPart position={[0.65, 1.7, 0]} args={[0.1, 0.3, 12, 16]} color={bodyColor} />
      <SmoothPart position={[0.65, 1.05, 0]} args={[0.08, 0.3, 12, 16]} color={bodyColor} />
      <SmoothPart position={[-0.65, 1.7, 0]} args={[0.1, 0.3, 12, 16]} color={bodyColor} />
      <SmoothPart position={[-0.65, 1.05, 0]} args={[0.08, 0.3, 12, 16]} color={bodyColor} />
      <SmoothPart position={[0.22, -0.05, 0]} args={[0.14, 0.5, 12, 16]} color={bodyColor} />
      <SmoothPart position={[0.22, -1.15, 0]} args={[0.1, 0.45, 12, 16]} color={bodyColor} />
      <SmoothPart position={[-0.22, -0.05, 0]} args={[0.14, 0.5, 12, 16]} color={bodyColor} />
      <SmoothPart position={[-0.22, -1.15, 0]} args={[0.1, 0.45, 12, 16]} color={bodyColor} />
      <mesh position={[0.22, -1.85, 0.08]}>
        <boxGeometry args={[0.16, 0.08, 0.28]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} />
      </mesh>
      <mesh position={[-0.22, -1.85, 0.08]}>
        <boxGeometry args={[0.16, 0.08, 0.28]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} />
      </mesh>
    </group>
  );
};

// ── Procedural female body (fallback) ──
const FemaleBody = () => {
  const bodyColor = '#3a3f4a';
  const skinColor = '#5a6275';
  return (
    <group position={[0, -0.5, 0]}>
      <mesh position={[0, 2.65, 0]}>
        <sphereGeometry args={[0.3, 24, 24]} />
        <meshStandardMaterial color={skinColor} roughness={0.45} />
      </mesh>
      <SmoothPart position={[0, 2.28, 0]} args={[0.08, 0.1, 12, 16]} color={skinColor} />
      <mesh position={[0, 1.7, 0]}>
        <capsuleGeometry args={[0.32, 0.45, 12, 24]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <capsuleGeometry args={[0.28, 0.35, 12, 24]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.05} />
      </mesh>
      <SmoothPart position={[0.4, 1.95, 0]} args={[0.1, 0.04, 12, 16]} color={bodyColor} />
      <SmoothPart position={[-0.4, 1.95, 0]} args={[0.1, 0.04, 12, 16]} color={bodyColor} />
      <mesh position={[0, 0.7, 0]}>
        <capsuleGeometry args={[0.38, 0.12, 12, 24]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} />
      </mesh>
      <SmoothPart position={[0.55, 1.6, 0]} args={[0.08, 0.28, 12, 16]} color={bodyColor} />
      <SmoothPart position={[0.55, 0.95, 0]} args={[0.065, 0.28, 12, 16]} color={bodyColor} />
      <SmoothPart position={[-0.55, 1.6, 0]} args={[0.08, 0.28, 12, 16]} color={bodyColor} />
      <SmoothPart position={[-0.55, 0.95, 0]} args={[0.065, 0.28, 12, 16]} color={bodyColor} />
      <SmoothPart position={[0.22, -0.1, 0]} args={[0.13, 0.48, 12, 16]} color={bodyColor} />
      <SmoothPart position={[0.22, -1.15, 0]} args={[0.09, 0.42, 12, 16]} color={bodyColor} />
      <SmoothPart position={[-0.22, -0.1, 0]} args={[0.13, 0.48, 12, 16]} color={bodyColor} />
      <SmoothPart position={[-0.22, -1.15, 0]} args={[0.09, 0.42, 12, 16]} color={bodyColor} />
      <mesh position={[0.22, -1.8, 0.06]}>
        <boxGeometry args={[0.14, 0.07, 0.24]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} />
      </mesh>
      <mesh position={[-0.22, -1.8, 0.06]}>
        <boxGeometry args={[0.14, 0.07, 0.24]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} />
      </mesh>
    </group>
  );
};

// ── Body renderer: tries GLB first, falls back to procedural ──
const BodyRenderer = ({ gender }: { gender: 'male' | 'female' }) => {
  const [useGlb, setUseGlb] = useState(true);
  const [glbChecked, setGlbChecked] = useState(false);

  // Check if GLB file exists
  React.useEffect(() => {
    const path = MODEL_PATHS[gender];
    fetch(path, { method: 'HEAD' })
      .then(res => {
        setUseGlb(res.ok);
        setGlbChecked(true);
      })
      .catch(() => {
        setUseGlb(false);
        setGlbChecked(true);
      });
  }, [gender]);

  const ProceduralFallback = gender === 'male' ? MaleBody : FemaleBody;

  if (!glbChecked || !useGlb) {
    return <ProceduralFallback />;
  }

  return (
    <GLBErrorBoundary fallback={<ProceduralFallback />}>
      <React.Suspense fallback={<ProceduralFallback />}>
        <GLBModel gender={gender} />
      </React.Suspense>
    </GLBErrorBoundary>
  );
};

// ── 3D Scene ──
const Scene = ({ gender, measurements, selectedKey, onSelectMarker, cameraPreset }: {
  gender: 'male' | 'female';
  measurements: BodyMeasurement[];
  selectedKey: string | null;
  onSelectMarker: (key: string | null) => void;
  cameraPreset: keyof typeof CAMERA_PRESETS | null;
}) => {
  const positions = MARKER_POSITIONS[gender];

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 6, 4]} intensity={0.7} />
      <directionalLight position={[-3, 4, -2]} intensity={0.25} />
      <pointLight position={[0, 3, 3]} intensity={0.3} color="#f59e0b" />

      <group onClick={() => onSelectMarker(null)}>
        <BodyRenderer gender={gender} />
      </group>

      {measurements.map((m) => {
        const pos = positions[m.key];
        if (!pos) return null;
        return (
          <Marker
            key={m.key}
            position={[pos[0], pos[1] - 0.5, pos[2]]}
            measurement={m}
            isSelected={selectedKey === m.key}
            onClick={() => onSelectMarker(selectedKey === m.key ? null : m.key)}
          />
        );
      })}

      <CameraController preset={cameraPreset} />
    </>
  );
};

// ── Fallback image ──
const FallbackView = () => (
  <div className="w-full h-[450px] rounded-lg bg-muted/20 flex items-center justify-center">
    <div className="text-center text-muted-foreground">
      <User className="w-16 h-16 mx-auto mb-2 opacity-40" />
      <p className="text-sm">Modelo 3D indisponível</p>
      <p className="text-xs">WebGL pode não ser suportado neste dispositivo.</p>
    </div>
  </div>
);

// ── Error boundary ──
class CanvasErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error('BodyModel3D error:', err, info); }
  render() { return this.state.hasError ? <FallbackView /> : this.props.children; }
}

// ── Detail panel ──
const DetailPanel = ({ measurement, onClose }: { measurement: BodyMeasurement; onClose: () => void }) => {
  const color = STATUS_COLORS[measurement.status];
  return (
    <div className="absolute top-2 right-2 w-56 bg-background/95 border border-border rounded-xl p-4 shadow-2xl backdrop-blur-sm z-10 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-foreground">{measurement.label}</h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold" style={{ color }}>{measurement.value ?? '—'}</span>
        <span className="text-xs text-muted-foreground">{measurement.unit}</span>
      </div>
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold mb-3" style={{ backgroundColor: `${color}20`, color }}>
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        {STATUS_LABELS[measurement.status]}
      </div>
      {measurement.history && measurement.history.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">Histórico</p>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {measurement.history.map((h, i) => (
              <div key={i} className="flex justify-between text-xs py-1 border-b border-border/30 last:border-0">
                <span className="text-muted-foreground">{h.date}</span>
                <span className="font-medium text-foreground">{h.value} {measurement.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Credits tooltip ──
const CreditsTooltip = ({ gender }: { gender: 'male' | 'female' }) => {
  const [open, setOpen] = useState(false);
  const credit = MODEL_CREDITS[gender];

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
      >
        <Info className="w-3 h-3" /> Créditos do modelo 3D
      </button>
      {open && (
        <div className="absolute bottom-6 left-0 bg-background/95 border border-border rounded-lg p-3 shadow-xl min-w-[220px] backdrop-blur-sm z-20 animate-fade-in">
          <p className="text-xs font-semibold text-foreground mb-1">{credit.title}</p>
          <p className="text-[10px] text-muted-foreground">Autor: {credit.author}</p>
          <p className="text-[10px] text-muted-foreground">Licença: {credit.license}</p>
          {credit.url && (
            <a href={credit.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">
              Ver original
            </a>
          )}
          <p className="text-[10px] text-muted-foreground mt-2 italic">
            Quando nenhum modelo GLB estiver disponível, é usado um mannequin procedural (sem atribuição necessária).
          </p>
        </div>
      )}
    </div>
  );
};

// ── Main component ──
const BodyModel3D: React.FC<BodyModel3DProps> = ({ measurements, defaultGender = 'male' }) => {
  const [gender, setGender] = useState<'male' | 'female'>(defaultGender);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [cameraPreset, setCameraPreset] = useState<keyof typeof CAMERA_PRESETS | null>('front');

  const selectedMeasurement = useMemo(
    () => measurements.find(m => m.key === selectedKey) ?? null,
    [measurements, selectedKey]
  );

  const handleCameraPreset = useCallback((preset: keyof typeof CAMERA_PRESETS) => {
    setCameraPreset(preset);
    setTimeout(() => setCameraPreset(null), 1500);
  }, []);

  return (
    <div className="relative w-full">
      {/* Controls */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
          <button
            onClick={() => setGender('male')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${gender === 'male' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Homem
          </button>
          <button
            onClick={() => setGender('female')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${gender === 'female' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Mulher
          </button>
        </div>
        <div className="flex items-center gap-1">
          {(['front', 'side', 'back'] as const).map((p) => (
            <Button key={p} variant="outline" size="sm" className="text-xs h-7 px-2.5" onClick={() => handleCameraPreset(p)}>
              {p === 'front' ? 'Frente' : p === 'side' ? 'Lado' : 'Costas'}
            </Button>
          ))}
          <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => handleCameraPreset('front')}>
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="relative rounded-lg overflow-hidden bg-background/30 border border-border/30">
        <CanvasErrorBoundary>
          <Suspense fallback={
            <div className="w-full h-[450px] flex items-center justify-center">
              <Skeleton className="w-32 h-64 rounded-full" />
            </div>
          }>
            <div className="w-full h-[450px]">
              <Canvas camera={{ position: [0, 1.2, 4.5], fov: 38 }} dpr={[1, 2]}>
                <Scene
                  gender={gender}
                  measurements={measurements}
                  selectedKey={selectedKey}
                  onSelectMarker={setSelectedKey}
                  cameraPreset={cameraPreset}
                />
              </Canvas>
            </div>
          </Suspense>
        </CanvasErrorBoundary>

        {selectedMeasurement && (
          <DetailPanel measurement={selectedMeasurement} onClose={() => setSelectedKey(null)} />
        )}
      </div>

      {/* Legend + Credits */}
      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.risk }} /> Risco elevado</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.attention }} /> Atenção</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.ok }} /> Ok</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.strength }} /> Força</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.cardio }} /> Cardio</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.core }} /> Core</span>
        </div>
        <CreditsTooltip gender={gender} />
      </div>
    </div>
  );
};

export default BodyModel3D;
