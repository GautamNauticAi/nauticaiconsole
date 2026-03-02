"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense } from "react";

function HullMesh() {
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[0.9, 0.9, 3, 32]} />
        <meshStandardMaterial
          color="#38bdf8"
          metalness={0.4}
          roughness={0.25}
          emissive="#0ea5e9"
          emissiveIntensity={0.35}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.1, 0.02, 32, 160]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.015, 32, 160]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

export function HullOrbit() {
  return (
    <div className="relative h-[320px] w-full max-w-md overflow-hidden rounded-[32px] border border-slate-500/40 bg-black/40 shadow-[0_40px_120px_rgba(15,23,42,0.95)]">
      <Canvas camera={{ position: [4, 2, 5], fov: 40 }}>
        <color attach="background" args={["#020617"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 4, 2]} intensity={1.5} />
        <Suspense fallback={null}>
          <group rotation={[0.3, 0.2, 0]}>
            <HullMesh />
          </group>
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={0.7}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-center justify-between text-[11px] text-slate-300/80">
        <span className="rounded-full bg-emerald-500/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-200">
          Live hull surface
        </span>
        <span className="font-mono text-[10px] text-slate-400">
          Corrosion • Growth • Damage
        </span>
      </div>
    </div>
  );
}

