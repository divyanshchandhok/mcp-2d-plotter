import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimulationData } from '../sim/types';
import type { SimulationClock } from '../clock/useSimulationClock';

interface PlotterFrameProps {
  simData: SimulationData;
  clock: SimulationClock;
  bedWidth: number;
  bedHeight: number;
}

export function PlotterFrame({
  simData,
  clock,
  bedWidth,
  bedHeight,
}: PlotterFrameProps) {
  const gantryRef = useRef<THREE.Mesh>(null!);
  const halfW = bedWidth / 2;
  const halfH = bedHeight / 2;
  const railThickness = 6;
  const postHeight = 60;

  useFrame(() => {
    const idx = Math.round(clock.tNowRef.current / simData.dt);
    const sample = simData.tape[Math.min(idx, simData.tape.length - 1)];
    if (!sample || !gantryRef.current) return;
    gantryRef.current.position.z = -(sample.y - halfH);
  });

  const postPositions: [number, number, number][] = [
    [-halfW, 0, -halfH],
    [halfW, 0, -halfH],
    [-halfW, 0, halfH],
    [halfW, 0, halfH],
  ];

  return (
    <group>
      {/* Powder-coated solid bed plate underneath the paper */}
      <mesh position={[0, -4, 0]} receiveShadow>
        <boxGeometry args={[bedWidth + 20, 4, bedHeight + 20]} />
        <meshStandardMaterial color="#08080c" metalness={0.9} roughness={0.15} />
      </mesh>

      {/* Grid overlay for calibration lines on the bed */}
      <gridHelper 
        args={[Math.max(bedWidth, bedHeight), 20, '#1c1c28', '#11111a']} 
        position={[0, -1.95, 0]} 
      />

      {/* Four corner posts */}
      {postPositions.map(([x, _y, z], i) => (
        <mesh key={`post-${i}`} position={[x, postHeight / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[railThickness, postHeight, railThickness]} />
          {/* Anodized carbon fiber / dark metal look */}
          <meshStandardMaterial color="#1e1e24" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}

      {/* Front rail (along X) */}
      <mesh position={[0, postHeight, -halfH]} castShadow receiveShadow>
        <boxGeometry args={[bedWidth, railThickness, railThickness]} />
        {/* Polished steel look */}
        <meshStandardMaterial color="#cfd8dc" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Back rail (along X) */}
      <mesh position={[0, postHeight, halfH]} castShadow receiveShadow>
        <boxGeometry args={[bedWidth, railThickness, railThickness]} />
        <meshStandardMaterial color="#cfd8dc" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Left rail (along Z) */}
      <mesh position={[-halfW, postHeight, 0]} castShadow receiveShadow>
        <boxGeometry args={[railThickness, railThickness, bedHeight]} />
        <meshStandardMaterial color="#cfd8dc" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Right rail (along Z) */}
      <mesh position={[halfW, postHeight, 0]} castShadow receiveShadow>
        <boxGeometry args={[railThickness, railThickness, bedHeight]} />
        <meshStandardMaterial color="#cfd8dc" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Gantry bar — moves in Z */}
      <mesh ref={gantryRef} position={[0, postHeight, 0]} castShadow receiveShadow>
        <boxGeometry
          args={[bedWidth + railThickness * 2, railThickness * 0.8, railThickness * 0.8]}
        />
        {/* Anodized graphite aluminum */}
        <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.4} />
      </mesh>
    </group>
  );
}
