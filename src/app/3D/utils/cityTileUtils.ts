import * as THREE from 'three';
import { latLonToMercator } from './geoUtils';
import { getDistanceBetweenMercatorPoints } from './materials';

export interface CityConfig {
  id: string;
  name: string;
  tilesetPath: string;
  anchorLatLon: { lat: number; lon: number };
  loadDistance: number;
  enabled: boolean;
}

interface CitiesConfigJSON {
  cities: CityConfig[];
}

/**
 * Find the nearest city to the camera position
 */
export const findNearestCity = (
  cameraMercatorX: number,
  cameraMercatorY: number,
  cityConfigs: CityConfig[]
): CityConfig | null => {
  let nearestCity: CityConfig | null = null;
  let minDistance = Infinity;

  for (const city of cityConfigs) {
    if (!city.enabled) continue;

    const cityMercator = latLonToMercator(city.anchorLatLon.lat, -city.anchorLatLon.lon);
    const distance = getDistanceBetweenMercatorPoints(
      cameraMercatorX,
      cameraMercatorY,
      cityMercator.x,
      cityMercator.y
    );

    if (distance < city.loadDistance && distance < minDistance) {
      minDistance = distance;
      nearestCity = city;
    }
  }

  return nearestCity;
};

/**
 * Load cities configuration from JSON file
 */
export const loadCitiesFromJSON = async (): Promise<CityConfig[]> => {
  try {
    const response = await fetch('/3d-cities-config.json');
    if (!response.ok) throw new Error('Failed to load cities config');

    const data: CitiesConfigJSON = await response.json();
    return data.cities.filter(city => city.enabled);
  } catch (error) {
    console.error('Error loading cities config:', error);
    // Fallback to default Riyadh config
    return [
      {
        id: 'riyadh',
        name: 'Riyadh',
        tilesetPath: '3DTiles/3DTiles/glb-tiles.json',
        anchorLatLon: { lat: 24.65100980316966, lon: 46.77485429551907 },
        loadDistance: 500000,
        enabled: true
      }
    ];
  }
};

/**
 * City tile visibility constants
 */
export const CITY_TILE_CONSTANTS = {
  MAX_3D_TILE_CAMERA_DISTANCE: 50000,
  LOAD_MODEL_DISTANCE: 7500
} as const;
