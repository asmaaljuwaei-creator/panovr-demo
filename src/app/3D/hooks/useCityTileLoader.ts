import { useCallback } from 'react';
import * as THREE from 'three';
import { latLonToMercator } from '../utils/geoUtils';
import { findNearestCity, type CityConfig, CITY_TILE_CONSTANTS } from '../utils/cityTileUtils';

interface ThreeRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: any;
  tileGroup: THREE.Group;
  hiResTileGroup: THREE.Group;
  midResTileGroup: THREE.Group;
  lowResTileGroup: THREE.Group;
  debugBox: THREE.Mesh;
}

interface UseCityTileLoaderProps {
  threeRefs: React.MutableRefObject<ThreeRefs | null>;
  cityTileManagersRef: React.MutableRefObject<Map<string, any>>;
  activeCityRef: React.MutableRefObject<string | null>;
  GLBTileManagerClassRef: React.MutableRefObject<any>;
  gltfLoaderRef: React.MutableRefObject<any>;
  availableCitiesRef: React.MutableRefObject<CityConfig[]>;
}

export const useCityTileLoader = ({
  threeRefs,
  cityTileManagersRef,
  activeCityRef,
  GLBTileManagerClassRef,
  gltfLoaderRef,
  availableCitiesRef
}: UseCityTileLoaderProps) => {
  const loadCityTiles = useCallback(
    (cameraMercatorX: number, cameraMercatorY: number) => {
      const cities = availableCitiesRef.current;
      if (!threeRefs.current || cities.length === 0) return;

      const cameraDistance = threeRefs.current.camera.position.distanceTo(
        threeRefs.current.controls.target
      );

      // Hide city tiles if camera is too far
      if (cameraDistance > CITY_TILE_CONSTANTS.MAX_3D_TILE_CAMERA_DISTANCE) {
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

      // Find nearest city
      const nearestCity = findNearestCity(cameraMercatorX, cameraMercatorY, cities);

      // Hide tiles if no city is near
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

      // Already showing this city
      if (activeCityRef.current === nearestCity.id) {
        return;
      }

      // Switch cities - cleanup old city
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

      // Load new city
      if (!cityTileManagersRef.current.has(nearestCity.id)) {
        if (!GLBTileManagerClassRef.current || !gltfLoaderRef.current) return;

        const cityAnchorMercator = latLonToMercator(
          nearestCity.anchorLatLon.lat,
          -nearestCity.anchorLatLon.lon
        );
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
            const cameraDistance = threeRefs.current.camera.position.distanceTo(
              threeRefs.current.controls.target
            );
            manager.updateTileVisibility(threeRefs.current.camera.position, cameraDistance);
          }
        });
      } else {
        activeCityRef.current = nearestCity.id;
      }
    },
    [
      threeRefs,
      cityTileManagersRef,
      activeCityRef,
      GLBTileManagerClassRef,
      gltfLoaderRef,
      availableCitiesRef
    ]
  );

  return { loadCityTiles };
};
