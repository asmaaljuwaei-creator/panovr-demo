import { useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { latLonToMercator } from '../utils/geoUtils';
import { getDistanceBetweenMercatorPoints } from '../utils/materials';
//import clientApi from '@/axios/clientApi';
//import { getContractConfig } from '@/utils/contractIdManager';

interface CityConfig {
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

const baseURL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * Hook for managing city tile loading and visibility
 */
export const useCityTiles = (
  threeRefs: React.MutableRefObject<any>,
  GLBTileManagerClassRef: React.MutableRefObject<any>,
  gltfLoaderRef: React.MutableRefObject<GLTFLoader | null>
) => {
  const [availableCities, setAvailableCities] = useState<CityConfig[]>([]);
  const availableCitiesRef = useRef<CityConfig[]>([]);
  const cityTileManagersRef = useRef<Map<string, any>>(new Map());
  const activeCityRef = useRef<string | null>(null);
  const citiesFetchedRef = useRef(false);

  /**
   * Loads cities configuration from JSON file
   */
  const loadCitiesFromJSON = useCallback(async (): Promise<CityConfig[]> => {
    return [
      {
        id: 'riyadh',
        name: 'Riyadh',
        tilesetPath: '3DTiles/3DTiles/',
        anchorLatLon: { lat: 24.65100980316966, lon: 46.77485429551907 },
        loadDistance: 500000,
        enabled: true
      }
    ];
  }, []);

  /**
   * Finds the nearest city to camera position
   */
  const findNearestCity = useCallback((
    cameraMercatorX: number,
    cameraMercatorY: number,
    cityConfigs: CityConfig[]
  ): CityConfig | null => {
    if (cityConfigs.length === 0) return null;

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
  }, []);

  /**
   * Loads city tiles based on camera position
   */
  const loadCityTiles = useCallback((cameraMercatorX: number, cameraMercatorY: number) => {
    const cities = availableCitiesRef.current;
    if (!threeRefs.current || cities.length === 0) {
      return;
    }

    const cameraDistance = threeRefs.current.camera.position.distanceTo(threeRefs.current.controls.target);
    const MAX_3D_TILE_CAMERA_DISTANCE = 50000;

    if (cameraDistance > MAX_3D_TILE_CAMERA_DISTANCE) {
      if (activeCityRef.current) {
        const manager = cityTileManagersRef.current.get(activeCityRef.current);
        if (manager && manager.tiles) {
          for (const [filename, tile] of manager.tiles) {
            if (tile.loaded && tile.scene) {
              tile.scene.visible = false;
            }
          }
        }
        activeCityRef.current = null;
      }
      return;
    }

    const nearestCity = findNearestCity(cameraMercatorX, cameraMercatorY, cities);

    if (!nearestCity) {
      if (activeCityRef.current) {
        const manager = cityTileManagersRef.current.get(activeCityRef.current);
        if (manager && manager.tiles) {
          for (const [filename, tile] of manager.tiles) {
            if (tile.loaded && tile.scene) {
              tile.scene.visible = false;
            }
          }
        }
        activeCityRef.current = null;
      }
      return;
    }

    if (activeCityRef.current === nearestCity.id) {
      return;
    }

    // Cleanup old city
    if (activeCityRef.current && activeCityRef.current !== nearestCity.id) {
      const oldManager = cityTileManagersRef.current.get(activeCityRef.current);
      if (oldManager && oldManager.tiles) {
        for (const [filename, tile] of oldManager.tiles) {
          if (tile.loaded && tile.scene) {
            threeRefs.current.tileGroup.remove(tile.scene);
            tile.scene.traverse((child: any) => {
              if (child.isMesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                  child.material.forEach((mat: any) => mat.dispose());
                } else {
                  child.material?.dispose();
                }
              }
            });
          }
        }
      }
      cityTileManagersRef.current.delete(activeCityRef.current);
    }

    // Create new city manager
    if (!cityTileManagersRef.current.has(nearestCity.id)) {
      if (!GLBTileManagerClassRef.current || !gltfLoaderRef.current) {
        return;
      }
      const cityAnchorMercator = latLonToMercator(nearestCity.anchorLatLon.lat, -nearestCity.anchorLatLon.lon);
      const manager = GLBTileManagerClassRef.current(
        threeRefs.current.tileGroup,
        gltfLoaderRef.current,
        cityAnchorMercator,
        nearestCity.tilesetPath
      );
      cityTileManagersRef.current.set(nearestCity.id, manager);
      activeCityRef.current = nearestCity.id;

      manager.initializeTiles(nearestCity.tilesetPath, nearestCity.id).then(() => {
        if (threeRefs.current?.camera && threeRefs.current?.controls) {
          const cameraDistance = threeRefs.current.camera.position.distanceTo(threeRefs.current.controls.target);
          manager.updateTileVisibility(threeRefs.current.camera.position, cameraDistance);
        }
      });
    } else {
      activeCityRef.current = nearestCity.id;
    }
  }, [findNearestCity]);

  /**
   * Initializes cities configuration
   */
  const initializeCities = useCallback(async () => {
    if (citiesFetchedRef.current) return;
    const cities = await loadCitiesFromJSON();
    availableCitiesRef.current = cities;
    setAvailableCities(cities);
    citiesFetchedRef.current = true;
    setTimeout(() => {
      if (threeRefs.current && cities.length > 0) {
        const mapCenter = new THREE.Vector3().copy(threeRefs.current.tileGroup.position).negate();
        loadCityTiles(-mapCenter.x, -mapCenter.z);
      }
    }, 500);
  }, [loadCitiesFromJSON, loadCityTiles]);

  return {
    availableCities,
    cityTileManagersRef,
    activeCityRef,
    loadCityTiles,
    initializeCities
  };
};
