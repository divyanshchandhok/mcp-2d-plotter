import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimulationData } from '../sim/types';
import type { SimulationClock } from '../clock/useSimulationClock';

interface PenCarriageProps {
  simData: SimulationData;
  clock: SimulationClock;
  inkColor: string;
}

export function PenCarriage({ simData, clock, inkColor }: PenCarriageProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const penRef = useRef<THREE.Mesh>(null!);
  const penMatRef = useRef<THREE.MeshStandardMaterial>(null!);
  const ledMatRef = useRef<THREE.MeshBasicMaterial>(null!);

  useFrame(() => {
    const idx = Math.round(clock.tNowRef.current / simData.dt);
    const sample = simData.tape[Math.min(idx, simData.tape.length - 1)];
    if (!sample) return;
    const { bedWidth, bedHeight } = simData.config;
    
    // Position carriage block (X/Z coordinates)
    groupRef.current.position.x = sample.x - bedWidth / 2;
    groupRef.current.position.z = -(sample.y - bedHeight / 2);
    
    // Pen lift height: 0 on paper when down, 5mm up when raised.
    penRef.current.position.y = 30 + (sample.penDown ? 0 : 5);

    // Update pen cylinder color dynamically to match the current drawing color channel
    if (penMatRef.current) {
      const activeColor = sample.color || inkColor;
      penMatRef.current.color.setStyle(activeColor);
    }

    // Update glowing Status LED indicator color imperatively
    if (ledMatRef.current) {
      if (sample.penDown) {
        ledMatRef.current.color.setHex(0x00d4aa); // Drawing (Emerald)
      } else if (sample.feedrate > 10) {
        ledMatRef.current.color.setHex(0x38bdf8); // Rapid G0 Travel (Cyan)
      } else {
        ledMatRef.current.color.setHex(0xf59e0b); // Idle/Lift transition (Amber)
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Carriage block at gantry height */}
      <mesh position={[0, 60, 0]} castShadow receiveShadow>
        <boxGeometry args={[20, 8, 14]} />
        <meshStandardMaterial color="#2d3748" metalness={0.7} roughness={0.3} />
      </mesh>
      
      {/* Status LED Indicator lens */}
      <mesh position={[0, 65, 0]}>
        <sphereGeometry args={[1.6, 16, 16]} />
        <meshBasicMaterial ref={ledMatRef} color="#f59e0b" />
      </mesh>
      
      {/* Status LED Bezel mount */}
      <mesh position={[0, 64.2, 0]}>
        <cylinderGeometry args={[2.0, 2.2, 0.4, 16]} />
        <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Pen — cylinder from carriage to paper (colored with active inkColor) */}
      <mesh ref={penRef} position={[0, 30, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 1.5, 60, 8]} />
        <meshStandardMaterial ref={penMatRef} color={inkColor} metalness={0.4} roughness={0.6} />
      </mesh>
    </group>
  );
}
