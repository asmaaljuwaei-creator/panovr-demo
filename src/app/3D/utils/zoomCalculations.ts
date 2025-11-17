import { MAP_SIZE_METERS } from './geoUtils';

/**
 * Converts zoom level to camera height
 */
export const zoomToCameraHeight = (zoom: number): number => {
  const tileSize = MAP_SIZE_METERS / Math.pow(2, zoom);
  return tileSize * 2;
};

/**
 * Converts camera height to zoom level
 */
export const cameraHeightToZoom = (height: number): number => {
  const tileSize = height / 2;
  return Math.log2(MAP_SIZE_METERS / tileSize);
};

/**
 * Calculates zoom from camera distance to target
 */
export const calculateZoomFromDistance = (distanceToTarget: number): number => {
  const breakPoint = 280000;
  
  if (distanceToTarget > breakPoint) {
    const scaledDistance = Math.pow(distanceToTarget, 0.95);
    return Math.log(MAP_SIZE_METERS / scaledDistance) / Math.log(2);
  } else {
    const scaledDistance = Math.pow(distanceToTarget, 0.85);
    return Math.log(MAP_SIZE_METERS / scaledDistance) / Math.log(2);
  }
};

/**
 * Zoom level constraints
 */
export const ZOOM_CONSTANTS = {
  MIN_ZOOM: 0,
  MAX_ZOOM: 19,
  INITIAL_MIN_ZOOM: 7,
  ZOOM_THRESHOLD: 0.1
} as const;
