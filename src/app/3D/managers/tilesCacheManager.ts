export type TilesCacheManager = ReturnType<typeof createTilesCacheManager>;

export function createTilesCacheManager() {
  const cache = new Map<string, any>();
  const maxCacheSize = 100;

  function get(key: string) {
    return cache.get(key);
  }

  function set(key: string, value: any) {
    if (cache.size >= maxCacheSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(key, value);
  }

  function has(key: string) {
    return cache.has(key);
  }

  function clear() {
    cache.clear();
  }

  function getCacheSize() {
    return cache.size;
  }

  return { get, set, has, clear, getCacheSize };
}
