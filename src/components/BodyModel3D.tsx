import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

interface BodyHighlight {
  area: string;
  label: string;
  color: string;
  position: [number, number, number];
}

interface BodyModel3DProps {
  highlights: BodyHighlight[];
}

const BodyPart = ({ position, scale, color }: { position: [number, number, number]; scale: [number, number, number]; color: string }) => (
  <mesh position={position}>
    <capsuleGeometry args={[scale[0], scale[1], 8, 16]} />
    <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
  </mesh>
);

const HumanBody = ({ highlights }: { highlights: BodyHighlight[] }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.3;
    }
  });

  const bodyColor = '#4a5568';
  const skinColor = '#8b9cb5';

  const highlightMap = useMemo(() => {
    const map: Record<string, string> = {};
    highlights.forEach(h => { map[h.area] = h.color; });
    return map;
  }, [highlights]);

  const getColor = (area: string) => highlightMap[area] || bodyColor;

  return (
    <group ref={groupRef} position={[0, -0.5, 0]}>
      {/* Head */}
      <mesh position={[0, 2.8, 0]}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color={skinColor} roughness={0.5} />
      </mesh>

      {/* Neck */}
      <BodyPart position={[0, 2.35, 0]} scale={[0.12, 0.15, 0.12]} color={getColor('pescoco')} />

      {/* Torso */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[0.9, 1.4, 0.45]} />
        <meshStandardMaterial color={getColor('torax')} roughness={0.6} />
      </mesh>

      {/* Abdomen highlight overlay */}
      <mesh position={[0, 1.0, 0.23]}>
        <boxGeometry args={[0.7, 0.5, 0.02]} />
        <meshStandardMaterial color={getColor('abdomen')} transparent opacity={0.8} roughness={0.5} />
      </mesh>

      {/* Waist indicator */}
      <mesh position={[0, 1.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.46, 0.03, 8, 32]} />
        <meshStandardMaterial color={getColor('cintura')} />
      </mesh>

      {/* Hip area */}
      <mesh position={[0, 0.65, 0]}>
        <boxGeometry args={[0.85, 0.3, 0.4]} />
        <meshStandardMaterial color={getColor('quadril')} roughness={0.6} />
      </mesh>

      {/* Right arm */}
      <BodyPart position={[0.65, 1.7, 0]} scale={[0.13, 0.35, 0.13]} color={getColor('braco_direito')} />
      {/* Right forearm */}
      <BodyPart position={[0.65, 0.95, 0]} scale={[0.1, 0.35, 0.1]} color={getColor('antebraco')} />

      {/* Left arm */}
      <BodyPart position={[-0.65, 1.7, 0]} scale={[0.13, 0.35, 0.13]} color={getColor('braco_esquerdo')} />
      {/* Left forearm */}
      <BodyPart position={[-0.65, 0.95, 0]} scale={[0.1, 0.35, 0.1]} color={getColor('antebraco_esquerdo')} />

      {/* Right thigh */}
      <BodyPart position={[0.22, -0.1, 0]} scale={[0.16, 0.55, 0.16]} color={getColor('coxa_direita')} />
      {/* Right calf */}
      <BodyPart position={[0.22, -1.25, 0]} scale={[0.12, 0.5, 0.12]} color={getColor('panturrilha_direita')} />

      {/* Left thigh */}
      <BodyPart position={[-0.22, -0.1, 0]} scale={[0.16, 0.55, 0.16]} color={getColor('coxa_esquerda')} />
      {/* Left calf */}
      <BodyPart position={[-0.22, -1.25, 0]} scale={[0.12, 0.5, 0.12]} color={getColor('panturrilha_esquerda')} />

      {/* Highlight labels */}
      {highlights.map((h, i) => (
        <Text
          key={i}
          position={[h.position[0] > 0 ? h.position[0] + 0.6 : h.position[0] - 0.6, h.position[1], h.position[2] + 0.3]}
          fontSize={0.12}
          color={h.color}
          anchorX={h.position[0] > 0 ? 'left' : 'right'}
          anchorY="middle"
        >
          {h.label}
        </Text>
      ))}
    </group>
  );
};

const BodyModel3D: React.FC<BodyModel3DProps> = ({ highlights }) => {
  return (
    <div className="w-full h-[400px] rounded-lg overflow-hidden bg-background/50">
      <Canvas camera={{ position: [0, 1, 5], fov: 40 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <directionalLight position={[-3, 3, -3]} intensity={0.3} />
        <HumanBody highlights={highlights} />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.5}
        />
      </Canvas>
    </div>
  );
};

export default BodyModel3D;
