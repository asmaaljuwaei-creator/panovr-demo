import { useCallback } from 'react';
import * as THREE from 'three';
import { updateMaterialProperties } from '../utils/materials';

interface LightingSettings {
  ambientIntensity: number;
  directionalIntensity: number;
  emissiveIntensity: number;
  materialColor: string;
  emissiveColor: string;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  elevation: number;
  azimuth: number;
}

interface LightingManagerOptions {
  threeRefs: React.MutableRefObject<any>;
  cityTileManagersRef: React.MutableRefObject<Map<string, any>>;
  lightingSettings: LightingSettings;
}

/**
 * Hook for managing scene lighting and material updates
 */
export const useLightingManager = ({
  threeRefs,
  cityTileManagersRef,
  lightingSettings
}: LightingManagerOptions) => {

  /**
   * Update all lighting in the scene (lights, sky, materials)
   */
  const updateLighting = useCallback(() => {
    if (!threeRefs.current) return;

    const { scene, tileGroup } = threeRefs.current;

    // Update ambient light
    const ambientLight = scene.getObjectByName('MainAmbientLight') as THREE.AmbientLight;
    if (ambientLight) {
      ambientLight.intensity = lightingSettings.ambientIntensity;
    }

    // Update directional light
    const directionalLight = scene.getObjectByName('MainDirectionalLight') as THREE.DirectionalLight;
    if (directionalLight) {
      directionalLight.intensity = lightingSettings.directionalIntensity;
    }

    // Update fill light
    const fillLight = scene.getObjectByName('FillLight') as THREE.DirectionalLight;
    if (fillLight) {
      fillLight.intensity = 0.15;
    }

    // Update sky
    const sky = scene.children.find((child: any) => child.userData?.isSky) as any;
    if (sky && sky.material && sky.material.uniforms) {
      const skyUniforms = sky.material.uniforms;
      skyUniforms['turbidity'].value = lightingSettings.turbidity;
      skyUniforms['rayleigh'].value = lightingSettings.rayleigh;
      skyUniforms['mieCoefficient'].value = lightingSettings.mieCoefficient;
      skyUniforms['mieDirectionalG'].value = lightingSettings.mieDirectionalG;

      const sun = new THREE.Vector3();
      const phi = THREE.MathUtils.degToRad(90 - lightingSettings.elevation);
      const theta = THREE.MathUtils.degToRad(lightingSettings.azimuth);
      sun.setFromSphericalCoords(1, phi, theta);
      skyUniforms['sunPosition'].value.copy(sun);

      // Regenerate environment map
      if (threeRefs.current?.renderer) {
        try {
          const pmremGenerator = new THREE.PMREMGenerator(threeRefs.current.renderer);
          pmremGenerator.compileEquirectangularShader();

          const renderTarget = pmremGenerator.fromScene(scene, 0.04);
          scene.environment = renderTarget.texture;

          pmremGenerator.dispose();
        } catch (error) {
          console.error('Failed to regenerate environment map:', error);
        }
      }
    }

    // Update materials
    const customColor = new THREE.Color(lightingSettings.materialColor);
    const emissiveColor = new THREE.Color(lightingSettings.emissiveColor).multiplyScalar(0.2);

    for (const [cityId, manager] of cityTileManagersRef.current) {
      if (manager && manager.tiles) {
        for (const [filename, tile] of manager.tiles) {
          if (tile.loaded && tile.scene) {
            const isGLBTileMaterial = tile.scene.userData?.fromGLBManager || filename.includes('.glb');
            if (isGLBTileMaterial) {
              updateMaterialProperties(tile.scene, customColor, emissiveColor, lightingSettings.emissiveIntensity);
            }
          }
        }
      }
    }

    tileGroup.traverse((child: any) => {
      if (child.userData?.fromGLBManager) {
        updateMaterialProperties(child, customColor, emissiveColor, lightingSettings.emissiveIntensity);
      }
    });
  }, [threeRefs, cityTileManagersRef, lightingSettings]);

  return {
    updateLighting
  };
};
