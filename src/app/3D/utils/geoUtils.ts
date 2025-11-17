import * as THREE from 'three';

export const EARTH_RADIUS = 6378137;
export const MAP_SIZE_METERS = 2 * Math.PI * EARTH_RADIUS;

export function mercatorToLatLon(x: number, y: number): { lat: number; lon: number } {
    const lon = (x / EARTH_RADIUS) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI);
    return { lat, lon };
}

export function latLonToMercator(lat: number, lon: number): { x: number; y: number } {
    const x = EARTH_RADIUS * (lon * Math.PI / 180);
    const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
    return { x, y };
}