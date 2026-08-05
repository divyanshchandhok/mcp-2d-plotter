import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { SimulationData } from '../sim/types';
import type { SimulationClock } from '../clock/useSimulationClock';
import { PlotterFrame } from './PlotterFrame';
import { Paper } from './Paper';
import { PenCarriage } from './PenCarriage';

interface PlotterSceneProps {
  simData: SimulationData;
  clock: SimulationClock;
  inkColor: string;
  showFullPreview: boolean;
  showcaseMode: boolean;
}

export function PlotterScene({
  simData,
  clock,
  inkColor,
  showFullPreview,
  showcaseMode,
}: PlotterSceneProps) {
  const { bedWidth, bedHeight } = simData.config;

  return (
    <Canvas
      shadows="percentage"
      camera={{ position: [0, 180, 220], fov: 45 }}
      style={{ background: '#05050f', width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#05050f']} />
      
      {/* Brighter lighting in showcase mode for a gallery look */}
      <ambientLight intensity={showcaseMode ? 0.8 : 0.5} />
      
      <directionalLight
        position={[80, 180, 80]}
        intensity={showcaseMode ? 1.4 : 1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={500}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-bias={-0.0015}
      />
      
      <directionalLight
        position={[-80, 80, -80]}
        intensity={showcaseMode ? 0.4 : 0.3}
      />

      <OrbitControls 
        enableRotate 
        enableZoom 
        enablePan
        maxPolarAngle={Math.PI / 2.1}
        minDistance={50}
        maxDistance={400}
      />
      
      {/* Conditionally render mechanical frame jig */}
      {!showcaseMode && (
        <PlotterFrame
          simData={simData}
          clock={clock}
          bedWidth={bedWidth}
          bedHeight={bedHeight}
        />
      )}
      
      {/* Paper canvas - draws final completed path when showcaseMode is active */}
      <Paper 
        simData={simData} 
        clock={clock} 
        inkColor={inkColor} 
        showFullPreview={showFullPreview || showcaseMode} 
      />
      
      {/* Conditionally render pen carriage */}
      {!showcaseMode && (
        <PenCarriage 
          simData={simData} 
          clock={clock} 
          inkColor={inkColor} 
        />
      )}
    </Canvas>
  );
}
