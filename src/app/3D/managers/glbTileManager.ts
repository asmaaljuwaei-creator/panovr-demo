import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type GLBTileManager = ReturnType<typeof createGLBTileManager>;

export interface GLBContext {
  baseURL?: string | null;
  getLightingSettings: () => {
    materialColor: string;
    emissiveColor: string;
    emissiveIntensity: number;
  } & Record<string, any>;
  getMouseMercator: () => { x: number; y: number };
  getMapCenterMercator: () => { x: number; y: number };
  setMaterialsTransparent: (obj: THREE.Object3D) => void;
  animateRiseFromGround: (obj: THREE.Object3D, originalY: number, duration?: number) => void;
  animateFadeIn: (obj: THREE.Object3D, duration?: number) => void;
  getHeaders: () => Record<string, string>;
}

export function createGLBTileManager(
  tileGroup: THREE.Group,
  gltfLoader: GLTFLoader,
  anchorMercator: { x: number; y: number },
  tilesetPath: string = '3DTiles/3DTiles/',
  ctx: GLBContext
) {
  // Derive base folder for GLB tiles regardless of whether tilesetPath is a folder or a glb-tiles.json
  const tilesBasePath = tilesetPath.endsWith('/')
    ? tilesetPath
    : (tilesetPath.endsWith('.json')
        ? tilesetPath.substring(0, tilesetPath.lastIndexOf('/') + 1)
        : (tilesetPath + (tilesetPath.endsWith('/') ? '' : '/')));
  const tiles = new Map<string, {
    scene: THREE.Group,
    centerPosition: THREE.Vector3,
    tileX: number,
    tileY: number,
    filename: string,
    loaded: boolean,
    visible: boolean
  }>();
  const tileSources = new Map<string, string>();
  const loadingTiles = new Set<string>();
  const maxVisibleTiles = 32;
  const tileMaxMercatorDistance = 150000; // allow selection much further from center
  const tileHideHeight = 300000; // only hide when extremely high
  const loadDistance = 60000;

  function parseCoordinatesAndPosition(filename: string) {
    const match = filename.match(/X([\-\d.]+)_Y([\-\d.]+)_z([\d.-]+)\.glb/);
    if (!match) return null;
    const tileX = parseFloat(match[1]);
    const tileY = parseFloat(match[2]);
    const centerPosition = new THREE.Vector3(
      anchorMercator.x + (-tileX),
      0,
      anchorMercator.y + tileY
    );
    return { tileX, tileY, centerPosition };
  }

  function getDistanceMercator(a: THREE.Vector3, b: { x: number; y: number }) {
    const dx = a.x - b.x;
    const dz = a.z - b.y;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function selectVisibleTiles(cameraDistance: number): string[] {
    const center = ctx.getMapCenterMercator();
    const tilesWithDistance = Array.from(tiles.entries()).map(([filename, tile]) => ({
      filename,
      tile,
      distance: getDistanceMercator(tile.centerPosition, { x: center.x, y: center.y })
    }));

    const candidateTiles = tilesWithDistance.filter(({ distance }) =>
      distance <= tileMaxMercatorDistance && cameraDistance <= tileHideHeight
    );
    if (cameraDistance > tileHideHeight) return [];
    candidateTiles.sort((a, b) => a.distance - b.distance);
    const selectedTiles = candidateTiles.slice(0, 4).map(({ filename }) => filename);
    return selectedTiles;
  }

  async function loadTile(filename: string): Promise<void> {
    if (loadingTiles.has(filename) || tiles.get(filename)?.loaded) return;
    loadingTiles.add(filename);

    const apiBaseURL = ctx.baseURL || '';
    const tilePath = `${tilesBasePath}${filename}`;
    const glbUrl = `${apiBaseURL}/api/v1/ThreeD/GetB3dmTiles?tilesetPath=${encodeURIComponent(tilePath)}`;

    return new Promise((resolve, reject) => {
      gltfLoader.load(
        glbUrl,
        (gltf: any) => {
          const lighting = ctx.getLightingSettings();
          const customColor = new THREE.Color(lighting.materialColor);
          const emissiveColor = new THREE.Color(lighting.emissiveColor).multiplyScalar(0.2);
          gltf.scene.traverse((child: any) => {
            if (child.isMesh && child.material) {
              const apply = (mat: any) => {
                if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                  mat.color.copy(customColor);
                  mat.metalness = 0;
                  mat.roughness = 0.8;
                  mat.envMapIntensity = 0;
                  mat.emissive.copy(emissiveColor);
                  mat.emissiveIntensity = lighting.emissiveIntensity;
                } else if (mat.isMeshBasicMaterial) {
                  mat.color.copy(customColor);
                } else if (mat.isMeshLambertMaterial) {
                  mat.color.copy(customColor);
                  mat.emissive.copy(emissiveColor);
                }
                mat.needsUpdate = true;
              };
              if (Array.isArray(child.material)) child.material.forEach(apply); else apply(child.material);
            }
          });

          const coords = parseCoordinatesAndPosition(filename);
          if (coords) {
            gltf.scene.position.set(-anchorMercator.x, 0, -anchorMercator.y);
            gltf.scene.rotation.x = -90 * (Math.PI / 180);
            gltf.scene.rotation.z = 0;
            gltf.scene.scale.set(1, 1, 1);
            gltf.scene.userData = { buildingName: filename.replace('.glb', ''), fromGLBManager: true };
            gltf.scene.visible = false;
            tileGroup.add(gltf.scene);
            const existingTile = tiles.get(filename);
            if (existingTile) {
              existingTile.scene = gltf.scene;
              existingTile.loaded = true;
            }
          }
          loadingTiles.delete(filename);
          resolve();
        },
        undefined,
        (error: any) => {
          loadingTiles.delete(filename);
          reject(error);
        }
      );
    });
  }

  async function initializeTilesGeneric(tileset: string, cityID: string, fallbackTiles: string[] = ['KAFD.glb', 'Kingdom_Tower.glb', 'Faisaliah.glb', 'Al-Anoud.glb']) {
    try {
      const apiBaseURL = ctx.baseURL || '';
      const fullTilesetPath = tileset.endsWith('/') ? `${tileset}glb-tiles.json` : tileset;
      const url = `${apiBaseURL}/api/v1/ThreeD/GetMainTilesetJson?tilesetPath=${encodeURIComponent(fullTilesetPath)}`;
      const headers = { ...ctx.getHeaders(), accept: '*/*' };
      const response = await fetch(url, { headers });
      if (!response || !response.ok) {
        fallbackTiles.forEach((filename) => {
          const coords = parseCoordinatesAndPosition(filename);
          if (coords) {
            tiles.set(filename, { scene: new THREE.Group(), centerPosition: coords.centerPosition, tileX: coords.tileX, tileY: coords.tileY, loaded: false, visible: false, filename });
            tileSources.set(filename, cityID);
          }
        });
        return;
      }
      const responseData = await response.json();
      const glbTileNames: string[] = Array.isArray(responseData) ? responseData : (responseData.tiles || []);
      glbTileNames.forEach((filename) => {
        tileSources.set(filename, cityID);
        const coords = parseCoordinatesAndPosition(filename);
        if (coords) {
          tiles.set(filename, { scene: new THREE.Group(), centerPosition: coords.centerPosition, tileX: coords.tileX, tileY: coords.tileY, filename, loaded: false, visible: false });
        }
      });
    } catch (e) {
      console.error(`Failed to initialize ${cityID} tiles:`, e);
    }
  }

  async function initializeTiles(tileset: string, cityId: string) {
    return initializeTilesGeneric(tileset, cityId);
  }

  async function updateTileVisibility(cameraPosition: THREE.Vector3, cameraDistance: number) {
    const visibleTileNames = selectVisibleTiles(cameraDistance);
    const previouslyVisible = new Set<string>();
    tiles.forEach((tile, filename) => { if (tile.visible) previouslyVisible.add(filename); });

    const visibleSet = new Set(visibleTileNames);
    tiles.forEach((tile, filename) => {
      if (tile.loaded && tile.scene && !visibleSet.has(filename)) {
        tile.scene.visible = false;
        tile.visible = false;
      }
    });

    if (visibleTileNames.length === 0) return;

    const loadPromises: Promise<void>[] = [];
    for (const filename of visibleTileNames) {
      const tile = tiles.get(filename);
      if (!tile) continue;
      if (!tile.loaded && !loadingTiles.has(filename)) loadPromises.push(loadTile(filename));
      if (tile.loaded && tile.scene) {
        const isNewlyVisible = !previouslyVisible.has(filename);
        if (isNewlyVisible) {
          tile.scene.visible = true;
          tile.visible = true;
          ctx.setMaterialsTransparent(tile.scene);
          tile.scene.position.y = -50;
          ctx.animateRiseFromGround(tile.scene, 0, 1.5);
          ctx.animateFadeIn(tile.scene, 1.5);
        } else {
          tile.scene.visible = true;
          tile.visible = true;
        }
      }
    }

    if (loadPromises.length > 0) {
      await Promise.allSettled(loadPromises);
      for (const filename of visibleTileNames) {
        const tile = tiles.get(filename);
        if (tile?.loaded && tile.scene && !tile.visible) {
          tile.scene.visible = true;
          tile.visible = true;
          ctx.setMaterialsTransparent(tile.scene);
          tile.scene.position.y = -50;
          ctx.animateRiseFromGround(tile.scene, 0, 1.5);
          ctx.animateFadeIn(tile.scene, 1.5);
        }
      }
    }
  }

  function getStats() {
    const loaded = Array.from(tiles.values()).filter(t => t.loaded).length;
    const visible = Array.from(tiles.values()).filter(t => t.visible).length;
    return { total: tiles.size, loaded, visible, loading: loadingTiles.size };
  }

  return { initializeTiles, updateTileVisibility, getStats, tiles };
}
