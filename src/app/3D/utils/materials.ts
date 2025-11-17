import * as THREE from 'three';

/**
 * Updates material properties (color, emissive) for an object and its children
 */
export const updateMaterialProperties = (
  object: THREE.Object3D,
  customColor: THREE.Color,
  emissiveColor: THREE.Color,
  emissiveIntensity: number
): void => {
  object.traverse((child: any) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat: any) => {
        if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
          mat.color.copy(customColor);
          mat.emissive.copy(emissiveColor);
          mat.emissiveIntensity = emissiveIntensity;
          mat.needsUpdate = true;
        } else if (mat.isMeshBasicMaterial) {
          mat.color.copy(customColor);
          mat.needsUpdate = true;
        } else if (mat.isMeshLambertMaterial) {
          mat.color.copy(customColor);
          mat.emissive.copy(emissiveColor);
          mat.needsUpdate = true;
        }
      });
    }
  });
};

/**
 * Calculates distance between two mercator points
 */
export const getDistanceBetweenMercatorPoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
};
