"use client";

import { useEffect, useRef } from "react";
import VectorLayer from "ol/layer/Vector";
import VectorImageLayer from "ol/layer/VectorImage";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { Circle as CircleStyle, Icon, Fill, Style, Stroke } from "ol/style";
import { fromLonLat } from "ol/proj";
import getMapFormattedBounds from "./getMapFormattedBounds";
import { click, pointerMove } from "ol/events/condition";
import Select from "ol/interaction/Select";
import Overlay from "ol/Overlay";
import type { Geometry } from "ol/geom";
import type { Feature as OLFeature } from "ol";
import MultiLineString from "ol/geom/MultiLineString";


function getAuth() {
  const baseURL = "https://api.neomaps.com";
  const contractId = "2cb5338f-a35d-444c-aac7-993dea00135e";
  const accessToken = "SBOX6CzXn48mAbGlj5HX_Ftntl_X7PljA4tEExIvgKI";


  //if (!baseURL) throw new Error("🗺️ NEXT_PUBLIC_BASE_URL is not defined");
  if (!contractId || !accessToken)
    throw new Error(
      "🗺️ Missing auth data in localStorage (contract ID or access token)"
    );

  return { baseURL, contractId, accessToken };
}


/* ===================== Types ===================== */

export interface Marker {
  id: string;
  latitude: number;
  longitude: number;
  name?: string;
  imagePath?: string;
  sequence: string;
  capturedAt?: number; // monotonic timestamp from API

}
// ===== Sequence persistence for VR next/prev =====
type PanoItem = {
  id: string;
  imagePath: string;
  lat?: number;
  lon?: number;
  sequence?: string;
};

const SEQ_KEY = "neo:panos:sequence:v1";
const SEQ_IDX_KEY = "neo:panos:index:v1";

export function savePanoSequence(items: PanoItem[]) {
  try {
    localStorage.setItem(SEQ_KEY, JSON.stringify(items));
    const idx: Record<string, number> = {};
    items.forEach((it, i) => (idx[it.id] = i));
    localStorage.setItem(SEQ_IDX_KEY, JSON.stringify(idx));
  } catch {}
}

// (optional) load if you need it elsewhere
export function loadPanoSequence(): { list: PanoItem[]; idx: Record<string, number> } {
  try {
    const raw = localStorage.getItem(SEQ_KEY);
    const rawIdx = localStorage.getItem(SEQ_IDX_KEY);
    const list = raw ? (JSON.parse(raw) as PanoItem[]) : [];
    const idx = rawIdx ? (JSON.parse(rawIdx) as Record<string, number>) : {};
    return { list, idx };
  } catch {
    return { list: [], idx: {} };
  }
}

export interface Link {
  targetId: string;
  yaw: number;
  latitude?: number;
  longitude?: number;
  imagePath?: string;
  rel?: "prev" | "next"; //  linear intent for VR picker
}

export type NavOpts = {
  center?: boolean;
  animateMs?: number;
  keepZoom?: boolean;
  moveOnly?: boolean; // move marker/arrow only (no image fetch)
};

export interface StreetViewAPI {
  handleNextPano: () => Promise<void> | void;
  handlePreviousPano: () => Promise<void> | void;
  highlightNearestAtLevel13: () => Promise<void> | void;
  selectMarkerById: (id: string, opts?: NavOpts) => Promise<void>;
  selectMarkerByImagePath: (
    imagePath?: string,
    opts?: NavOpts
  ) => Promise<void>;
  selectMarkerByLocation: (
    lat: number,
    lon: number,
    opts?: NavOpts
  ) => Promise<void>;
}
// --- Solid "blue fill" look using thick semi-transparent strokes ---
function coverageFillStyleForZoom(zoom: number) {
  // Bigger width -> more solid fill. Tweak to taste.
  const width = Math.max(10, (zoom - 6) * 3);
  return new Style({
    stroke: new Stroke({
      color: "rgba(0,115,255,0.35)", // Google-ish blue, semi-transparent
      width,
      lineCap: "round",
      lineJoin: "round",
    }),
  });
}

/* ===================== Constants & helpers ===================== */

function normalizeSequence(sequence?: string) {
  return (sequence || "default").trim().toLowerCase();
}

function normalizeVariants(path?: string): string[] {
  const original = (path || "").trim();
  if (!original) return [];
  const noBackslashes = original.replace(/\\/g, "/");
  const noLeadingSlash = noBackslashes.replace(/^\/+/, "");
  const lower = noLeadingSlash.toLowerCase();
  return Array.from(new Set([original, noBackslashes, noLeadingSlash, lower]));
}
function encodeKeepSlashes(segment: string) {
  return segment.split("/").map(encodeURIComponent).join("/");
}

function buildImageUrls(baseURL: string, imagePath: string) {
  const variants = normalizeVariants(imagePath);
  const urls = variants.flatMap((variant) => [
    `/api/neomaps/api/v1/Images/GetPanoramaPoiImages?imagePath=${encodeKeepSlashes(
      variant
    )}`,
    `/api/neomaps/api/v1/Images/GetPanoramaPoiImages?imagePath=${variant}`,
    `/api/neomaps/api/v1/Images/GetPanoramaPoiImages?imagePath=${encodeURIComponent(
      variant
    )}`,
  ]);
  return Array.from(new Set(urls));
}



/* ===================== Geometry helpers ===================== */

// signed smallest angle delta in (-180, 180]
function signedAngleDelta(aDeg: number, bDeg: number) {
  return ((aDeg - bDeg + 540) % 360) - 180;
}

// is candidate ahead of origin given desired forward bearing?
function isAhead(origin: Marker, desiredBearing: number, candidate: Marker) {
  const toCand = bearingDegrees(origin, candidate);
  // ahead if within +/- 90° cone centered on desiredBearing
  return Math.abs(signedAngleDelta(toCand, desiredBearing)) <= 90;
}

// same but for "behind" (used by Prev)
function isBehind(
  origin: Marker,
  desiredBackBearing: number,
  candidate: Marker
) {
  const toCand = bearingDegrees(origin, candidate);
  return Math.abs(signedAngleDelta(toCand, desiredBackBearing)) <= 90;
}

// angle-first comparator with distance tiebreaker
function byAngleThenDistance(origin: Marker, desiredBearing: number) {
  return (markerA: Marker, markerB: Marker) => {
    const bearingOffsetA = Math.abs(
      signedAngleDelta(bearingDegrees(origin, markerA), desiredBearing)
    );
    const bearingOffsetB = Math.abs(
      signedAngleDelta(bearingDegrees(origin, markerB), desiredBearing)
    );
    if (bearingOffsetA !== bearingOffsetB)
      return bearingOffsetA - bearingOffsetB;
    const distanceA = metersBetween(origin, markerA);
    const distanceB = metersBetween(origin, markerB);
    return distanceA - distanceB;
  };
}

// Geodesic bearing (0°=North, clockwise)
function bearingDegrees(fromMarker: Marker, toMarker: Marker): number {
  const fromLatitudeRadians = (fromMarker.latitude * Math.PI) / 180;
  const toLatitudeRadians = (toMarker.latitude * Math.PI) / 180;
  const deltaLambda =
    ((toMarker.longitude - fromMarker.longitude) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(toLatitudeRadians);
  const x =
    Math.cos(fromLatitudeRadians) * Math.sin(toLatitudeRadians) -
    Math.sin(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.cos(deltaLambda);

  let theta = Math.atan2(y, x);
  let deg = (theta * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

export function makeLinks(currentMarker: Marker, allMarkers: Marker[]): Link[] {
  return allMarkers
    .filter((marker) => marker.id !== currentMarker.id)
    .map((nearbyMarker) => ({
      targetId: nearbyMarker.id,
      yaw: bearingDegrees(currentMarker, nearbyMarker),
      latitude: nearbyMarker.latitude,
      longitude: nearbyMarker.longitude,
      imagePath: nearbyMarker.imagePath,
    }));
}

const EARTH_RADIUS_METERS = 6371000;
function metersBetween(a: Marker, b: Marker): number {
  const phi1 = (a.latitude * Math.PI) / 180,
    lambda1 = (a.longitude * Math.PI) / 180;
  const phi2 = (b.latitude * Math.PI) / 180,
    lambda2 = (b.longitude * Math.PI) / 180;
  const deltaPhi = phi2 - phi1,
    deltaLambda = lambda2 - lambda1;
  const haversine =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}
function maxHopForZoom(map: any) {
  const zoom = map?.getView?.()?.getZoom?.() ?? 0;
  if (zoom >= 25) return 60;
  if (zoom >= 16) return 75;
  if (zoom >= 15) return 90;
  if (zoom >= 14) return 110;
  return 140;
}
/* ===================== Hook ===================== */

export function useStreetViewMap(
  map: any,
  enabled: boolean,
  setPanoramaImageUrl: (
    url: string,
    index: number,
    markers: Marker[],
    hotspotLinks: Link[]
  ) => void,
  isPanoOpen: boolean,
  currentPanoIndex: number | null,
  onUnavailable?: (reason: string) => void
): StreetViewAPI {
  /* ---------- Layers ---------- */
  const pointsLayerRef = useRef<VectorImageLayer<VectorSource<any>> | null>(
    null
  );

  const linesLayerRef = useRef<VectorImageLayer<
    VectorSource<OLFeature<Geometry>>
  > | null>(null);

  const coverageLayerRef = useRef<VectorImageLayer<
    VectorSource<OLFeature<Geometry>>
  > | null>(null);

  const currentPanoLayerRef = useRef<VectorLayer<
    VectorSource<OLFeature<Geometry>>
  > | null>(null);
  const currentPanoFeatureRef = useRef<Feature<Point> | null>(null);

  const arrowLayerRef = useRef<VectorLayer<
    VectorSource<OLFeature<Geometry>>
  > | null>(null);
  const arrowFeatureRef = useRef<Feature<Point> | null>(null);
  const arrowIconRef = useRef<Icon | null>(null);

  /* ---------- Interactions & timers ---------- */
  const selectRef = useRef<Select | null>(null);
  const hoverSelectRef = useRef<Select | null>(null);
  const moveEndTimer = useRef<number | null>(null);

  /* ---------- Data / state ---------- */
  const markersRef = useRef<Marker[]>([]);
  const lastExtentRef = useRef<[number, number, number, number] | null>(null);
  const bboxRequestAbortRef = useRef<AbortController | null>(null);
  const lastPanoUrlRef = useRef<string | null>(null);

  const featureByIdRef = useRef<Record<string, Feature<Point>>>({});

  const activeFeatureRef = useRef<Feature<Point> | null>(null);

  const prevEnabledRef = useRef<boolean>(false);
  const pendingHighlightRef = useRef<boolean>(false);

  const overlayRef = useRef<Overlay | null>(null);
  const overlayElRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number | null>(null);

  const orderedMarkersRef = useRef<Marker[]>([]);
  const idToOrderedIndexRef = useRef<Record<string, number>>({});
  const sequenceToOrderedIdsRef = useRef<Record<string, string[]>>({});
  const currentMarkerIdRef = useRef<string | null>(null);

  const panoFetchAbortRef = useRef<AbortController | null>(null);
  const navigationSequenceCounterRef = useRef(0);

  // --- coverage-only stores (independent from points/lines) ---
  const coverageMarkersRef = useRef<Marker[]>([]);
  const coverageIdToOrderedIndexRef = useRef<Record<string, number>>({});
  const coverageSequenceToOrderedIdsRef = useRef<Record<string, string[]>>({});
  // Fast ID set to avoid duplicates
  const coverageIdSetRef = useRef<Set<string>>(new Set());

  // Debounce coverage rebuilds so we don't redraw after every batch
  const covRebuildTimer = useRef<number | null>(null);
  function scheduleCoverageRebuild(delay = 0) {
    if (covRebuildTimer.current) return;
    covRebuildTimer.current = window.setTimeout(() => {
      covRebuildTimer.current = null;
      rebuildCoverageFromMarkers();
    }, delay);
  }

  // Merge new markers in one shot
  function mergeCoverageMarkers(newOnes: Marker[]) {
    let added = 0;
    for (const m of newOnes) {
      if (!coverageIdSetRef.current.has(m.id)) {
        coverageIdSetRef.current.add(m.id);
        coverageMarkersRef.current.push(m);
        added++;
      }
    }
    if (added > 0) {
      buildOrderedCoverage(coverageMarkersRef.current);
    }
  }

  // Small LRU cache for bbox responses to avoid duplicate work while panning
  const bboxCacheRef = useRef<Map<string, any>>(new Map());

  // Zoom thresholds
  const LINES_MIN_ZOOM = 10; // show street-view polylines at/after this zoom
  const POINTS_MIN_ZOOM = 10; // start showing individual pano points & interactions

  // Coverage visible strictly below 11
  const coverageShouldShow = (z: number) => z < 12;

  // --- Animated dash for coverage ribbon ---

  /* ---------- Ordering helpers ---------- */
  function naturalKey(keySource?: string) {
    if (!keySource) return [""];
    return keySource
      .toLowerCase()
      .split(/(\d+)/)
      .map((piece) => (/\d+/.test(piece) ? Number(piece) : piece));
  }
  function rebuildCoverageFromMarkers() {
    if (!map || !coverageLayerRef.current) return;
    const z = map.getView()?.getZoom?.() ?? 10;
    if (!coverageShouldShow(z)) return;

    const src = coverageLayerRef.current.getSource();
    if (!src) return;

    // ONE feature per sequence (MultiLineString) -> tiny feature count
    const maxHop = maxHopForZoom(map);
    const bySeq: Record<string, number[][][]> = {};

    for (const [seqKey, orderedIds] of Object.entries(
      coverageSequenceToOrderedIdsRef.current
    )) {
      let seg: number[][] = [];
      let prev: Marker | null = null;

      const flush = () => {
        if (seg.length > 1) (bySeq[seqKey] ||= []).push(seg);
        seg = [];
      };

      for (const id of orderedIds) {
        const idx = coverageIdToOrderedIndexRef.current[id];
        if (idx == null) continue;
        const m = coverageMarkersRef.current[idx];
        if (!m) continue;

        if (prev) {
          const hop = metersBetween(prev, m);
          if (hop > maxHop) flush();
        }
        seg.push(fromLonLat([m.longitude, m.latitude]) as number[]);
        prev = m;
      }
      flush();
    }

    src.clear(true);
    const features: Feature<MultiLineString>[] = [];
    for (const [seqKey, segs] of Object.entries(bySeq)) {
      if (!segs.length) continue;
      const geom = new MultiLineString(segs as [number, number][][]);
      const f = new Feature<MultiLineString>({ geometry: geom });
      f.set("sequence", seqKey);
      features.push(f);
    }
    if (features.length) src.addFeatures(features);

    coverageLayerRef.current.changed();
  }

  function rebuildLinesFromMarkers() {
    if (!map) return;

    const lineSrc = linesLayerRef.current?.getSource();
    if (!lineSrc) return;

    lineSrc.clear(true);

    const maxHopMeters = maxHopForZoom(map);

    for (const [sequenceKey, orderedIds] of Object.entries(
      sequenceToOrderedIdsRef.current
    )) {
      let segmentCoords: [number, number][] = [];
      let previousMarker: Marker | null = null;

      const flush = () => {
        if (segmentCoords.length > 1) {
          const geom = new LineString(segmentCoords);
          const fLine = new Feature<LineString>({ geometry: geom });
          fLine.set("sequence", sequenceKey);
          lineSrc.addFeature(fLine);
        }
        segmentCoords = [];
      };

      for (const markerId of orderedIds) {
        const orderedIndex = idToOrderedIndexRef.current[markerId];
        if (orderedIndex == null) continue;
        const marker = orderedMarkersRef.current[orderedIndex];
        if (!marker) continue;

        if (previousMarker) {
          const hop = metersBetween(previousMarker, marker);
          if (hop > maxHopMeters) flush();
        }

        segmentCoords.push(
          fromLonLat([marker.longitude, marker.latitude]) as [number, number]
        );
        previousMarker = marker;
      }
      flush();
    }
  }

  function tryNaturalOrder(a: Marker, b: Marker) {
    const keyA = naturalKey(a.imagePath || a.name || a.id);
    const keyB = naturalKey(b.imagePath || b.name || b.id);
    for (let index = 0; index < Math.max(keyA.length, keyB.length); index++) {
      const partA = keyA[index],
        partB = keyB[index];
      if (partA === partB) continue;
      if (partA === undefined) return -1;
      if (partB === undefined) return 1;
      if (typeof partA === "number" && typeof partB === "number")
        return partA - partB;
      return String(partA).localeCompare(String(partB));
    }
    return 0;
  }

  function spatialOrder(markers: Marker[]): Marker[] {
    if (markers.length <= 2) return markers.slice();
    const points = markers.map((marker) => ({
      marker,
      proj: fromLonLat([marker.longitude, marker.latitude]) as [number, number],
    }));

    let startIndex = 0,
      bestSum = Number.POSITIVE_INFINITY;
    for (let k = 0; k < points.length; k++) {
      const sum = points[k].proj[0] + points[k].proj[1];
      if (sum < bestSum) {
        bestSum = sum;
        startIndex = k;
      }
    }

    const usedFlags = new Array(points.length).fill(false);
    const order: Marker[] = [];
    let currentIndex = startIndex;

    for (let step = 0; step < points.length; step++) {
      usedFlags[currentIndex] = true;
      order.push(points[currentIndex].marker);

      let nextIndex = -1,
        bestDist2 = Number.POSITIVE_INFINITY;
      const [cx, cy] = points[currentIndex].proj;

      for (let k = 0; k < points.length; k++) {
        if (usedFlags[k]) continue;
        const [x, y] = points[k].proj;
        const dist2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (dist2 < bestDist2) {
          bestDist2 = dist2;
          nextIndex = k;
        }
      }
      if (nextIndex === -1) break;
      currentIndex = nextIndex;
    }
    return order;
  }

 function orderSequenceMarkers(sequenceMarkers: Marker[]): Marker[] {
  // 1) Prefer true drive order from timestamps
  const hasAllCapturedAt = sequenceMarkers.every(
    (m: any) => typeof m.capturedAt === "number"
  );
  if (hasAllCapturedAt) {
    return sequenceMarkers
      .slice()
      .sort((a: any, b: any) => a.capturedAt - b.capturedAt);
  }

  // 2) Fallback: numeric token in imagePath/name/id (often frame-like)
  const num = (m: Marker) => {
    const s = m.imagePath || (m as any).name || m.id;
    const match = s?.match(/(\d{3,})/);
    return match ? Number(match[1]) : NaN;
  };
  const hasNums = sequenceMarkers.every((m) => !Number.isNaN(num(m)));
  if (hasNums) return sequenceMarkers.slice().sort((a, b) => num(a) - num(b));

  // 3) Last resort: original heuristic
  return (function originalHeuristic(seq: Marker[]) {
    const natural = seq.slice().sort(tryNaturalOrder);

    function median(values: number[]) {
      const sorted = values.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    const hopSteps: number[] = [];
    for (let i = 1; i < natural.length; i++) {
      const dx = natural[i].longitude - natural[i - 1].longitude;
      const dy = natural[i].latitude - natural[i - 1].latitude;
      hopSteps.push(Math.hypot(dx, dy));
    }
    const spreadLon =
      Math.max(...seq.map((m) => m.longitude)) - Math.min(...seq.map((m) => m.longitude));
    const spreadLat =
      Math.max(...seq.map((m) => m.latitude)) - Math.min(...seq.map((m) => m.latitude));
    const spatialSpread = Math.hypot(spreadLon, spreadLat) || 1e-6;
    const medianHop = hopSteps.length ? median(hopSteps) : 0;

    return medianHop <= spatialSpread / 8 ? natural : spatialOrder(seq);
  })(sequenceMarkers);
}


  function buildOrdered(markerList: Marker[]) {
    const bySequence: Record<string, Marker[]> = {};
    for (const marker of markerList) {
      (bySequence[normalizeSequence(marker.sequence)] ||= []).push(marker);
    }

    const sequenceToIds: Record<string, string[]> = {};
    const ordered: Marker[] = [];

    for (const [sequenceKey, sequenceMarkers] of Object.entries(bySequence)) {
      const orderedSeq = orderSequenceMarkers(sequenceMarkers);
      sequenceToIds[sequenceKey] = orderedSeq.map((marker) => marker.id);
      ordered.push(...orderedSeq);
    }

    const idToIndex: Record<string, number> = {};
    ordered.forEach((marker, index) => (idToIndex[marker.id] = index));

    orderedMarkersRef.current = ordered;
    idToOrderedIndexRef.current = idToIndex;
    sequenceToOrderedIdsRef.current = sequenceToIds;
  }

  function buildOrderedCoverage(markerList: Marker[]) {
    const bySeq: Record<string, Marker[]> = {};
    for (const m of markerList) {
      (bySeq[normalizeSequence(m.sequence)] ||= []).push(m);
    }

    const seqToIds: Record<string, string[]> = {};
    const ordered: Marker[] = [];

    for (const [seqKey, seqMarkers] of Object.entries(bySeq)) {
      const orderedSeq = orderSequenceMarkers(seqMarkers);
      seqToIds[seqKey] = orderedSeq.map((m) => m.id);
      ordered.push(...orderedSeq);
    }

    const idToIdx: Record<string, number> = {};
    ordered.forEach((m, i) => (idToIdx[m.id] = i));

    coverageMarkersRef.current = ordered;
    coverageIdToOrderedIndexRef.current = idToIdx;
    coverageSequenceToOrderedIdsRef.current = seqToIds;
  }

  /* ---------- Styling / neon pulse ---------- */
  const COLOR_NORMAL = { r: 0, g: 188, b: 212 };
  const COLOR_ACTIVE = { r: 255, g: 59, b: 48 };
  const rgba = (r: number, g: number, b: number, a: number) =>
    `rgba(${r},${g},${b},${a})`;

  const pulseValueRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  /** Drives the red active marker animation (and subtle line/halo breathing) */
  function startNeonPulse() {
    if (rafIdRef.current) return;
    const t0 = performance.now();

    const loop = (now: number) => {
      // stop if no active feature
      if (!activeFeatureRef.current) {
        stopNeonPulse();
        return;
      }

      const periodMs = 1200;
      const phase = ((now - t0) % periodMs) / periodMs;
      const s = Math.sin(phase * Math.PI); // 0..1..0
      pulseValueRef.current = s * s;

      // only the points layer needs repaint
      pointsLayerRef.current?.changed();
      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
  }

  function stopNeonPulse() {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pulseValueRef.current = 0;
  }

  const getResolutionBin = (
    resolution: number
  ): "far" | "mid" | "near" | "very" =>
    resolution > 30
      ? "far"
      : resolution > 10
      ? "mid"
      : resolution > 3
      ? "near"
      : "very";

const LINE_PARAMS = {
  far:  { glow: 4.5, inner: 1.6, glowAlpha: 0.18, innerAlpha: 0.85 },
  mid:  { glow: 6.0, inner: 2.2, glowAlpha: 0.22, innerAlpha: 0.92 },
  near: { glow: 8.0, inner: 3.0, glowAlpha: 0.26, innerAlpha: 1.00 },
  very: { glow: 9.0, inner: 3.8, glowAlpha: 0.30, innerAlpha: 1.00 },
} as const;

  const POINT_PARAMS = {
    far: { radius: 1.0, halo: 2.5, haloAlpha: 0.1 },
    mid: { radius: 1.5, halo: 3.5, haloAlpha: 0.14 },
    near: { radius: 3.0, halo: 5.0, haloAlpha: 0.18 },
    very: { radius: 4.0, halo: 6.0, haloAlpha: 0.22 },
  } as const;

  const lineStyleCacheRef = useRef<Record<string, Style[]>>({});
  const pointStyleCacheRef = useRef<{
    normal: Record<string, Style[]>;
    hover: Record<string, Style[]>;
    active: Record<string, Style[]>;
    pending: Record<string, Style[]>;
  }>({ normal: {}, hover: {}, active: {}, pending: {} });

function makeLineStyles(
  bin: "far" | "mid" | "near" | "very",
  colorRGBA: (a: number) => string
): Style[] {
  const p = LINE_PARAMS[bin];

  // FAR/MID: add subtle halo + core so lines aren’t washed out when zoomed out
  if (bin === "far" || bin === "mid") {
    const halo = new Style({
      stroke: new Stroke({
        color: colorRGBA(bin === "far" ? p.glowAlpha * 0.7 : p.glowAlpha),
        width: bin === "far" ? p.glow * 1.8 : p.glow * 1.6,
        lineCap: "round",
        lineJoin: "round",
      }),
    });

    const inner = new Style({
      stroke: new Stroke({
        color: colorRGBA(bin === "far" ? Math.min(1, p.innerAlpha * 0.9) : p.innerAlpha),
        width: bin === "far" ? p.inner + 0.4 : p.inner + 0.6,
        lineCap: "round",
        lineJoin: "round",
      }),
    });

    const whiteCore = new Style({
      stroke: new Stroke({
        color: "rgba(255,255,255,0.55)",
        width: 1, // thin crisp center
        lineCap: "round",
        lineJoin: "round",
      }),
    });

    return [halo, inner, whiteCore];
  }

  // NEAR/VERY: full stack = outer halo + glow + dark underlay + colored inner + white core
  const outerHalo = new Style({
    stroke: new Stroke({
      color: colorRGBA(p.glowAlpha * 0.5),
      width: p.glow * 2.2,
      lineCap: "round",
      lineJoin: "round",
    }),
  });

  const glow = new Style({
    stroke: new Stroke({
      color: colorRGBA(p.glowAlpha),
      width: p.glow * 1.3,
      lineCap: "round",
      lineJoin: "round",
    }),
  });

  // Contrast underlay helps on satellite/light tiles
  const darkUnderlay = new Style({
    stroke: new Stroke({
      color: "rgba(0,0,0,0.18)",
      width: p.inner + 2,
      lineCap: "round",
      lineJoin: "round",
    }),
  });

  const coloredInner = new Style({
    stroke: new Stroke({
      color: colorRGBA(p.innerAlpha),
      width: p.inner,
      lineCap: "round",
      lineJoin: "round",
    }),
  });

  const whiteCore = new Style({
    stroke: new Stroke({
      color: "rgba(255,255,255,0.85)",
      width: Math.max(1, p.inner * 0.45),
      lineCap: "round",
      lineJoin: "round",
    }),
  });

  return [outerHalo, glow, darkUnderlay, coloredInner, whiteCore];
}
function makePointStyles(
  bin: "far" | "mid" | "near" | "very",
  variant: "normal" | "hover" | "active" | "pending"
): Style[] {
  // Keep your pending look
  if (variant === "pending") {
    return [
      new Style({
        image: new CircleStyle({
          radius:
            bin === "far" ? 1 : bin === "mid" ? 1.5 : bin === "near" ? 2.5 : 3,
          fill: new Fill({ color: "#ffffff1a" }),
          stroke: new Stroke({ color: "#9aa0a633", width: 0.8 }),
        }),
      }),
    ];
  }

  const param = POINT_PARAMS[bin];

  // === NEW: transparency policy ===
  // Active: unchanged (bright + animated)
  // Hover/Normal: heavily dimmed but still hit-testable
  const isActive = variant === "active";
  const isHover = variant === "hover";

  // Dimming factors for non-active points
  const DIM = {
    fill: isHover ? 0.10 : 0.06,      // inner dot
    stroke: isHover ? 0.22 : 0.14,    // edge stroke (keeps hit detection)
    halo: isHover ? 0.10 : 0.06,      // outer/inner glow
    ring: isHover ? 0.18 : 0.12,      // outer ring stroke
  };
// Scales for non-active points
  const variantScale = isActive ? 1.9 : isHover ? 1.15 : .50;
  const baseColor = isActive ? COLOR_ACTIVE : COLOR_NORMAL;

  const baseRadius = param.radius * variantScale;
  const haloRadius = param.halo * (isActive ? 1.75 : variantScale);
  const edgeWidth = isActive ? 1.8 : 1.2; // keep >=1px for reliable hit tests

  // Dot (center)
  const dotFill = isActive
    ? "#ffffffb0"
    : `rgba(255,255,255,${DIM.fill})`;

  const dotStrokeRGBA = isActive
    ? rgba(baseColor.r, baseColor.g, baseColor.b, 1)
    : rgba(baseColor.r, baseColor.g, baseColor.b, DIM.stroke);

  const dotStyle = new Style({
    image: new CircleStyle({
      radius: baseRadius,
      fill: new Fill({ color: dotFill }),
      stroke: new Stroke({ color: dotStrokeRGBA, width: edgeWidth }),
    }),
    zIndex: isActive ? 1000 : 0,
  });

  if (bin === "far") {
    // Far zoom: just a tiny faint dot
    return [dotStyle];
  }

  // Outer glow (very faint for non-active)
  const outerGlowAlpha = isActive ? 0.28 : DIM.halo;
  const innerGlowAlpha = isActive ? 0.22 : DIM.halo;

  const outerGlowStyle = new Style({
    image: new CircleStyle({
      radius: haloRadius * 1.35,
      fill: new Fill({
        color: rgba(baseColor.r, baseColor.g, baseColor.b, outerGlowAlpha),
      }),
    }),
    zIndex: isActive ? 998 : 0,
  });

  const innerGlowStyle = new Style({
    image: new CircleStyle({
      radius: haloRadius,
      fill: new Fill({
        color: rgba(baseColor.r, baseColor.g, baseColor.b, innerGlowAlpha),
      }),
    }),
    zIndex: isActive ? 999 : 0,
  });

  // Ring (keep very subtle for non-active)
  const ringAlpha = isActive ? 0.75 : DIM.ring;
  const ringStyle = new Style({
    image: new CircleStyle({
      radius: haloRadius * 1.85,
      fill: new Fill({ color: "rgba(255,255,255,0.0)" }),
      stroke: new Stroke({
        color: rgba(baseColor.r, baseColor.g, baseColor.b, ringAlpha),
        width: isActive ? 1.6 : 1.2,
      }),
    }),
    zIndex: isActive ? 1001 : 1,
  });

  return isActive
    ? [outerGlowStyle, innerGlowStyle, ringStyle, dotStyle]
    : [outerGlowStyle, innerGlowStyle, dotStyle];
}


  function styleForPoint(feature: any, resolution: number) {
    const bin = getResolutionBin(resolution);
    const isHover = !!feature.get("hover");
    const isActive = !!feature.get("active");
    const isPending = !!feature.get("pending");

    const bucket = isPending
      ? pointStyleCacheRef.current.pending
      : isActive
      ? pointStyleCacheRef.current.active
      : isHover
      ? pointStyleCacheRef.current.hover
      : pointStyleCacheRef.current.normal;

    if (!bucket[bin]) {
      bucket[bin] = makePointStyles(
        bin,
        isPending
          ? "pending"
          : isActive
          ? "active"
          : isHover
          ? "hover"
          : "normal"
      );
    }
    const styles = bucket[bin];
    // 🔴 Animate ONLY the active point (and only when near/very so it's visible)
    if (!isPending && isActive && (bin === "near" || bin === "very")) {
      const param = POINT_PARAMS[bin];
      const base = COLOR_ACTIVE;

      const baseRadius = param.radius * 1.9; // active scale
      const haloBase = param.halo * 1.75;

      const pf = pulseValueRef.current;
      const inflate = 1 + 0.4 * pf;
      const innerInflate = 1 + 0.18 * pf;

      if (styles.length >= 3) {
        const outerGlowImg = styles[0].getImage() as CircleStyle;
        const innerGlowImg = styles[1].getImage() as CircleStyle;
        const dotImg = styles[styles.length - 1].getImage() as CircleStyle;

        outerGlowImg.setRadius(haloBase * 1.35 * inflate);
        innerGlowImg.setRadius(haloBase * inflate);
        dotImg.setRadius(baseRadius * innerInflate);

        const outerAlpha = Math.max(
          0.05,
          param.haloAlpha * 0.9 * (0.85 + 0.35 * pf)
        );
        const innerAlpha = Math.min(
          1,
          param.haloAlpha * 1.2 * (0.85 + 0.35 * pf)
        );

        (outerGlowImg.getFill() as Fill).setColor(
          rgba(base.r, base.g, base.b, outerAlpha)
        );
        (innerGlowImg.getFill() as Fill).setColor(
          rgba(base.r, base.g, base.b, innerAlpha)
        );
      }

      if (styles.length >= 4) {
        const ringStyle = styles[2];
        const ringImg = ringStyle.getImage() as CircleStyle;
        ringImg.setRadius(haloBase * 1.85 * (1 + 0.55 * pf));
        const ringStroke = (ringStyle as any).getStroke?.() as
          | Stroke
          | undefined;
        if (ringStroke) {
          ringStroke.setWidth(1.6 * (1 + 0.9 * pf));
          ringStroke.setColor(
            rgba(base.r, base.g, base.b, 0.75 * (0.75 + 0.25 * pf))
          );
        }
      }
    }

    return styles;
  }

  function extentChangedSignificantly(previous: number[], next: number[]) {
    if (!previous || !next) return true;
    const [minx1, miny1, maxx1, maxy1] = previous;
    const [minx2, miny2, maxx2, maxy2] = next;
    const width = Math.max(1, maxx1 - minx1);
    const height = Math.max(1, maxy1 - miny1);
    const dx = Math.abs(minx2 - minx1) + Math.abs(maxx2 - maxx1);
    const dy = Math.abs(miny2 - miny1) + Math.abs(maxy2 - maxy1);
    return dx > 0.1 * width || dy > 0.1 * height;
  }

  function showUnavailableToast(message: string, coord?: [number, number]) {
    if (!map) return;
    if (!overlayElRef.current) {
      const element = document.createElement("div");
      element.style.cssText = `
        padding:8px 12px;
        background:#111a;
        color:#fff;
        backdrop-filter:saturate(180%) blur(6px);
        border-radius:10px;
        font-size:13px;
        max-width:280px;
        line-height:1.2;
        text-align:center;
        pointer-events:none;
        box-shadow:0 6px 20px rgba(0,0,0,0.25);
      `;
      overlayElRef.current = element;
    }
    overlayElRef.current.textContent =
      message || "Street View isn’t available here. Try nearby roads.";

    if (!overlayRef.current) {
      overlayRef.current = new Overlay({
        element: overlayElRef.current,
        positioning: "bottom-center",
        offset: [0, -12],
        stopEvent: false,
      });
      map.addOverlay(overlayRef.current);
    }

    const position = coord ?? map.getView()?.getCenter() ?? undefined;
    overlayRef.current.setPosition(position || undefined);

    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      overlayRef.current?.setPosition(undefined);
    }, 3000);
  }

  function notifyUnavailable(reason: string, coord?: [number, number]) {
    onUnavailable?.(reason);
    showUnavailableToast(reason, coord);
  }

  /* ---------- Layers: arrow & current pano ---------- */
  function ensureArrowLayer() {
    if (arrowLayerRef.current) return;

    if (!arrowIconRef.current) {
      arrowIconRef.current = new Icon({
        src: "PanUP.png",
        scale: 0.15,
        rotation: 0,
        rotateWithView: true,
      });
    }
    arrowFeatureRef.current = new Feature<Point>({
      geometry: new Point([0, 0]),
    });
    arrowFeatureRef.current.setStyle(
      new Style({ image: arrowIconRef.current })
    );

    arrowLayerRef.current = new VectorLayer({
      source: new VectorSource({
        features: [arrowFeatureRef.current],
        wrapX: false,
      }),
      properties: { name: "direction-arrow" },
      zIndex: 2200,
    });
    map.addLayer(arrowLayerRef.current);
  }

  function ensureCurrentPanoLayer() {
    if (currentPanoLayerRef.current) return;

    const brightDot = new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: "#ffffff" }),
        stroke: new Stroke({
          color: rgba(COLOR_NORMAL.r, COLOR_NORMAL.g, COLOR_NORMAL.b, 1),
          width: 2,
        }),
      }),
    });
    const halo = new Style({
      image: new CircleStyle({
        radius: 12,
        fill: new Fill({
          color: rgba(COLOR_NORMAL.r, COLOR_NORMAL.g, COLOR_NORMAL.b, 0.25),
        }),
      }),
    });

    currentPanoFeatureRef.current = new Feature<Point>({
      geometry: new Point([0, 0]),
    });
    currentPanoFeatureRef.current.setStyle([halo, brightDot]);

    currentPanoLayerRef.current = new VectorLayer({
      source: new VectorSource({
        features: [currentPanoFeatureRef.current],
        wrapX: false,
      }),
      properties: { name: "current-pano-marker" },
      zIndex: 2300,
    });
    map.addLayer(currentPanoLayerRef.current);
  }

  function setArrowRotationOnMap(
    longitude: number,
    latitude: number,
    bearingDeg: number
  ) {
    ensureArrowLayer();
    const ICON_HEADING_OFFSET_DEG = 0;
    const viewRotationRadians = map.getView()?.getRotation?.() ?? 0; // radians
    const rotationRadians =
      ((bearingDeg + ICON_HEADING_OFFSET_DEG) * Math.PI) / 180 -
      viewRotationRadians;

    const style = arrowFeatureRef.current!.getStyle() as Style;
    (style.getImage() as Icon).setRotation(rotationRadians);
    arrowFeatureRef.current!.setGeometry(
      new Point(fromLonLat([longitude, latitude]) as [number, number])
    );
  }

  function updateCurrentPanoMarker(longitude: number, latitude: number) {
    ensureCurrentPanoLayer();
    currentPanoFeatureRef.current!.setGeometry(
      new Point(fromLonLat([longitude, latitude]) as [number, number])
    );
    const styles = currentPanoFeatureRef.current!.getStyle() as Style[] | Style;
    const styleArray = Array.isArray(styles) ? styles : [styles];
    if (styleArray.length >= 2) {
      const halo = (styleArray[0] as Style).getImage() as CircleStyle;
      const dot = (styleArray[1] as Style).getImage() as CircleStyle;
      //const pulse = 1 + 0.25 * pulseValueRef.current;
      //halo.setRadius(12 * pulse);
      //dot.setRadius(6 * (1 + 0.1 * pulseValueRef.current));
      halo.setRadius(12);
      dot.setRadius(6);
    }
  }

  /* ---------- Highlight helpers ---------- */
  function clearActive() {
    if (!pointsLayerRef.current || !activeFeatureRef.current) return;
    activeFeatureRef.current.set("active", false);
    activeFeatureRef.current = null;
    pointsLayerRef.current.changed();
    stopNeonPulse();
  }

  function highlightMarkerById(id: string) {
    if (!pointsLayerRef.current) return;
    const pointSource = pointsLayerRef.current.getSource();
    if (!pointSource) return;
    clearActive();
    const feature = pointSource.getFeatureById(id) as Feature<Point> | null;
    if (!feature) return;
    feature.set("active", true);
    activeFeatureRef.current = feature;
    pointsLayerRef.current.changed();
    startNeonPulse();
  }

  /* ---------- Public helper: highlight nearest ---------- */
  async function highlightNearestAtLevel13() {
    if (!map) return;
    const view = map.getView?.();
    if (!view) return;

    if (!markersRef.current.length) {
      pendingHighlightRef.current = true;
    }

    await new Promise<void>((resolve) => {
     // view.animate({ zoom: 14, duration: 250 }, () => resolve());
    });

    const centerCoord = view.getCenter?.();
    if (!centerCoord || !markersRef.current.length) {
      notifyUnavailable("No nearby Street View points to highlight.");
      return;
    }

    let bestIndex = 0;
    let bestDistance2 = Number.POSITIVE_INFINITY;

    for (let index = 0; index < markersRef.current.length; index++) {
      const marker = markersRef.current[index];
      const projected = fromLonLat([marker.longitude, marker.latitude]) as [
        number,
        number
      ];
      const dx = projected[0] - (centerCoord[0] as number);
      const dy = projected[1] - (centerCoord[1] as number);
      const dist2 = dx * dx + dy * dy;
      if (dist2 < bestDistance2) {
        bestDistance2 = dist2;
        bestIndex = index;
      }
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        goToPanoIndex(bestIndex, {
          center: true,
          animateMs: 100,
          keepZoom: true,
        }).catch(() => {});
      }, 80);
    });
  }

  /* ---------- Direction helper ---------- */
  function forwardBearingFor(marker: Marker): number {
    const sequenceKey = normalizeSequence(marker.sequence);
    let nearest: Marker | null = null;
    let best = Infinity;
    for (const cand of markersRef.current) {
      if (cand.id === marker.id) continue;
      if (normalizeSequence(cand.sequence) !== sequenceKey) continue;
      const d = metersBetween(marker, cand);
      if (d < best) {
        best = d;
        nearest = cand;
      }
    }

    if (!nearest) {
      // 2) nearest overall
      for (const cand of markersRef.current) {
        if (cand.id === marker.id) continue;
        const d = metersBetween(marker, cand);
        if (d < best) {
          best = d;
          nearest = cand;
        }
      }
    }

    return nearest ? bearingDegrees(marker, nearest) : 0;
  }

  const removeMarkerFromMap = (id: string) => {
    const pointSource = pointsLayerRef.current?.getSource?.();
    const feature = pointSource?.getFeatureById(id);
    if (feature) pointSource!.removeFeature(feature as any);

    if (currentMarkerIdRef.current === id) {
      clearActive();
      currentMarkerIdRef.current = null;
      arrowFeatureRef.current?.setGeometry(null as any);
      currentPanoFeatureRef.current?.setGeometry(null as any);
    }

    const removeIndex = markersRef.current.findIndex(
      (marker) => marker.id === id
    );
    if (removeIndex !== -1) markersRef.current.splice(removeIndex, 1);

    // No filtering: all remaining markers are drawable
    buildOrdered(markersRef.current);
    // Always try to rebuild coverage (it will no-op if zoom >= LINES_MIN_ZOOM)
    rebuildCoverageFromMarkers();

    // Rebuild lines only at/above the threshold
    if ((map.getView()?.getZoom?.() ?? 0) >= LINES_MIN_ZOOM) {
      rebuildLinesFromMarkers();
    }
    // Persist the linearized, ordered list for VR next/prev
try {
  // Use your computed order (keeps the drive direction consistent)
  const orderedForVR = orderedMarkersRef.current.map((m) => ({
    id: m.id,
    imagePath: m.imagePath || "",
    lat: m.latitude,
    lon: m.longitude,
    sequence: m.sequence,
  }));
  if (orderedForVR.length) {
    savePanoSequence(orderedForVR);
  }
} catch {}

  };

  function neighborLinksFor(marker: Marker): Link[] {
  const out: Link[] = [];
  const sequenceKey = normalizeSequence(marker.sequence);
  const ids = sequenceToOrderedIdsRef.current[sequenceKey] || [];
  const pos = ids.indexOf(marker.id);

  const push = (adj: Marker, rel: "prev" | "next") =>
    out.push({
      targetId: adj.id,
      yaw: bearingDegrees(marker, adj),
      latitude: adj.latitude,
      longitude: adj.longitude,
      imagePath: adj.imagePath,
      rel,
    });

  if (pos > 0) {
    const prevId = ids[pos - 1];
    const prev =
      orderedMarkersRef.current[idToOrderedIndexRef.current[prevId]];
    if (prev) push(prev, "prev");
  }
  if (pos !== -1 && pos < ids.length - 1) {
    const nextId = ids[pos + 1];
    const next =
      orderedMarkersRef.current[idToOrderedIndexRef.current[nextId]];
    if (next) push(next, "next");
  }
  return out;
}


  /* ---------- Fetch & open pano ---------- */

  async function fetchPanoBlobAnyVariant(
    imagePath: string,
    signal?: AbortSignal
  ): Promise<Blob | null> {
//const baseURL = "https://api.neomaps.com";
   const { baseURL, contractId, accessToken } = getAuth();
    if (!baseURL) return null;
    for (const url of buildImageUrls(baseURL, imagePath)) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "image/*",
            "X-Client-Type": "Web",
           "X-Contract-Id": contractId,
           Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
          signal,
        });
        if (response.ok) return await response.blob();
        if (response.status >= 400 && response.status < 500) continue;
      } catch {}
    }
    return null;
  }

  const coveragePrefetchedRef = useRef(false);

  async function fetchCoverageTile(
    minLon: number,
    minLat: number,
    maxLon: number,
    maxLat: number
  ): Promise<Marker[]> {
    const { baseURL, contractId, accessToken } = getAuth();
   //const baseURL = "https://api.neomaps.com";
    const pageSize = 1000;
    let page = 1;
    const collected: Marker[] = [];

    for (;;) {
      const resp = await fetch(
        "/api/neomaps/api/v1/PanoramaPoi/GetPanoramaPoiByBoundingBox",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Client-Type": "Web",
            "X-Contract-Id": contractId,
           Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            boundingBox: {
              minLatitude: minLat,
              maxLatitude: maxLat,
              minLongitude: minLon,
              maxLongitude: maxLon,
            },
            bufferMeters: 0,
            pagination: { pageNumber: page, pageSize },
          }),
        }
      );

      if (!resp.ok) break;

      const json = await resp.json();
      const items: Marker[] = (json?.value?.items ?? []).filter(
        (v: any) =>
          v &&
          typeof v.id === "string" &&
          typeof v.latitude === "number" &&
          typeof v.longitude === "number"
      );

      if (!items.length) break;
      collected.push(...items);
      if (items.length < pageSize) break; // last page
      page++;
    }
    return collected;
  }
 
  async function prefetchCoverageAllOnce() {
    if (coveragePrefetchedRef.current) return;
    coveragePrefetchedRef.current = true;

    const [EXT_MIN_LON, EXT_MIN_LAT, EXT_MAX_LON, EXT_MAX_LAT] =
      COVERAGE_EXTENT;

    // 0) Prime current view quickly (one small block)
    try {
      const b = getMapFormattedBounds(map);
      const first = await fetchCoverageTile(
        b.minLng,
        b.minLat,
        b.maxLng,
        b.maxLat
      );
      mergeCoverageMarkers(first);
      rebuildCoverageFromMarkers(); // immediate first paint
    } catch {}

    // 1) Try ONE BIG CALL first (if API allows big pageSize)
    try {
      const big = await fetchCoverageTile(
        EXT_MIN_LON,
        EXT_MIN_LAT,
        EXT_MAX_LON,
        EXT_MAX_LAT
      );
      if (big.length > 0) {
        mergeCoverageMarkers(big);
        rebuildCoverageFromMarkers(); // single big draw
        return; // success, we're done
      }
    } catch {
      // fall through to tiling
    }

    // 2) Fallback: tile the world / configured extent with concurrency
    const TILE = COVERAGE_TILE_DEG; // e.g., 0.5; increase to 1 or 2 to reduce calls
    const tiles: Array<[number, number, number, number]> = [];
    for (let lon = EXT_MIN_LON; lon < EXT_MAX_LON; lon += TILE) {
      for (let lat = EXT_MIN_LAT; lat < EXT_MAX_LAT; lat += TILE) {
        const minLon = lon;
        const maxLon = Math.min(lon + TILE, EXT_MAX_LON);
        const minLat = lat;
        const maxLat = Math.min(lat + TILE, EXT_MAX_LAT);
        tiles.push([minLon, minLat, maxLon, maxLat]);
      }
    }

    // Put the current viewport tiles first to prioritize local results
    const v = getMapFormattedBounds(map);
    tiles.sort((a, b) => {
      const cx = (v.minLng + v.maxLng) / 2,
        cy = (v.minLat + v.maxLat) / 2;
      const ax = (a[0] + a[2]) / 2,
        ay = (a[1] + a[3]) / 2;
      const bx = (b[0] + b[2]) / 2,
        by = (b[1] + b[3]) / 2;
      const da = (ax - cx) ** 2 + (ay - cy) ** 2;
      const db = (bx - cx) ** 2 + (by - cy) ** 2;
      return da - db;
    });

    // Concurrency control
    const CONCURRENCY = 6; // try 6–12 depending on your API limits
    for (let i = 0; i < tiles.length; i += CONCURRENCY) {
      const batch = tiles.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(([minLon, minLat, maxLon, maxLat]) =>
          fetchCoverageTile(minLon, minLat, maxLon, maxLat)
        )
      );

      const toMerge: Marker[] = [];
      for (const r of results) {
        if (r.status === "fulfilled" && r.value?.length) {
          toMerge.push(...r.value);
        }
      }
      if (toMerge.length) {
        mergeCoverageMarkers(toMerge);
        // draw once per batch so it feels like “big chunks” arriving
        scheduleCoverageRebuild(0);
      }
    }
  }

  const loadPanoFromMarker = async (marker: Marker, index: number) => {
  const imagePath = marker.imagePath ?? "";
  if (!imagePath) {
    console.error("🗺️ Missing imagePath");
    return;
  }

    try {
      panoFetchAbortRef.current?.abort();
      const abortController = new AbortController();
      panoFetchAbortRef.current = abortController;
      const myNavSeq = ++navigationSequenceCounterRef.current;

      const blob = await fetchPanoBlobAnyVariant(
        imagePath,
        abortController.signal
      );
      if (!blob || blob.size < 64) throw new Error("Empty blob");

      const objectUrl = URL.createObjectURL(blob);
      if (myNavSeq !== navigationSequenceCounterRef.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      if (lastPanoUrlRef.current) {
        try {
          URL.revokeObjectURL(lastPanoUrlRef.current);
        } catch {}
      }
      lastPanoUrlRef.current = objectUrl;

      const hotspotLinks = neighborLinksFor(marker);
      setPanoramaImageUrl(objectUrl, index, markersRef.current, hotspotLinks);
    } catch {
      removeMarkerFromMap(marker.id);
      const coord = fromLonLat([marker.longitude, marker.latitude]) as [
        number,
        number
      ];
      notifyUnavailable(
        "This point has an unsupported/invalid panorama.",
        coord
      );
    }
  };

  /* ============================================================
     Central navigation helper (sequence-aware + geodesic arrow)
     ============================================================ */
  const goToPanoIndex = async (index: number, opts: NavOpts = {}) => {
    if (!map) return;
    if (index < 0 || index >= markersRef.current.length) return;

    const marker = markersRef.current[index];

    currentMarkerIdRef.current = marker.id;
    highlightMarkerById(marker.id);
    updateCurrentPanoMarker(marker.longitude, marker.latitude);

    if (opts.center) {
      const view = map.getView?.();
      if (view) {
        const projected = fromLonLat([marker.longitude, marker.latitude]) as [
          number,
          number
        ];
        view.animate({ center: projected, duration: opts.animateMs ?? 350 });
      }
    }

    const directionYaw = forwardBearingFor(marker);
    setArrowRotationOnMap(marker.longitude, marker.latitude, directionYaw);

    if (!opts.moveOnly) {
      await loadPanoFromMarker(marker, index);
    }
  }; // 👈 End of goToPanoIndex

  // ✅ Add this helper function right AFTER goToPanoIndex
  const goToPanoId = async (id: string, opts: NavOpts = {}) => {
    const idx = findIndexById(id);
    if (idx !== -1) await goToPanoIndex(idx, opts);
  };

  /* ----------- Finders ----------- */
  const findIndexById = (id: string) =>
    markersRef.current.findIndex((m) => m.id === id);

  const normalizePath = (path?: string) =>
    (path || "").trim().toLowerCase().replace(/\\/g, "/");

  const findIndexByImagePath = (imagePath?: string) => {
    if (!imagePath) return -1;
    const needle = normalizePath(imagePath);
    return markersRef.current.findIndex(
      (marker) =>
        normalizePath(marker.imagePath) === needle ||
        normalizePath(marker.imagePath || "").endsWith(needle)
    );
  };

  const findNearestIndexTo = (lat: number, lon: number) => {
    if (!markersRef.current.length) return -1;
    let bestIndex = -1;
    let bestDist2 = Number.POSITIVE_INFINITY;
    for (let i = 0; i < markersRef.current.length; i++) {
      const marker = markersRef.current[i];
      const dx = marker.longitude - lon;
      const dy = marker.latitude - lat;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        bestIndex = i;
      }
    }
    return bestIndex;
  };

  /* ----------- Public API selectors ----------- */
  const selectMarkerById = async (id: string, opts: NavOpts = {}) => {
    const index = findIndexById(id);
    if (index === -1) return;
    await goToPanoIndex(index, {
      center: opts.center ?? true,
      animateMs: opts.animateMs ?? 250,
      keepZoom: true,
      moveOnly: opts.moveOnly,
    });
  };

  const selectMarkerByImagePath = async (
    imagePath?: string,
    opts: NavOpts = {}
  ) => {
    if (!imagePath) return;
    const index = findIndexByImagePath(imagePath);
    if (index === -1) return;
    await goToPanoIndex(index, {
      center: opts.center ?? true,
      animateMs: opts.animateMs ?? 250,
      keepZoom: true,
      moveOnly: opts.moveOnly,
    });
  };

  const selectMarkerByLocation = async (
    lat: number,
    lon: number,
    opts: NavOpts = {}
  ) => {
    const index = findNearestIndexTo(lat, lon);
    if (index === -1) return;
    await goToPanoIndex(index, {
      center: opts.center ?? true,
      animateMs: opts.animateMs ?? 250,
      keepZoom: true,
      moveOnly: opts.moveOnly,
    });
  };

  /* ---------- Next/Prev (sequence-aware + fallback) ---------- */
 const handleNextPano = async () => {
  if (!isPanoOpen) return;
  const currentId = currentMarkerIdRef.current;
  if (!currentId) return;

  const current = markersRef.current.find((m) => m.id === currentId);
  if (!current) return;

  const seqKey = normalizeSequence(current.sequence);
  const ids = sequenceToOrderedIdsRef.current[seqKey] || [];
  const pos = ids.indexOf(currentId);
  if (pos !== -1 && pos < ids.length - 1) {
    const nextId = ids[pos + 1];
    await goToPanoId(nextId, { center: true, animateMs: 250, keepZoom: true });
  }
};

const handlePreviousPano = async () => {
  if (!isPanoOpen) return;
  const currentId = currentMarkerIdRef.current;
  if (!currentId) return;

  const current = markersRef.current.find((m) => m.id === currentId);
  if (!current) return;

  const seqKey = normalizeSequence(current.sequence);
  const ids = sequenceToOrderedIdsRef.current[seqKey] || [];
  const pos = ids.indexOf(currentId);
  if (pos > 0) {
    const prevId = ids[pos - 1];
    await goToPanoId(prevId, { center: true, animateMs: 250, keepZoom: true });
  }
};


  /* ---------- Pulse lifecycle ---------- */
  useEffect(() => {
    if (!map || !enabled) stopNeonPulse();
    return () => stopNeonPulse();
  }, [map, enabled]);

  useEffect(() => {
    if (map && enabled) {
      prefetchCoverageAllOnce(); // fills coverage store with ALL API data
    }
  }, [map, enabled]);

  const FIXED_TARGET = { lat: 26.4793296, lon: 50.1190171 };
  const FIXED_ZOOM = 8;
  // --- coverage prefetch configuration ---
  const COVERAGE_EXTENT = (
    process.env.NEXT_PUBLIC_COVERAGE_EXTENT ?? "-180,-85,180,85"
  )
    .split(",")
    .map(Number) as [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

  // smaller tile => more calls, better completeness
  const COVERAGE_TILE_DEG = 0.5;

  /* ---------- Toggle on/off handling ---------- */
  useEffect(() => {
    const wasEnabled = prevEnabledRef.current;
    prevEnabledRef.current = enabled;

    if (!map) return;

    if (!wasEnabled && enabled) {
      pendingHighlightRef.current = true;

      const view = map.getView?.();
      if (view) {
        const center = fromLonLat([FIXED_TARGET.lon, FIXED_TARGET.lat]) as [
          number,
          number
        ];
        view.animate({ center, zoom: FIXED_ZOOM, duration: 350 });
      }

      selectMarkerByLocation(FIXED_TARGET.lat, FIXED_TARGET.lon, {
        center: true,
        animateMs: 300,
        keepZoom: true,
      });
    }
    if (wasEnabled && !enabled) {
      clearActive();
      pendingHighlightRef.current = false;

      if (currentPanoLayerRef.current) {
        map.removeLayer(currentPanoLayerRef.current);
        currentPanoLayerRef.current = null;
        currentPanoFeatureRef.current = null;
      }
      if (arrowLayerRef.current) {
        map.removeLayer(arrowLayerRef.current);
        arrowLayerRef.current = null;
        arrowFeatureRef.current = null;
      }
    }
  }, [enabled, map]);

  /* ---------- Main effect: layers, interactions, fetching ---------- */
  useEffect(() => {
    if (!map || !enabled) {
      if (selectRef.current) {
        map.removeInteraction(selectRef.current);
        selectRef.current = null;
      }
      if (hoverSelectRef.current) {
        map.removeInteraction(hoverSelectRef.current);
        hoverSelectRef.current = null;
      }

      if (pointsLayerRef.current) {
        map.removeLayer(pointsLayerRef.current);
        pointsLayerRef.current = null;
      }
      if (linesLayerRef.current) {
        map.removeLayer(linesLayerRef.current);
        linesLayerRef.current = null;
      }
      if (currentPanoLayerRef.current) {
        map.removeLayer(currentPanoLayerRef.current);
        currentPanoLayerRef.current = null;
        currentPanoFeatureRef.current = null;
      }
      if (arrowLayerRef.current) {
        map.removeLayer(arrowLayerRef.current);
        arrowLayerRef.current = null;
        arrowFeatureRef.current = null;
      }

      if (overlayRef.current) {
        map.removeOverlay(overlayRef.current);
        overlayRef.current = null;
      }
      if (toastTimer.current) {
        window.clearTimeout(toastTimer.current);
        toastTimer.current = null;
      }

      if (lastPanoUrlRef.current) {
        URL.revokeObjectURL(lastPanoUrlRef.current);
        lastPanoUrlRef.current = null;
      }
      if (coverageLayerRef.current) {
        map.removeLayer(coverageLayerRef.current);
        coverageLayerRef.current = null;
      }

      bboxRequestAbortRef.current?.abort();
      bboxRequestAbortRef.current = null;

      lastExtentRef.current = null;
      featureByIdRef.current = {};
      markersRef.current = [];
      orderedMarkersRef.current = [];
      idToOrderedIndexRef.current = {};
      sequenceToOrderedIdsRef.current = {};
      bboxCacheRef.current.clear();
      return;
    }

    // Ensure base layers
    if (!pointsLayerRef.current) {
      pointsLayerRef.current = new VectorImageLayer({
        source: new VectorSource<OLFeature<Geometry>>({ wrapX: false }),
        style: (feature: any, resolution: number) =>
          styleForPoint(feature, resolution),
        imageRatio: 2,
        renderBuffer: 16,
        declutter: false,
        properties: { name: "pano-points" },
        renderOrder: undefined,
        zIndex: 2100,
      });
      map.addLayer(pointsLayerRef.current);
    }
    if (!linesLayerRef.current) {
      linesLayerRef.current = new VectorImageLayer({
        source: new VectorSource<OLFeature<Geometry>>({ wrapX: false }),
        style: (_feature: any, resolution: number) => {
          const bin = getResolutionBin(resolution);
          const cacheKey = `lines:${bin}`;
          if (!lineStyleCacheRef.current[cacheKey]) {
            const colorRGBA = (a: number) =>
              rgba(COLOR_NORMAL.r, COLOR_NORMAL.g, COLOR_NORMAL.b, a);
            lineStyleCacheRef.current[cacheKey] = makeLineStyles(
              bin,
              colorRGBA
            );
          }
          // No animation or per-frame mutation — just return cached styles
          return lineStyleCacheRef.current[cacheKey];
        },
        imageRatio: 1.5,
        renderBuffer: 32,
        declutter: false,
        properties: { name: "pano-lines" },
        renderOrder: undefined,
        zIndex: 2000,
      });
      map.addLayer(linesLayerRef.current);
    }

    if (!coverageLayerRef.current) {
      coverageLayerRef.current = new VectorImageLayer({
        source: new VectorSource<OLFeature<Geometry>>({ wrapX: false }),
        style: () => {
          const z = map.getView()?.getZoom?.() ?? 10;
          return coverageFillStyleForZoom(z);
        },
        imageRatio: 1.5,
        renderBuffer: 64,
        declutter: false,
        properties: { name: "pano-coverage" },
        zIndex: 1985, // below your line layer (e.g., 2000) and points (2100)
      });

      // make it non-clickable for any generic hit-tests
      coverageLayerRef.current.set("neo_ignoreClicks", true);

      map.addLayer(coverageLayerRef.current);
      rebuildCoverageFromMarkers(); // <-- draw what's in the coverage store now

      // keep stroke width responsive to zoom + enforce visibility band (4..11)
      const v = map.getView();
      const syncCoverage = () => {
        const z = v.getZoom() ?? 10;
        const visible = coverageShouldShow(z);
        coverageLayerRef.current!.setVisible(visible);
        coverageLayerRef.current!.changed(); // refresh stroke width
      };
      syncCoverage();
      v.on("change:resolution", syncCoverage);
    }
async function postJsonWithRetry<T>(
  url: string,
  body: any,
  headers: Record<string, string>,
  opts?: { signal?: AbortSignal; retries?: number; backoffMs?: number; shrinkOnce?: boolean }
): Promise<T | null> {
  const retries = opts?.retries ?? 2;          // total attempts = retries+1
  const backoff = opts?.backoffMs ?? 350;
  const signal = opts?.signal;
  const shrinkOnce = opts?.shrinkOnce ?? true;

  let attempt = 0;
  let payload = body;

  while (true) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
      });

      if (resp.ok) {
        try {
          return (await resp.json()) as T;
        } catch {
          return null; // empty body or invalid JSON
        }
      }

      // Retry only for 5xx and 429
      if ([500, 502, 503, 504, 429].includes(resp.status)) {
        if (attempt < retries) {
          // optional one-time page shrink on the first failure
          if (shrinkOnce && attempt === 0) {
            const p = payload?.pagination;
            if (p?.pageSize && p.pageSize > 200) {
              payload = {
                ...payload,
                pagination: { ...p, pageSize: Math.max(200, Math.floor(p.pageSize * 0.5)) },
              };
            }
          }
          await new Promise(res => setTimeout(res, backoff * Math.pow(1.6, attempt)));
          attempt++;
          continue;
        }
        return null;
      }

      // Non-retryable (4xx except 429)
      return null;
    } catch (e: any) {
      if (e?.name === "AbortError") return null; // canceled by us
      if (attempt < retries) {
        await new Promise(res => setTimeout(res, backoff * Math.pow(1.6, attempt)));
        attempt++;
        continue;
      }
      return null;
    }
  }
}

    const buildOrUpdateLayers = async () => {
      try {
        const view = map.getView();
        const mapSize = map.getSize?.();
        if (!mapSize) return;

        const zoom = view.getZoom?.() ?? 0;

        // Interactions toggle (dynamic with zoom)
        const wantInteractions = zoom >= POINTS_MIN_ZOOM;
        if (hoverSelectRef.current && !wantInteractions) {
          map.removeInteraction(hoverSelectRef.current);
          hoverSelectRef.current = null;
        }
        if (selectRef.current && !wantInteractions) {
          map.removeInteraction(selectRef.current);
          selectRef.current = null;
        }
        if (!hoverSelectRef.current && wantInteractions) {
          hoverSelectRef.current = new Select({
            condition: pointerMove,
            layers: (layer) => layer === pointsLayerRef.current,
            style: undefined,
          });
          hoverSelectRef.current.on("select", (event) => {
            event.deselected.forEach((feature) => feature.set("hover", false));
            event.selected.forEach((feature) => feature.set("hover", true));
            pointsLayerRef.current?.changed();
          });
          map.addInteraction(hoverSelectRef.current);
        }
        if (!selectRef.current && wantInteractions) {
          selectRef.current = new Select({
            condition: click,
            layers: (layer) => layer === pointsLayerRef.current,
            multi: false,
            hitTolerance: 5,
          });
          selectRef.current.on("select", async (event) => {
            const feature = event.selected[0];
            if (!feature) return;
            if (feature.get("pending")) return;

            const featureId = feature.getId();
            if (typeof featureId !== "string") return;
            const id = featureId;

            const index = markersRef.current.findIndex(
              (marker) => marker.id === id
            );
            if (index === -1) return;

            currentMarkerIdRef.current = markersRef.current[index].id;
            await goToPanoIndex(index, {
              center: true,
              animateMs: 250,
              keepZoom: true,
            });
          });
          map.addInteraction(selectRef.current);
        }

        // Very far out: hide everything
        if (zoom < LINES_MIN_ZOOM) {
          pointsLayerRef.current?.setVisible(false);
          linesLayerRef.current?.setVisible(false);
        } else {
          pointsLayerRef.current?.setVisible(true);
          linesLayerRef.current?.setVisible(true);
        }

        const showPoints = zoom >= POINTS_MIN_ZOOM;

        const extentNow = view.calculateExtent(mapSize);
        if (
          lastExtentRef.current &&
          !extentChangedSignificantly(
            lastExtentRef.current,
            extentNow as number[]
          )
        ) {
          return;
        }
        lastExtentRef.current = extentNow as [number, number, number, number];

        bboxRequestAbortRef.current?.abort();
        const bboxAbortController = new AbortController();
        bboxRequestAbortRef.current = bboxAbortController;

        const bounds = getMapFormattedBounds(map);

        const pageSize =
          zoom >= 16 ? 2000 : zoom >= 14 ? 1500 : zoom >= 10 ? 1000 : 800;
    const { baseURL, contractId, accessToken } = getAuth();
if (!baseURL) {
          console.error(" NEXT_PUBLIC_BASE_URL is not defined");
  return;
}

        // -------- 1) Fetch candidates with small LRU bbox cache --------
        const viewCenter = view.getCenter() ?? [0, 0];
        const lruKey = `${Math.round(
          (viewCenter[0] as number) / 64
        )}:${Math.round((viewCenter[1] as number) / 64)}:z${Math.round(zoom)}`;
        let apiData: any;

        if (bboxCacheRef.current.has(lruKey)) {
          apiData = bboxCacheRef.current.get(lruKey);
        } else {
const url = `/api/neomaps/api/v1/PanoramaPoi/GetPanoramaPoiByBoundingBox`;
const body = {
    boundingBox: {
      minLatitude: bounds.minLat,
      maxLatitude: bounds.maxLat,
      minLongitude: bounds.minLng,
      maxLongitude: bounds.maxLng,
    },
    bufferMeters: 0,
    pagination: { pageNumber: 1, pageSize }, // your current pageSize calc
  };
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
   "X-Client-Type": "Web",
    "X-Contract-Id": contractId,
   Authorization: `Bearer ${accessToken}`,
  };
  // ✅ no throw — resilient fetch
  apiData = await postJsonWithRetry<any>(url, body, headers, {
    signal: bboxAbortController.signal,
    retries: 2,        // total attempts: 3
    backoffMs: 400,
    shrinkOnce: true,  // first retry halves pageSize (min 200)
  });

  if (apiData) {
    bboxCacheRef.current.set(lruKey, apiData);
    console.log( apiData);
    // LRU trim
    if (bboxCacheRef.current.size > 10) {
      const firstKey = bboxCacheRef.current.keys().next().value as string | undefined;
      if (firstKey !== undefined) bboxCacheRef.current.delete(firstKey);
    }
  } else {
    // Graceful fallback: keep UI alive using prior cache if present
    // (no-op; just proceed with empty items below)
  }
}
        // --- Type guard ---
        const isMarker = (value: any): value is Marker =>
          !!value &&
          typeof value.id === "string" &&
          typeof value.latitude === "number" &&
          typeof value.longitude === "number";

        const candidates: Marker[] = (
          (apiData?.value?.items ?? []) as unknown[]
        ).filter(isMarker);

        const pointSource = pointsLayerRef.current!.getSource()!;
        const freshIds = new Set(candidates.map((candidate) => candidate.id));

        // prune stale features
        pointSource.getFeatures().forEach((feature) => {
          const featureId = feature.getId();
          if (typeof featureId !== "string") return;
          const id = featureId;
          if (!freshIds.has(id)) {
            pointSource.removeFeature(feature);
            delete featureByIdRef.current[id];
            const removeIndex = markersRef.current.findIndex(
              (marker) => marker.id === id
            );
            if (removeIndex !== -1) markersRef.current.splice(removeIndex, 1);
          }
        });
        if (!showPoints) {
          pointSource.clear(true);
          featureByIdRef.current = {};
          buildOrdered(markersRef.current);
          rebuildLinesFromMarkers();
          //   return;
        } else {
          for (const marker of candidates) {
            // add feature if missing
            if (!featureByIdRef.current[marker.id]) {
              const coordinate = fromLonLat([
                marker.longitude,
                marker.latitude,
              ]) as [number, number];
              const feature = new Feature<Point>({
                geometry: new Point(coordinate),
              });
              feature.setId(marker.id);
              featureByIdRef.current[marker.id] = feature;
              pointSource.addFeature(feature);
            } else {
              // update coordinates if changed
              const feature = featureByIdRef.current[marker.id];
              const geometry = feature.getGeometry() as Point;
              const targetCoordinate = fromLonLat([
                marker.longitude,
                marker.latitude,
              ]) as [number, number];
              geometry.setCoordinates(targetCoordinate);
            }
            // mark as drawable (no "pending")
            const feature = featureByIdRef.current[marker.id];
            feature.set("pending", false);
            feature.changed();

            // add to markersRef if new
            if (!markersRef.current.find((listed) => listed.id === marker.id)) {
              markersRef.current.push(marker);
            }
          }
        }
        // 4) Order + lines (for *all* markers; no filtering)
        buildOrdered(markersRef.current);
        // Rebuild coverage ALWAYS (it has its own zoom band 4..11)
        rebuildCoverageFromMarkers();

        // Rebuild lines ONLY if we’re at/above lines min zoom
        if ((map.getView()?.getZoom?.() ?? 0) >= LINES_MIN_ZOOM) {
          rebuildLinesFromMarkers();
        }

        // 5) Auto-highlight once ready
        if (pendingHighlightRef.current && markersRef.current.length) {
          pendingHighlightRef.current = false;
          setTimeout(() => {
            selectMarkerByLocation(FIXED_TARGET.lat, FIXED_TARGET.lon, {
              center: true,
              animateMs: 250,
              keepZoom: true,
            });
          }, 100);
        }

        if (!markersRef.current.length) {
          notifyUnavailable(
            "Street View isn’t available in this area. Try nearby streets."
          );
        }
      } catch (error: any) {
        if (error?.name === "AbortError") return;
        console.error("Error loading markers:", error);
      }
    };

    /* ---------- Debounced moveend ---------- */
    const moveEndHandler = () => {
      if (moveEndTimer.current) window.clearTimeout(moveEndTimer.current);
      moveEndTimer.current = window.setTimeout(buildOrUpdateLayers, 350);
    };
    map.on("moveend", moveEndHandler);

    /* Initial build */
    buildOrUpdateLayers();

    /* Cleanup */
    return () => {
      map.un("moveend", moveEndHandler);
      if (moveEndTimer.current) {
        window.clearTimeout(moveEndTimer.current);
        moveEndTimer.current = null;
      }
      if (hoverSelectRef.current) {
        map.removeInteraction(hoverSelectRef.current);
        hoverSelectRef.current = null;
      }
      if (selectRef.current) {
        map.removeInteraction(selectRef.current);
        selectRef.current = null;
      }
    };
  }, [map, enabled, setPanoramaImageUrl, isPanoOpen, currentPanoIndex]);

  // --- public API ---
  return {
    handleNextPano,
    handlePreviousPano,
    highlightNearestAtLevel13,
    selectMarkerById,
    selectMarkerByImagePath,
    selectMarkerByLocation,
  };
}
