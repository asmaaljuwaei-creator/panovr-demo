import * as THREE from 'three';

export type TileManager = ReturnType<typeof createTileManager>;

export function createTileManager(tileServerInit = '${base}/api/v1/Basemap/GetBasemap/{z}/{x}/{y}') {
  const tileCache = new Map<string, THREE.Texture>();
  let tileServer = tileServerInit;
  let selectedLayer: string = 'default';
  const base = process.env.NEXT_PUBLIC_BASE_URL || '';
  let token: string | null = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  let contractId: string | null = typeof window !== 'undefined' ? localStorage.getItem('selected_contract_id') : null;
  const retryAttempts = new Map<string, number>();
  const maxRetries = 3;
  const retryDelay = 1000;

  function setupBasemapURL() {
    if (selectedLayer === 'default' && base && token && contractId) {
      tileServer = `${base}/api/v1/Basemap/GetBasemap/{z}/{x}/{y}`;
    } else if (selectedLayer === 'satellite') {
      tileServer = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    } else {
      tileServer = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    }
  }

  function updateTokensAndReconfigure() {
    token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    contractId = typeof window !== 'undefined' ? localStorage.getItem('selected_contract_id') : null;
    setupBasemapURL();
  }

  function setSelectedLayer(layer: string) {
    selectedLayer = layer;
    updateTokensAndReconfigure();
    clearCache();
  }

  function evictOldestCacheEntry(maxCacheSize = 200) {
    if (tileCache.size >= maxCacheSize) {
      const firstKey = tileCache.keys().next().value as string;
      const texture = tileCache.get(firstKey);
      if (texture) texture.dispose();
      tileCache.delete(firstKey);
    }
  }

  function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
    const n = Math.pow(2, zoom);
    const x = Math.floor(n * ((lon + 180) / 360));
    const y = Math.floor((n * (1 - (Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI)) / 2));
    return { x, y };
  }

  function getTileTexture(x: number, y: number, z: number): Promise<THREE.Texture> {
    const key = `${z}/${x}/${y}`;
    if (tileCache.has(key)) return Promise.resolve(tileCache.get(key)!);
    updateTokensAndReconfigure();
    const url = tileServer.replace('{z}', z.toString()).replace('{x}', x.toString()).replace('{y}', y.toString());
    const isAuthenticatedBasemap = selectedLayer === 'default' && base && token && contractId && url.includes('/api/v1/Basemap/GetBasemap/');
    return isAuthenticatedBasemap ? loadAuthenticatedTile(url, key) : loadRegularTile(url, key);
  }

  function loadRegularTile(url: string, key: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        (texture) => {
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.needsUpdate = true;
          evictOldestCacheEntry();
          tileCache.set(key, texture);
          retryAttempts.delete(key);
          resolve(texture);
        },
        undefined,
        () => {
          handleTileLoadError(key, url, resolve, reject);
        }
      );
    });
  }

  function loadAuthenticatedTile(url: string, key: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      if (contractId) xhr.setRequestHeader('X-Contract-Id', contractId);
      xhr.setRequestHeader('x-client-type', 'Web');
      xhr.responseType = 'blob';
      xhr.onload = () => {
        if (xhr.status === 200) {
          const blobUrl = URL.createObjectURL(xhr.response);
          new THREE.TextureLoader().load(
            blobUrl,
            (texture) => {
              texture.minFilter = THREE.LinearFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.needsUpdate = true;
              URL.revokeObjectURL(blobUrl);
              evictOldestCacheEntry();
              tileCache.set(key, texture);
              retryAttempts.delete(key);
              resolve(texture);
            },
            undefined,
            () => {
              URL.revokeObjectURL(blobUrl);
              handleTileLoadError(key, url, resolve, reject);
            }
          );
        } else {
          handleTileLoadError(key, url, resolve, reject);
        }
      };
      xhr.onerror = () => handleTileLoadError(key, url, resolve, reject);
      xhr.send();
    });
  }

  async function handleTileLoadError(
    key: string,
    originalUrl: string,
    resolve: (t: THREE.Texture) => void,
    reject: (e: unknown) => void
  ) {
    const attemptCount = retryAttempts.get(key) || 0;
    if (attemptCount < maxRetries) {
      retryAttempts.set(key, attemptCount + 1);
      const delay = retryDelay * Math.pow(2, attemptCount);
      setTimeout(async () => {
        try {
          const [z, x, y] = key.split('/').map(Number);
        const texture = await getTileTexture(x, y, z);
          resolve(texture);
        } catch (error) {
          if (attemptCount + 1 >= maxRetries) {
            const placeholder = await createPlaceholderTexture(key);
            resolve(placeholder);
          } else {
            reject(error);
          }
        }
      }, delay);
    } else {
      const placeholder = await createPlaceholderTexture(key);
      resolve(placeholder);
    }
  }

  function createPlaceholderTexture(key: string): Promise<THREE.Texture> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#999';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Tile Error', 128, 128);
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      evictOldestCacheEntry();
      tileCache.set(key, texture);
      resolve(texture);
    });
  }

  function clearCache() {
    tileCache.forEach((t) => t.dispose());
    tileCache.clear();
  }

  return {
    get tileServer() { return tileServer; },
    set tileServer(v: string) { tileServer = v; },
    updateTokensAndReconfigure,
    setSelectedLayer,
    latLonToTile,
    getTileTexture,
    clearCache,
  };
}
