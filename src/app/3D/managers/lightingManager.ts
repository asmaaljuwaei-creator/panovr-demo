import * as THREE from 'three';

export interface LightingSettings {
  ambientIntensity: number;
  directionalIntensity: number;
  emissiveIntensity: number;
  materialColor: string;
  emissiveColor: string;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  elevation: number; // degrees
  azimuth: number;   // degrees
}

export type LightingManager = ReturnType<typeof createLightingManager>;

export function createLightingManager(scene: THREE.Scene) {
  const LIGHTS = {
    ambient: 'MainAmbientLight',
    directional: 'MainDirectionalLight',
    fill: 'FillLight'
  } as const;

  function ensureLights() {
    if (!scene.getObjectByName(LIGHTS.ambient)) {
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      ambientLight.name = LIGHTS.ambient;
      scene.add(ambientLight);
    }

    if (!scene.getObjectByName(LIGHTS.directional)) {
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.35);
      directionalLight.position.set(100000, 100000, 100000);
      directionalLight.name = LIGHTS.directional;
      directionalLight.castShadow = false;
      scene.add(directionalLight);
    }

    if (!scene.getObjectByName(LIGHTS.fill)) {
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.15);
      fillLight.position.set(-1000, 500, -1000);
      fillLight.name = LIGHTS.fill;
      fillLight.castShadow = false;
      scene.add(fillLight);
    }
  }

  function update(settings: LightingSettings) {
    const ambient = scene.getObjectByName(LIGHTS.ambient) as THREE.AmbientLight | null;
    if (ambient) ambient.intensity = settings.ambientIntensity;

    const directional = scene.getObjectByName(LIGHTS.directional) as THREE.DirectionalLight | null;
    if (directional) directional.intensity = settings.directionalIntensity;

    const fill = scene.getObjectByName(LIGHTS.fill) as THREE.DirectionalLight | null;
    if (fill) fill.intensity = 0.15; // constant fill per current visuals
  }

  function dispose() {
    const names = Object.values(LIGHTS);
    for (const name of names) {
      const obj = scene.getObjectByName(name) as THREE.Light | undefined;
      if (obj) {
        scene.remove(obj);
        // three lights have no geometry/material to dispose; GC will collect
      }
    }
  }

  return { ensureLights, update, dispose };
}
