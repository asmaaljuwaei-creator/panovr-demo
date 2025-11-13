import { Map } from "ol";
import { transformExtent } from "ol/proj";

export default function getMapFormattedBounds(map: Map) {
  const extent = map.getView().calculateExtent(map.getSize());
  const [minX, minY, maxX, maxY] = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

  return {
    minLat: minY,
    maxLat: maxY,
    minLng: minX,
    maxLng: maxX,
  };
}