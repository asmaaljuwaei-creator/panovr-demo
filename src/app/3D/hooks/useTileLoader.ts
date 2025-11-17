import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mercatorToLatLon, MAP_SIZE_METERS } from '../utils/geoUtils';
import type { TileManager as TileManagerAPI } from '../managers/tileManager';

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

interface UseTileLoaderProps {
  threeRefs: React.MutableRefObject<ThreeRefs | null>;
  tileManagerRef: React.MutableRefObject<TileManagerAPI>;
  zoom: number;
  centerTile: { x: number; y: number };
  forceTileUpdate: number;
  isBasemapReady: boolean;
  MIN_ZOOM: number;
  MAX_ZOOM: number;
  HI_RES_GRID: number;
  MID_RES_GRID: number;
  LOW_RES_GRID: number;
  LOD_HEIGHTS: number[];
  loadedTilesRef: React.MutableRefObject<{
    hi: Map<string, THREE.Mesh>;
    mid: Map<string, THREE.Mesh>;
    low: Map<string, THREE.Mesh>;
  }>;
  tilesBeingLoadedRef: React.MutableRefObject<Set<string>>;
}

export const useTileLoader = ({
  threeRefs,
  tileManagerRef,
  zoom,
  centerTile,
  forceTileUpdate,
  isBasemapReady,
  MIN_ZOOM,
  MAX_ZOOM,
  HI_RES_GRID,
  MID_RES_GRID,
  LOW_RES_GRID,
  LOD_HEIGHTS,
  loadedTilesRef,
  tilesBeingLoadedRef
}: UseTileLoaderProps) => {
  const loading = useRef(false);
  // Use shared refs from component instead of creating new ones
  const loadedTiles = loadedTilesRef;
  const tilesBeingLoaded = tilesBeingLoadedRef;

  // Tile loading effect
  useEffect(() => {
    const removeOutdatedTiles = (
      lodLevel: 'hi' | 'mid' | 'low',
      tileGroup: THREE.Group,
      requiredTiles: Set<string>
    ) => {
      for (const [key, tile] of loadedTiles.current[lodLevel].entries()) {
        if (!requiredTiles.has(key)) {
          tileGroup.remove(tile);
          tile.geometry.dispose();
          const material = tile.material as THREE.MeshBasicMaterial;
          material.map?.dispose();
          material.dispose();
          loadedTiles.current[lodLevel].delete(key);
        }
      }
    };

    const loadNewTiles = (
      lodLevel: 'hi' | 'mid' | 'low',
      tileGroup: THREE.Group,
      requiredTiles: Set<string>,
      tileSize: number,
      lodHeight: number,
      tileManager: TileManagerAPI,
      getTileBBoxInWorldSpace: (x: number, y: number, z: number) => {
        centerX: number;
        centerZ: number;
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
      },
      promises: Promise<void>[]
    ) => {
      for (const tileKey of requiredTiles) {
        if (
          !loadedTiles.current[lodLevel].has(tileKey) &&
          !tilesBeingLoaded.current.has(tileKey)
        ) {
          tilesBeingLoaded.current.add(tileKey);
          const [z, x, y] = tileKey.split('/').map(Number);
          promises.push(
            tileManager
              .getTileTexture(x, y, z)
              .then((texture) => {
                texture.needsUpdate = true;
                texture.colorSpace = THREE.SRGBColorSpace; // Ensure proper color space for accurate colors

                const geometry = new THREE.PlaneGeometry(
                  tileSize * 1.001,
                  tileSize * 1.001
                );
                const material = new THREE.MeshBasicMaterial({
                  map: texture,
                  side: THREE.FrontSide,
                  depthWrite: true,
                  depthTest: true
                });
                material.needsUpdate = true;
                const plane = new THREE.Mesh(geometry, material);
                const planePos = getTileBBoxInWorldSpace(x, y, z);

                plane.position.set(planePos.centerX, lodHeight, planePos.centerZ);
                plane.rotation.x = -Math.PI / 2;
                
                // Set render order: hi=3, mid=2, low=1 (higher renders on top)
                // With proper Y-layering (0, -5, -10), this ensures correct ordering
                if (lodLevel === 'hi') plane.renderOrder = 3;
                else if (lodLevel === 'mid') plane.renderOrder = 2;
                else plane.renderOrder = 1;
                
                tileGroup.add(plane);
                loadedTiles.current[lodLevel].set(tileKey, plane);
                tilesBeingLoaded.current.delete(tileKey);
              })
              .catch((error) => {
                console.error(`Failed to load tile ${tileKey}:`, error);
                tilesBeingLoaded.current.delete(tileKey);
              })
          );
        }
      }
    };

    const clearAllTiles = (lodLevel: 'hi' | 'mid' | 'low', tileGroup: THREE.Group) => {
      for (const [key, tile] of loadedTiles.current[lodLevel].entries()) {
        tileGroup.remove(tile);
        tile.geometry.dispose();
        const material = tile.material as THREE.MeshBasicMaterial;
        if (material.map) material.map.dispose();
        material.dispose();
        loadedTiles.current[lodLevel].delete(key);
      }
    };

    const updateTiles = async () => {
      if (!threeRefs.current || loading.current || !isBasemapReady) return;
      loading.current = true;

      const { hiResTileGroup, midResTileGroup, lowResTileGroup, tileGroup } =
        threeRefs.current;
      const tileManager = tileManagerRef.current;

      // Use zoom + 1 for higher quality tiles
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(zoom) + 1));
      const mapCenter = new THREE.Vector3().copy(tileGroup.position).negate();
      const hiResCenterLatLon = mercatorToLatLon(mapCenter.x, mapCenter.z);

      const getTileBBoxInWorldSpace = (
        tileX: number,
        tileY: number,
        tileZoom: number
      ) => {
        const tileSize = MAP_SIZE_METERS / Math.pow(2, tileZoom);
        const halfMapSize = MAP_SIZE_METERS / 2;
        const xMin = tileX * tileSize - halfMapSize;
        const zMin = tileY * tileSize - halfMapSize;
        return {
          minX: xMin,
          maxX: xMin + tileSize,
          minZ: zMin,
          maxZ: zMin + tileSize,
          centerX: xMin + tileSize / 2,
          centerZ: zMin + tileSize / 2,
        };
      };

      const promises: Promise<void>[] = [];

      // Hi-res tiles
      const hiResCenterTile = tileManager.latLonToTile(
        -hiResCenterLatLon.lat,
        hiResCenterLatLon.lon,
        clampedZoom
      );
      const hiResTileSize = MAP_SIZE_METERS / Math.pow(2, clampedZoom);
      const hiResGridRadius = Math.floor(HI_RES_GRID / 2);

      const requiredHiResTiles = new Set<string>();
      for (let dx = -hiResGridRadius; dx <= hiResGridRadius; dx++) {
        for (let dy = -hiResGridRadius; dy <= hiResGridRadius; dy++) {
          const tileX = hiResCenterTile.x + dx;
          const tileY = hiResCenterTile.y + dy;
          const maxTileCoord = Math.pow(2, clampedZoom);
          if (tileX < 0 || tileX >= maxTileCoord || tileY < 0 || tileY >= maxTileCoord)
            continue;

          requiredHiResTiles.add(`${clampedZoom}/${tileX}/${tileY}`);
        }
      }

      removeOutdatedTiles('hi', hiResTileGroup, requiredHiResTiles);
      loadNewTiles(
        'hi',
        hiResTileGroup,
        requiredHiResTiles,
        hiResTileSize,
        LOD_HEIGHTS[0],
        tileManager,
        getTileBBoxInWorldSpace,
        promises
      );

      // Mid-res tiles (only 1 zoom level apart for smoother transition)
      const midResZoom = clampedZoom - 1;
      const midResGridRadius = Math.floor(MID_RES_GRID / 2);
      const midResCenterTile = tileManager.latLonToTile(
        -hiResCenterLatLon.lat,
        hiResCenterLatLon.lon,
        midResZoom
      );
      const midResTileSize = MAP_SIZE_METERS / Math.pow(2, midResZoom);
      const requiredMidResTiles = new Set<string>();

      if (midResZoom >= MIN_ZOOM) {
        for (let dx = -midResGridRadius; dx <= midResGridRadius; dx++) {
          for (let dy = -midResGridRadius; dy <= midResGridRadius; dy++) {
            const tileX = midResCenterTile.x + dx;
            const tileY = midResCenterTile.y + dy;
            const maxTileCoord = Math.pow(2, midResZoom);
            if (tileX < 0 || tileX >= maxTileCoord || tileY < 0 || tileY >= maxTileCoord)
              continue;

            let coveredChildTiles = 0;
            for (let i = 0; i < 2; i++) {
              for (let j = 0; j < 2; j++) {
                if (
                  requiredHiResTiles.has(
                    `${clampedZoom}/${tileX * 2 + i}/${tileY * 2 + j}`
                  )
                ) {
                  coveredChildTiles++;
                }
              }
            }

            if (coveredChildTiles < 4) {
              requiredMidResTiles.add(`${midResZoom}/${tileX}/${tileY}`);
            }
          }
        }

        removeOutdatedTiles('mid', midResTileGroup, requiredMidResTiles);
        loadNewTiles(
          'mid',
          midResTileGroup,
          requiredMidResTiles,
          midResTileSize,
          LOD_HEIGHTS[1],
          tileManager,
          getTileBBoxInWorldSpace,
          promises
        );
      } else {
        clearAllTiles('mid', midResTileGroup);
      }

      // Low-res tiles (much lower zoom for distant areas only)
      const lowResZoom2 = Math.max(MIN_ZOOM, clampedZoom - 4);
      const lowResGridRadius2 = Math.floor(LOW_RES_GRID / 2);
      const lowResCenterTile2 = tileManager.latLonToTile(
        -hiResCenterLatLon.lat,
        hiResCenterLatLon.lon,
        lowResZoom2
      );
      const lowResTileSize2 = MAP_SIZE_METERS / Math.pow(2, lowResZoom2);
      const requiredLowResTiles2 = new Set<string>();

      if (lowResZoom2 >= MIN_ZOOM) {
        for (let dx = -lowResGridRadius2; dx <= lowResGridRadius2; dx++) {
          for (let dy = -lowResGridRadius2; dy <= lowResGridRadius2; dy++) {
            const tileX = lowResCenterTile2.x + dx;
            const tileY = lowResCenterTile2.y + dy;
            const maxTileCoord = Math.pow(2, lowResZoom2);
            if (tileX < 0 || tileX >= maxTileCoord || tileY < 0 || tileY >= maxTileCoord)
              continue;

            let coveredByHiRes = 0;
            for (let i = 0; i < 4; i++) {
              for (let j = 0; j < 4; j++) {
                if (
                  requiredHiResTiles.has(
                    `${clampedZoom}/${tileX * 4 + i}/${tileY * 4 + j}`
                  )
                ) {
                  coveredByHiRes++;
                }
              }
            }

            let coveredByMidRes = 0;
            for (let i = 0; i < 2; i++) {
              for (let j = 0; j < 2; j++) {
                if (
                  requiredMidResTiles.has(`${midResZoom}/${tileX * 2 + i}/${tileY * 2 + j}`)
                ) {
                  coveredByMidRes++;
                }
              }
            }

            const hiResCoverage = coveredByHiRes / 16;
            const midResCoverage = coveredByMidRes / 4;
            const totalCoverage = Math.max(hiResCoverage, midResCoverage);

            if (totalCoverage < 0.25) {
              requiredLowResTiles2.add(`${lowResZoom2}/${tileX}/${tileY}`);
            }
          }
        }

        removeOutdatedTiles('low', lowResTileGroup, requiredLowResTiles2);
        loadNewTiles(
          'low',
          lowResTileGroup,
          requiredLowResTiles2,
          lowResTileSize2,
          LOD_HEIGHTS[2],
          tileManager,
          getTileBBoxInWorldSpace,
          promises
        );
      } else {
        clearAllTiles('low', lowResTileGroup);
      }

      await Promise.all(promises);
      loading.current = false;
    };

    updateTiles();
  }, [zoom, centerTile, forceTileUpdate, isBasemapReady, threeRefs, tileManagerRef, MIN_ZOOM, MAX_ZOOM, HI_RES_GRID, MID_RES_GRID, LOW_RES_GRID, LOD_HEIGHTS]);

  // Cleanup
  useEffect(() => {
    return () => {
      // Cleanup all tiles on unmount
      for (const lodLevel of ['hi', 'mid', 'low'] as const) {
        for (const [key, tile] of loadedTiles.current[lodLevel].entries()) {
          tile.geometry.dispose();
          const material = tile.material as THREE.MeshBasicMaterial;
          material.map?.dispose();
          material.dispose();
        }
        loadedTiles.current[lodLevel].clear();
      }
      tilesBeingLoaded.current.clear();
    };
  }, []);
};
