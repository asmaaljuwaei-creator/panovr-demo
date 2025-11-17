import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Controls 3D tile visibility based on camera distance
 */
export const control3DTilesVisibility = (
  camera: THREE.Camera,
  tileGroup: THREE.Group,
  controls: OrbitControls,
  activeCityManager: any | null
) => {
  const cameraDistance = camera.position.distanceTo(controls.target);

  // Update active city manager tiles
  if (activeCityManager) {
    if (cameraDistance > 1000) {
      const tiles = activeCityManager.tiles;
      for (const [filename, tile] of tiles) {
        if (tile.loaded && tile.scene) {
          tile.scene.visible = false;
          tile.visible = false;
        }
      }
    } else {
      activeCityManager.updateTileVisibility(camera.position, cameraDistance);
    }
  }

  // Control GLB tile visibility
  const shouldShow = cameraDistance <= 3500;
  for (const child of tileGroup.children) {
    if (child.userData?.isGLBTile) {
      child.visible = shouldShow;
    }
  }
};

/**
 * Collects all buildings from a container recursively
 */
export const collectBuildings = (container: THREE.Object3D): THREE.Object3D[] => {
  const buildings: THREE.Object3D[] = [];
  
  const collect = (obj: THREE.Object3D) => {
    if (obj.userData?.buildingName && !obj.userData?.isGLBTile && !obj.userData?.fromGLBManager) {
      buildings.push(obj);
    }
    obj.children.forEach(collect);
  };
  
  collect(container);
  return buildings;
};

/**
 * Calculates 2D distance between camera and building (ignoring Y axis)
 */
export const getHorizontalDistance = (pos1: THREE.Vector3, pos2: THREE.Vector3): number => {
  const dx = pos1.x - pos2.x;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dz * dz);
};

/**
 * Visibility thresholds and constants
 */
export const VISIBILITY_CONSTANTS = {
  MAX_3D_TILE_CAMERA_DISTANCE: 50000,
  TILE_HIDE_THRESHOLD: 3500,
  TILE_SHOW_THRESHOLD: 1000,
  CAMERA_HEIGHT_THRESHOLD: 7500,
  BUILDING_SHOW_DISTANCE: 8000,
  BUILDING_HIDE_DISTANCE: 10000,
  CAMERA_MOVEMENT_THRESHOLD: 100,
  CHECK_INTERVAL_MS: 200
} as const;
