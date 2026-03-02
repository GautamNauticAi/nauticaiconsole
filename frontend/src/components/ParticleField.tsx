"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import * as THREE from "three";

function Particles() {
  const pointsRef = useRef<THREE.Points>(null!);
  const COUNT = 160;

  const { geometry, velocities } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
      velocities[i * 3]     = (Math.random() - 0.5) * 0.004;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.003;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geometry: geo, velocities };
  }, []);

  useFrame(() => {
    const pos = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3]     += velocities[i * 3];
      pos[i * 3 + 1] += velocities[i * 3 + 1];
      if (pos[i * 3] >  12) pos[i * 3] = -12;
      if (pos[i * 3] < -12) pos[i * 3] =  12;
      if (pos[i * 3 + 1] >  7) pos[i * 3 + 1] = -7;
      if (pos[i * 3 + 1] < -7) pos[i * 3 + 1] =  7;
    }
    geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.05}
        color="#d4bbff"
        transparent
        opacity={0.45}
        sizeAttenuation
      />
    </points>
  );
}

export function ParticleField() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      zIndex: 1, pointerEvents: "none",
    }}>
      <Canvas
        camera={{ position: [0, 0, 9], fov: 72 }}
        gl={{ alpha: true, antialias: false }}
        style={{ background: "transparent", width: "100%", height: "100%" }}
      >
        <Particles />
      </Canvas>
    </div>
  );
}
