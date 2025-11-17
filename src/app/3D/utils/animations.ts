import * as THREE from 'three';
import { gsap } from 'gsap';

/**
 * Collects all materials from an object and its children
 */
export const collectMaterials = (object: THREE.Object3D): THREE.Material[] => {
  const materials: THREE.Material[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      if (Array.isArray(child.material)) {
        materials.push(...child.material);
      } else {
        materials.push(child.material);
      }
    }
  });
  return materials;
};

/**
 * Sets all materials in an object to transparent with 0 opacity
 */
export const setMaterialsTransparent = (object: THREE.Object3D): void => {
  object.traverse((child: any) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((m: any) => {
        m.transparent = true;
        m.opacity = 0;
      });
    }
  });
};

/**
 * Animates fade in effect on an object
 */
export const animateFadeIn = (object: THREE.Object3D, duration = 1.5): void => {
  const materials = collectMaterials(object);
  gsap.to(materials, {
    opacity: 1,
    duration,
    ease: 'power1.inOut'
  });
};

/**
 * Animates fade out effect on an object
 */
export const animateFadeOut = (object: THREE.Object3D, duration = 1.2): void => {
  const materials = collectMaterials(object);
  gsap.to(materials, {
    opacity: 0,
    duration,
    ease: 'power1.inOut'
  });
};

/**
 * Animates object rising from below ground
 */
export const animateRiseFromGround = (
  object: THREE.Object3D,
  originalY: number,
  duration = 1.5
): void => {
  object.position.y = originalY - 500;
  gsap.to(object.position, {
    y: originalY,
    duration,
    ease: 'power2.out'
  });
};

/**
 * Animates object sinking into ground
 */
export const animateSinkIntoGround = (
  object: THREE.Object3D,
  originalY: number,
  duration = 1.2,
  onComplete?: () => void
): void => {
  gsap.to(object.position, {
    y: originalY - 500,
    duration,
    ease: 'power2.in',
    onComplete
  });
};

/**
 * Combined animation: rise from ground + fade in
 */
export const animateAppear = (
  object: THREE.Object3D,
  originalY: number,
  duration = 1.5
): void => {
  setMaterialsTransparent(object);
  animateRiseFromGround(object, originalY, duration);
  animateFadeIn(object, duration);
};

/**
 * Combined animation: sink into ground + fade out
 */
export const animateDisappear = (
  object: THREE.Object3D,
  originalY: number,
  duration = 1.2,
  onComplete?: () => void
): void => {
  animateSinkIntoGround(object, originalY, duration, onComplete);
  animateFadeOut(object, duration);
};
