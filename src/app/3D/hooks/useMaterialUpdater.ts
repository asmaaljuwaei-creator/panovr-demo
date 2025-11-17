import { useCallback } from 'react';
import * as THREE from 'three';
import { updateMaterialProperties } from '../utils/materials';

interface MaterialUpdaterOptions {
  threeRefs: React.MutableRefObject<any>;
  cityTileManagersRef: React.MutableRefObject<Map<string, any>>;
  lightingSettings: {
    materialColor: string;
    emissiveColor: string;
    emissiveIntensity: number;
  };
}

/**
 * Hook for updating material colors across all tiles
 */
export const useMaterialUpdater = ({
  threeRefs,
  cityTileManagersRef,
  lightingSettings
}: MaterialUpdaterOptions) => {
  
  /**
   * Update material colors for all city tiles and GLB objects
   */
  const updateMaterialColors = useCallback((): void => {
    if (!threeRefs.current) return;

    const { tileGroup } = threeRefs.current;
    const customColor = new THREE.Color(lightingSettings.materialColor);
    const emissiveColor = new THREE.Color(lightingSettings.emissiveColor).multiplyScalar(0.2);

    // Update city tile materials
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

    // Update tileGroup materials
    tileGroup.traverse((child: any) => {
      if (child.userData?.fromGLBManager) {
        updateMaterialProperties(child, customColor, emissiveColor, lightingSettings.emissiveIntensity);
      }
    });
  }, [
    threeRefs,
    cityTileManagersRef,
    lightingSettings.materialColor,
    lightingSettings.emissiveColor,
    lightingSettings.emissiveIntensity
  ]);

  return {
    updateMaterialColors
  };
};
