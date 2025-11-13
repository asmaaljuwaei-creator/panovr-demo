"use client";

import "ol/ol.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import PanPad from "./PanPad";
import RightRailControls from "./RightRailControls";
import VrSettingsPanel from "./VrSettingsPanel";

/* --- Three.js shims (older libs expect these) --- */
const ThreeAny: any = THREE as any;
if (
  ThreeAny?.Material &&
  typeof ThreeAny.Material.prototype.onBuild !== "function"
) {
  ThreeAny.Material.prototype.onBuild = function () {};
}
const BufferGeometryPrototype: any = (THREE as any).BufferGeometry?.prototype;
if (BufferGeometryPrototype && !BufferGeometryPrototype.removeAttribute) {
  BufferGeometryPrototype.removeAttribute = function (name: string) {
    return this.deleteAttribute(name);
  };
}

/* ===================== Types ===================== */
export interface Link {
  targetId: string;
  yaw: number; // degrees 0..360
  pitch?: number;
  label?: string;
  iconUrl?: string;
  latitude?: number;
  longitude?: number;
  imagePath?: string;
}
// ===== Array-driven sequence (shared with map) =====
interface PanoItem {
  id: string;
  imagePath: string;
  lat?: number;
  lon?: number;
  sequence?: string;
}

const SEQ_KEY = "neo:panos:sequence:v1";
const SEQ_IDX_KEY = "neo:panos:index:v1";

function loadPanoSequence(): { list: PanoItem[]; idx: Record<string, number> } {
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

// --- helper: read A/B across varying mappings ---
function readABFromRightGp(gp: Gamepad) {
  const btns = gp.buttons || [];
  // Try common Oculus mappings in order of likelihood
  const candidates: [number, number][] = [
    [0, 1], // many Quest builds: A,B
    [4, 5], // some builds / polyfills: A,B
    [1, 2], // occasional variant
  ];

  for (const [ai, bi] of candidates) {
    const a = !!(btns[ai] && btns[ai].pressed);
    const b = !!(btns[bi] && btns[bi].pressed);
    // If either is present on this candidate, trust this pair
    if (btns[ai] || btns[bi]) return { a, b };
  }

  // Fallback: treat any two smallest indices (excluding trigger/grip) as A/B
  // Skip index 0/1 if they look like trigger/grip with heavy analog value
  const actives = btns
    .map((b, i) => ({ i, v: (typeof b.value === "number" ? b.value : (b.pressed ? 1 : 0)) }))
    .filter(x => x.v !== undefined && x.i <= 7); // keep first few buttons only
  // Prefer digital-ish presses
  const pressed = actives.filter(x => (gp.buttons[x.i]?.pressed));
  if (pressed.length >= 2) {
    const [aIdx, bIdx] = pressed.slice(0, 2).map(x => x.i);
    return { a: true, b: true, aIdx, bIdx };
  }
  // Otherwise just report none
  return { a: false, b: false };
}


export type CubeImages =
  | { type: "cube"; images: [string, string, string, string, string, string] }
  | { type: "cube"; blobs: [Blob, Blob, Blob, Blob, Blob, Blob] };

interface PanoramaVRProps {
  src: string | Blob | CubeImages;
  links: Link[];
  isFullscreen: boolean;
  dir?: "rtl" | "ltr";
  lang?: string;
  currentLonLat?: [number, number]; // [lon, lat]

  onClose: () => void;
  onNavigate: (
    targetId: string,
    meta?: { lat?: number; lon?: number; imagePath?: string }
  ) => void;
  onToggleFullscreen: () => void;

  compassIconUrl?: string;
  zoomPlusIconUrl?: string;
  zoomMinusIconUrl?: string;

  northOffsetDeg?: number;

  panUpIconUrl?: string;
  panLeftIconUrl?: string;
  panRightIconUrl?: string;
  panDownIconUrl?: string;

  userLonLat?: [number, number]; // [lon, lat]
  miniMapZoom?: number; // ignored; we pin to 17

  panSettingsIconUrl?: string;
  vrSettingsIconUrl?: string;

  startYawDeg?: number;
  currentId?: string;
  onNext?: () => void;
  coordinateOrder?: "lonlat" | "latlon";
  resolveImagePath?: (imagePath: string) => Promise<string>; // returns blob: URL
}
type LL = [number, number]; // [lon, lat]
/* ===================== RTL helpers ===================== */
function useIsRTL(dir?: "ltr" | "rtl", lang?: string) {
  const infer = (l?: string) => {
    const r = (l || "").toLowerCase();
    return (
      r.startsWith("ar") ||
      r.startsWith("he") ||
      r.startsWith("fa") ||
      r.startsWith("ur")
    );
  };
  const htmlDir = (typeof document !== "undefined" ? document?.dir : "") as
    | "ltr"
    | "rtl"
    | "";
  return (dir || htmlDir || (infer(lang) ? "rtl" : "ltr")) === "rtl";
}
const lr = <T,>(ltr: T, rtl: T, isRTL: boolean) => (isRTL ? rtl : ltr);
function logicalSides(
  startKey: "left" | "right",
  value: number | string,
  isRTL: boolean
) {
  return isRTL
    ? { [startKey === "left" ? "right" : "left"]: value }
    : { [startKey]: value };
}
const originStart = (isRTL: boolean, vertical: "top" | "bottom" = "bottom") =>
  `${vertical} ${isRTL ? "right" : "left"}`;

/* ===================== Math helpers ===================== */
const norm360 = (d: number) => ((d % 360) + 360) % 360;

function decideByYaw(
  yawDeg: number,
  hasNext: boolean,
  hasPrev: boolean
): "forward" | "back" | null {
  // Primary rule
  const want = yawDeg < 180 ? "forward" : "back";
  // Respect availability
  if (want === "forward" && hasNext) return "forward";
  if (want === "back" && hasPrev) return "back";
  // Fallbacks if the desired direction is missing
  if (hasNext) return "forward";
  if (hasPrev) return "back";
  return null;
}

function normalizeLL(
  p: [number, number],
  order: "lonlat" | "latlon"
): [number, number] {
  return order === "lonlat" ? p : [p[1], p[0]];
}
/* ===================== Tunables ===================== */
const FOV_MIN = 30;
const FOV_MAX = 90;
const FOV_STEP = 5;
const FOV_DAMP = 0.15;

const PAD_STEP_DEG = 18;

const INFOSPOT_RADIUS = 1000;
const FLOOR_Y = -INFOSPOT_RADIUS * 0.35;
const ENABLE_LASERS = false; // Set to true to enable lasers (may cause lag with many hotspots)
const LASER_UPDATE_INTERVAL_MS = 100; // Update lasers every 100ms instead of every frame
/* ===================== Image helpers ===================== */
async function loadImageMeta(url: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    if (!url.startsWith("blob:")) image.crossOrigin = "anonymous";
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = url;
  });
}

type LiveSrc = string | [string, string, string, string, string, string];

async function validatePanorama(src: LiveSrc) {
  if (typeof src === "string") {
    const { width, height } = await loadImageMeta(src);
    if (!width || !height)
      return { ok: false as const, reason: "Couldn’t read image size." };
    return { ok: true as const };
  } else {
    if (src.length !== 6)
      return { ok: false as const, reason: "Cube map must have 6 faces." };
    const metas = await Promise.all(src.map(loadImageMeta));
    if (metas.some((m) => !m.width || !m.height))
      return {
        ok: false as const,
        reason: "Failed to read one or more cube faces.",
      };
    const s = metas[0].width;
    const allSquareEqual = metas.every(
      (m) => m.width === m.height && m.width === s
    );
    if (!allSquareEqual)
      return {
        ok: false as const,
        reason: "All cube faces must be square and equal.",
      };
    return { ok: true as const };
  }
}

function isCubeImages(x: unknown): x is CubeImages {
  return (
    !!x &&
    typeof x === "object" &&
    (x as any).type === "cube" &&
    (Array.isArray((x as any).images) || Array.isArray((x as any).blobs))
  );
}
function isBlob(x: unknown): x is Blob {
  return typeof Blob !== "undefined" && x instanceof Blob;
}
const isHttp = (u: string) => /^https?:\/\//i.test(u);
const looksRelative = (u: string) =>
  typeof u === "string" && !isBlob(u) && !isHttp(u);

async function adoptToLocalSrc(
  input: string | Blob | CubeImages,
  previousBlobUrl: string | null,
  revokeUrl: (urlToRevoke: string) => void
): Promise<LiveSrc> {
  const adoptOne = async (v: string | Blob): Promise<string> => {
    if (isBlob(v)) {
      const u = URL.createObjectURL(v);
      if (previousBlobUrl?.startsWith("blob:")) revokeUrl(previousBlobUrl);
      return u;
    }
    if (typeof v === "string" && v.startsWith("blob:")) {
      const resp = await fetch(v);
      const copy = await resp.blob();
      const u = URL.createObjectURL(copy);
      if (previousBlobUrl?.startsWith("blob:")) revokeUrl(previousBlobUrl);
      return u;
    }
    return v as string;
  };
  if (isCubeImages(input)) {
    const faces = "images" in input ? input.images : input.blobs;
    const urls = await Promise.all(faces.map(adoptOne));
    return urls as [string, string, string, string, string, string];
  }
  return adoptOne(input as string | Blob);
}

/* ===================== Fullscreen helpers ===================== */
function enterFullscreen(element: HTMLElement) {
  const anyElement = element as any;
  (
    anyElement.requestFullscreen ||
    anyElement.webkitRequestFullscreen ||
    anyElement.msRequestFullscreen ||
    anyElement.mozRequestFullScreen
  )?.call(anyElement, { navigationUI: "hide" });
}
function exitFullscreen() {
  const docAny: any = document;
  (
    document.exitFullscreen ||
    docAny.webkitExitFullscreen ||
    docAny.msExitFullscreen ||
    docAny.mozCancelFullScreen
  )?.call(document);
}
function isFullscreenNow() {
  const docAny: any = document;
  return !!(
    document.fullscreenElement ||
    docAny.webkitFullscreenElement ||
    docAny.msFullscreenElement ||
    docAny.mozFullScreenElement
  );
}

/* ===================== Next/Prev picking ===================== */
function pickNextPrevLinear(links: Link[]) {
  const next = (links as any).find((l: any) => l.rel === "next");
  const prev = (links as any).find((l: any) => l.rel === "prev");
  return { next, prev };
}

function pickNextPrevStable(
  links: Link[],
  here?: [number, number],
  dirHint?: [number, number] | null,
  last?: { nextId?: string; prevId?: string }
) {
  if (!here)
    return {
      next: undefined as Link | undefined,
      prev: undefined as Link | undefined,
    };
  const withGps = links.filter(
    (l) => l.longitude != null && l.latitude != null
  );
  if (!withGps.length) return { next: undefined, prev: undefined };

  const k = Math.max(1e-9, Math.cos((here[1] * Math.PI) / 180));
  const vecs = withGps.map((l) => {
    const dx = ((l.longitude as number) - here[0]) * k;
    const dy = (l.latitude as number) - here[1];
    return { link: l, dx, dy, r2: dx * dx + dy * dy };
  });

  let vx = 0,
    vy = 0;
  if (dirHint && (dirHint[0] || dirHint[1])) {
    const len = Math.hypot(dirHint[0], dirHint[1]) || 1;
    vx = dirHint[0] / len;
    vy = dirHint[1] / len;
  } else {
    for (const v of vecs) {
      vx += v.dx;
      vy += v.dy;
    }
    const len = Math.hypot(vx, vy) || 1;
    vx /= len;
    vy /= len;
  }

  const proj = vecs.map((v) => ({ ...v, t: v.dx * vx + v.dy * vy }));
  const r = Math.sqrt(
    proj.reduce((s, p) => s + p.r2, 0) / Math.max(1, proj.length)
  );
  const MIN_T = Math.max(1e-6, 0.08 * r);

  const forward = proj
    .filter((p) => p.t > +MIN_T)
    .sort((a, b) => a.t - b.t || a.r2 - b.r2);
  const backward = proj
    .filter((p) => p.t < -MIN_T)
    .sort((a, b) => b.t - a.t || a.r2 - b.r2);

  let next = forward[0]?.link;
  let prev = backward[0]?.link;

  if (!next && last?.nextId) {
    const keep = links.find((l) => l.targetId === last.nextId);
    const p = keep && proj.find((p) => p.link.targetId === keep.targetId);
    if (p && p.t > -MIN_T) next = keep;
  }
  if (!prev && last?.prevId) {
    const keep = links.find((l) => l.targetId === last.prevId);
    const p = keep && proj.find((p) => p.link.targetId === keep.targetId);
    if (p && p.t < +MIN_T) prev = keep;
  }

  if (!next)
    next = proj
      .filter((p) => p.t > 0)
      .sort((a, b) => a.t - b.t || a.r2 - b.r2)[0]?.link;
  if (!prev)
    prev = proj
      .filter((p) => p.t < 0)
      .sort((a, b) => b.t - a.t || a.r2 - b.r2)[0]?.link;

  if (next && prev && next.targetId === prev.targetId) {
    const alt =
      backward.find((p) => p.link.targetId !== next!.targetId)?.link ??
      forward.find((p) => p.link.targetId !== prev!.targetId)?.link;
    if (alt) {
      const ap = proj.find((p) => p.link.targetId === alt.targetId)!;
      if (ap.t > 0) prev = alt;
      else next = alt;
    }
  }

  return { next, prev };
}
function nearestLinks(
  links: Link[],
  here: [number, number] | undefined,
  k = 5
): Link[] {
  if (!here) return [];
  const withGps = links.filter(
    (l) => l.longitude != null && l.latitude != null && !!l.imagePath
  );
  if (!withGps.length) return [];
  const kcos = Math.max(1e-9, Math.cos((here[1] * Math.PI) / 180));
  // Sort by squared distance on a local-mercator-ish plane
  return withGps
    .map((l) => {
      const dx = ((l.longitude as number) - here[0]) * kcos;
      const dy = (l.latitude as number) - here[1];
      return { l, r2: dx * dx + dy * dy };
    })
    .sort((a, b) => a.r2 - b.r2)
    .slice(0, k)
    .map((x) => x.l);
}

// ==== Lightweight pano cache & helpers (module-scope) ====
type CachedItem = { url: string; bitmap?: ImageBitmap; lastUsed: number };
const PANO_CACHE = new Map<string, CachedItem>();
const CACHE_LIMIT = 8;

function touchCache(key: string) {
  const it = PANO_CACHE.get(key);
  if (it) it.lastUsed = performance.now();
}
function evictLRU() {
  if (PANO_CACHE.size <= CACHE_LIMIT) return;
  let oldestKey: string | null = null;
  let oldest = Infinity;
  for (const [k, v] of PANO_CACHE) {
    if (v.lastUsed < oldest) {
      oldest = v.lastUsed;
      oldestKey = k;
    }
  }
  if (oldestKey) {
    try {
      const v = PANO_CACHE.get(oldestKey);
      if (v?.url?.startsWith("blob:")) URL.revokeObjectURL(v.url);
    } catch {}
    PANO_CACHE.delete(oldestKey);
  }
}

export async function preloadPanorama(
  urlOrBlob: string | Blob
): Promise<string> {
  const key =
    typeof urlOrBlob === "string" ? urlOrBlob : `blob:${urlOrBlob as any}`;
  const hit = PANO_CACHE.get(key);
  if (hit) {
    touchCache(key);
    return hit.url;
  }

  let localUrl: string;

  if (isBlob(urlOrBlob)) {
    // Blob already available
    localUrl = URL.createObjectURL(urlOrBlob);
  } else if (typeof urlOrBlob === "string" && urlOrBlob.startsWith("blob:")) {
    // clone existing blob URL
    const resp = await fetch(urlOrBlob);
    const copy = await resp.blob();
    localUrl = URL.createObjectURL(copy);
  } else if (typeof urlOrBlob === "string" && isHttp(urlOrBlob)) {
    // normal HTTP(S) resource — safe to fetch
    const resp = await fetch(urlOrBlob, { cache: "force-cache" });
    const blob = await resp.blob();
    localUrl = URL.createObjectURL(blob);
  } else if (typeof urlOrBlob === "string" && looksRelative(urlOrBlob)) {
    // The parent BaseMap will handle them using resolveImagePath + API auth
    return urlOrBlob;
  } else {
    throw new Error("Unsupported panorama source type");
  }

  // Cache result
  PANO_CACHE.set(key, { url: localUrl, lastUsed: performance.now() });
  evictLRU();
  return localUrl;
}

// Temporarily drop DPR during swaps to reduce jank
export async function withCheapDPR(
  viewer: any,
  fn: () => Promise<void> | void,
  ms = 450
) {
  const renderer = viewer?.getRenderer?.() || (viewer as any)?.renderer;
  if (!renderer?.setPixelRatio) return await fn();
  const prev = renderer.getPixelRatio?.() ?? 1;
  try {
    renderer.setPixelRatio(1.0);
    viewer.render?.();
    await fn();
  } finally {
    setTimeout(() => {
      try {
        renderer.setPixelRatio(prev);
        viewer.render?.();
      } catch {}
    }, ms);
  }
}
// ==== Background prefetch queue (limited concurrency) ====
const PREFETCH_CONCURRENCY = 2;
const PREFETCH_SET = new Set<string>(); // to avoid duplicates
let activeWorkers = 0;
const PREFETCH_Q: string[] = []; // URLs waiting

function enqueuePrefetch(url: string) {
  if (!url) return;
  if (PREFETCH_SET.has(url)) return;
  PREFETCH_SET.add(url);
  PREFETCH_Q.push(url);
  pumpPrefetch();
}

async function pumpPrefetch() {
  while (activeWorkers < PREFETCH_CONCURRENCY && PREFETCH_Q.length) {
    const next = PREFETCH_Q.shift()!;
    activeWorkers++;
    (async () => {
      try {
        // Will no-op fast if already cached
        await preloadPanorama(next);
      } catch {
      } finally {
        activeWorkers--;
        pumpPrefetch();
      }
    })();
  }
}
/** ----- XR controller tunables ----- */
const XR_DEADZONE = 0.18;
const XR_ZOOM_FOV_SPEED = 80;

/** Yaw/pitch speeds when thumbstick held fully (deg/sec) */
const XR_YAW_SPEED = 140; // horizontal look (left/right)
const XR_PITCH_SPEED = 100; // vertical look (up/down)

/** Optional snap turn on left stick (set to 0 to disable) */
const XR_SNAP_TURN_DEG = 30;
const XR_SNAP_TURN_COOLDOWN_MS = 280;

/** Thumbstick "forward/back" → navigate next/prev */
const XR_NAV_THRESH = 0.55; // push up/down farther than this to navigate
const XR_NAV_COOLDOWN_MS = 450;

type XRStick = {
  x: number;
  y: number;
  click?: boolean;
};

function xrGamepadSticks(gp?: Gamepad): { left: XRStick; right: XRStick } {
  // "xr-standard" mapping -> usually:
  // axes[0]=LS X, axes[1]=LS Y, axes[2]=RS X, axes[3]=RS Y
  // buttons[3] is often thumbstick click on Touch/Quest, but varies.
  const a = gp?.axes ?? [];
  const b = gp?.buttons ?? [];
  return {
    left: { x: a[0] ?? 0, y: a[1] ?? 0, click: !!b[3]?.pressed },
    right: { x: a[2] ?? 0, y: a[3] ?? 0, click: !!b[3]?.pressed },
  };
}

/** Apply deadzone to a value in [-1..1] */
function dz(v: number, dead = XR_DEADZONE) {
  const s = Math.sign(v),
    av = Math.abs(v);
  if (av <= dead) return 0;
  const t = (av - dead) / (1 - dead);
  return s * t;
}
/** Rotate the visible panorama while in XR */
function rotatePanorama(pano: any, dYawDeg: number, dPitchDeg: number) {
  if (!pano) return;
  // yaw (around Y), pitch (around X). Clamp pitch a bit to avoid flipping.
  pano.rotation.y += THREE.MathUtils.degToRad(dYawDeg);
  const newPitch = pano.rotation.x + THREE.MathUtils.degToRad(dPitchDeg);
  const CLAMP = THREE.MathUtils.degToRad(80); // up/down clamp
  pano.rotation.x = THREE.MathUtils.clamp(newPitch, -CLAMP, +CLAMP);
}
function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj: any) => {
    const m = obj.material;
    const g = obj.geometry;
    if (Array.isArray(m))
      m.forEach((it) => (it?.map?.dispose?.(), it?.dispose?.()));
    else m?.map?.dispose?.(), m?.dispose?.();
    g?.dispose?.();
  });
}

/* ===================== Component ===================== */
export default function PanoramaVR({
  src,
  links,
  isFullscreen,
  onClose,
  onNavigate,
  onToggleFullscreen,
  northOffsetDeg = 0,
  compassIconUrl = "/compass.png",
  zoomPlusIconUrl = "/plus.png",
  zoomMinusIconUrl = "/Minus.png",
  panUpIconUrl = "/PanUP.png",
  panLeftIconUrl = "/PanLeft.png",
  panRightIconUrl = "/PanRight.png",
  panDownIconUrl = "/PanDown.png",
  userLonLat,
  currentLonLat: currentLonLatProp,
  panSettingsIconUrl = "/move.png",
  startYawDeg = 0,
  dir,
  lang,
  currentId,
  coordinateOrder = "lonlat",
  resolveImagePath,
}: PanoramaVRProps) {
  const isRTL = useIsRTL(dir, lang);

  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const viewerRef = useRef<any>(null);
  const panoRef = useRef<any>(null);
  const panolensAPIRef = useRef<any>(null);

  const compassRotRef = useRef<HTMLDivElement | null>(null);
  const targetFovRef = useRef<number>(75);
  const rafRef = useRef<number | null>(null);
  //const xrBtnAWasDownRef = useRef(false);
  //const xrBtnBWasDownRef = useRef(false);

  const currentObjUrlRef = useRef<string | null>(null);
  const revokeQueueRef = useRef<string[]>([]);

  const [uiScale, setUiScale] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const clickCooldownRef = useRef(0);

  // Keep [lon,lat]
  const rawLonLat: [number, number] | undefined =
    currentLonLatProp ?? userLonLat ?? undefined;
  const currentLonLat: LL | undefined = rawLonLat as LL | undefined;
  const hasLonLat = !!(currentLonLat ?? userLonLat);

  const [yawDeg, setYawDeg] = useState(0);
  const yawDegStateRef = useRef(0);

  const xrBtnAWasDownRef = useRef(false);
  const xrBtnBWasDownRef = useRef(false);

  // Super-simple image prefetch cache (warms browser cache)
  const panoPrefetchCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
const linksRef = useRef<Link[]>([]);


useEffect(() => {
  linksRef.current = links || [];
}, [links]);

  async function prefetchLink(link?: {
    targetId?: string;
    imagePath?: string;
  }) {
    if (!link?.imagePath) return;
    try {
      // resolveImagePath can be undefined in your code sometimes
      const url =
        typeof resolveImagePath === "function"
          ? await resolveImagePath(link.imagePath)
          : link.imagePath;

      if (!url || panoPrefetchCacheRef.current.has(url)) return;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.src = url; // warms the HTTP cache
      panoPrefetchCacheRef.current.set(url, img);
    } catch {}
  }

  function persistPanoLocation(id?: string) {
    try {
      const c =
        viewerRef.current?.getControl?.() ||
        (viewerRef.current as any)?.controls;
      let yaw = 0;
      if (c?.getAzimuthalAngle) {
        yaw = (c.getAzimuthalAngle() * 180) / Math.PI;
        if (yaw < 0) yaw += 360;
      }
      if (id) localStorage.setItem("neo:lastPanoId", id);
      localStorage.setItem("neo:lastYaw", String(Math.round(yaw)));
    } catch {}
  }

  useEffect(() => {
    yawDegStateRef.current = yawDeg;
  }, [yawDeg]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  type ModeKey = "NORMAL" | "CARDBOARD" | "STEREO";
  const [mode, setMode] = useState<ModeKey>("NORMAL");

  const [panButtonsEnabled, setPanButtonsEnabled] = useState(false);
  const [navButtonsVisible, setNavButtonsVisible] = useState(false);

  const [xrSupported, setXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);
  const xrSessionRef = useRef<XRSession | null>(null);


  function resolveNextPrevNow(): { next?: Link; prev?: Link } {
  const L = linksRef.current || [];
  const here = currentLonLatLiveRef.current;
  // 1) Prefer explicit rel
  const byRel = pickNextPrevLinear(L);
  if (byRel.next || byRel.prev) return byRel;

  // 2) Fallback: stable picker by GPS/heading
  const st = pickNextPrevStable(L, here, forwardHintRef.current, lastPickRef.current);
  if (st.next || st.prev) return st;

  // 3) Final fallback: sequence array (works even if links are empty)
  const list = panoListRef.current;
  const idx = currentIndexRef.current;
  if (list?.length && idx >= 0) {
    const len = list.length;
    const nextItem = list[(idx + 1) % len];
    const prevItem = list[(idx - 1 + len) % len];
    const wrap = (it?: any): Link | undefined =>
      it
        ? { targetId: it.id, imagePath: it.imagePath, yaw: 0 } as unknown as Link
        : undefined;
    return { next: wrap(nextItem), prev: wrap(prevItem) };
  }

  return {};
}

  // --- [ADD A] krpano-like WebVR config + callbacks (mirrors <plugin ... on*> ---
  const webvr_onavailable = () => {
    // (Optional) you already show the Enter VR button via xrSupported + isFullscreenReal
    // Add a toast if you want: e.g., setErrorMsg("VR available");
  };
  const webvr_onunknowndevice = () => {
    // (Optional) fallback tuning for “fake/desktop” mode or cardboard profile
  };
  const webvr_onvrcontrollers = () => {
    // (Optional) show controller lasers or diagnostics when controllers appear
  };
  const webvr_onentervr = () => {
    // Hide non-VR layers, close settings panel, etc.
    setSettingsOpen(false);
    setNavButtonsVisible(false);
  };
  const webvr_onexitvr = () => {
    // Restore non-VR layers if you hid anything in onentervr
  };
  const webvr_ondenied = () => {
    setErrorMsg("Entering VR was denied.");
    // You can auto clear after a moment if you like
    setTimeout(() => setErrorMsg(null), 2500);
  };
  useEffect(() => {
    const { list, idx } = loadPanoSequence();
    panoListRef.current = list;
    idToIndexRef.current = idx;
  }, []);
  useEffect(() => {
    if (!currentId) return;
    const i = idToIndexRef.current[currentId];
    if (typeof i === "number" && i >= 0) currentIndexRef.current = i;
  }, [currentId]);

  // Convert a stored imagePath into a URL (respect your resolveImagePath)

  const goToIndex = async (i: number) => {
    const list = panoListRef.current;
    if (!list.length) return;
    const n = ((i % list.length) + list.length) % list.length; // safe wrap
    currentIndexRef.current = n;
    const target = list[n];

    // Persist last location for resilience
    try {
      localStorage.setItem("neo:lastPanoId", target.id);
    } catch {}

    // Use your existing navigateOnceRef / onNavigate pipeline
    // so the rest of the app updates currentId, src, links, etc.
    // If you have a direct route: onNavigate(target.id, {...}), use that.
    if (navigateOnceRef.current) {
      navigateOnceRef.current(target.id);
    } else if (typeof onNavigate === "function") {
      onNavigate(target.id, {
        lat: target.lat,
        lon: target.lon,
        imagePath: target.imagePath,
      });
    }
  };

  const goNext = () => {
    const i = currentIndexRef.current;
    if (i < 0) {
      // if unknown, recover by last stored id or nearest by GPS
      const last = localStorage.getItem("neo:lastPanoId");
      if (last && idToIndexRef.current[last] != null) {
        currentIndexRef.current = idToIndexRef.current[last];
        return goNext();
      }
      // fallback: pick the nearest to currentLonLat if available
      if (currentLonLatLiveRef.current) {
        const ll = currentLonLatLiveRef.current;
        const list = panoListRef.current;
        let best = -1,
          bestR2 = Infinity;
        const k = Math.max(1e-9, Math.cos(((ll[1] || 0) * Math.PI) / 180));
        list.forEach((p, idx) => {
          const dx = ((p.lon ?? 0) - (ll[0] ?? 0)) * k;
          const dy = (p.lat ?? 0) - (ll[1] ?? 0);
          const r2 = dx * dx + dy * dy;
          if (r2 < bestR2) {
            bestR2 = r2;
            best = idx;
          }
        });
        if (best >= 0) {
          currentIndexRef.current = best;
        }
      }
    }
    return goToIndex((currentIndexRef.current || 0) + 1);
  };

  const goPrev = () => {
    const i = currentIndexRef.current;
    if (i < 0) {
      const last = localStorage.getItem("neo:lastPanoId");
      if (last && idToIndexRef.current[last] != null) {
        currentIndexRef.current = idToIndexRef.current[last];
        return goPrev();
      }
      if (currentLonLatLiveRef.current) {
        const ll = currentLonLatLiveRef.current;
        const list = panoListRef.current;
        let best = -1,
          bestR2 = Infinity;
        const k = Math.max(1e-9, Math.cos(((ll[1] || 0) * Math.PI) / 180));
        list.forEach((p, idx) => {
          const dx = ((p.lon ?? 0) - (ll[0] ?? 0)) * k;
          const dy = (p.lat ?? 0) - (ll[1] ?? 0);
          const r2 = dx * dx + dy * dy;
          if (r2 < bestR2) {
            bestR2 = r2;
            best = idx;
          }
        });
        if (best >= 0) {
          currentIndexRef.current = best;
        }
      }
    }
    return goToIndex((currentIndexRef.current || 0) - 1);
  };

  // This is your “one-line” config analogue to <plugin name="webvr" ... />
  const webvr = {
    mobilevr_support: true,
    mobilevr_touch_support: true,
    mobilevr_fake_support: true,
    mobilevr_profile: {
      normal: "90|60|42|0|0|0",
      mobile: "80|60|42|35|0.441|0.156",
    },
    mobilevr_wakelock: true,
    fullscreen_mirroring: false,
    mouse_pointerlock: true,
    onavailable: webvr_onavailable,
    onunknowndevice: webvr_onunknowndevice,
    onvrcontrollers: webvr_onvrcontrollers,
    onentervr: webvr_onentervr,
    onexitvr: webvr_onexitvr,
    ondenied: webvr_ondenied,
  };

  const gazeTimerRef = useRef<number | null>(null);
  const gazeDeadlineRef = useRef<number>(0);
  const reticleRef = useRef<HTMLDivElement | null>(null);

  // XR controller cooldowns
  const xrNavCooldownUntilRef = useRef(0);
  const xrSnapCooldownUntilRef = useRef(0);

  // XR ray + hits
  const xrRaycasterRef = useRef<THREE.Raycaster | null>(null);

  // ==== VR-only hotspots (separate from normal mode) ====
  const vrHotspotGroupRef = useRef<THREE.Group | null>(null);
  // Hotspots
  const hotspotGroupRef = useRef<THREE.Group | null>(null);
  const hotspotByIdRef = useRef<Map<string, THREE.Object3D>>(new Map());

  // ===== Array-driven navigation refs =====
  const panoListRef = useRef<PanoItem[]>([]);
  const idToIndexRef = useRef<Record<string, number>>({});
  const currentIndexRef = useRef<number>(-1);

  const isImmersive = xrActive || mode === "CARDBOARD" || mode === "STEREO";

  const [liveSrc, setLiveSrc] = useState<LiveSrc>("");
  // Ray + visual helpers
  const rayRef = useRef<THREE.Ray | null>(null);
  const rayArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const rayMarkerRef = useRef<THREE.Mesh | null>(null); // shows .at() point (optional)

  // Persist yaw across navigations
  const lastYawRef = useRef<number | null>(null);
  const lastYawStoreTickRef = useRef(0);

  // Travel direction
  const lastLonLatRef = useRef<[number, number] | null>(null);
  const forwardHintRef = useRef<[number, number] | null>(null);
  const [dirVersion, setDirVersion] = useState(0);

  const rafRunningRef = useRef(false);
  const startLoopRef = useRef<() => void>(() => {});

  // ===== 3D Arrow (front/back) =====
  const arrowGroupRef = useRef<THREE.Group | null>(null);
  const arrowPickMeshRef = useRef<THREE.Mesh | null>(null); // wider, transparent hit area
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const pointerNdcRef = useRef<THREE.Vector2 | null>(null);
  const [arrowKind, setArrowKind] = useState<"forward" | "back">("forward");
  const [arrowVisible, setArrowVisible] = useState<boolean>(false);

  const fixedNavGroupRef = useRef<THREE.Group | null>(null);

  // ---- Hotspot group on the panorama (once per pano) ----
  const hotspotsGroup = useRef<THREE.Group | null>(null);

  function buildHotspots(links: Link[]) {
    if (!panoRef.current) return;

    // Remove old group
    if (hotspotsGroup.current) {
      panoRef.current.remove(hotspotsGroup.current);
    }

    const group = new THREE.Group();
    group.name = "hotspots";

    // Make a small plane per link, facing inward from the sphere
    const geom = new THREE.PlaneGeometry(80, 80, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.001, // invisible but raycastable
      depthTest: true,
      side: THREE.DoubleSide,
    });

    links.forEach((lnk) => {
      // Convert yaw/pitch (deg) to a position on unit sphere (inside)
      const yawRad = (lnk.yaw * Math.PI) / 180;
      const pitchRad = ((lnk.pitch ?? 0) * Math.PI) / 180;
      const r = 499.5; // slightly less than 500 if your pano sphere radius is 500

      const x = r * Math.cos(pitchRad) * Math.sin(yawRad);
      const y = r * -Math.sin(pitchRad);
      const z = -r * Math.cos(pitchRad) * Math.cos(yawRad);

      const m = new THREE.Mesh(geom, mat.clone());
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0); // face camera (center)
      m.userData = { type: "link", ...lnk };

      // Optional: give it a visible icon sprite for debugging
      // (comment out in production)
      // const sprite = makeIconSprite();
      // sprite.position.set(0, 0, 0.01);
      // m.add(sprite);

      group.add(m);
    });

    panoRef.current.add(group);
    hotspotsGroup.current = group;
  }

  // Call whenever the "links" prop changes:
  useEffect(() => {
    buildHotspots(links ?? []);
  }, [links]);

  /** Create VR-only hotspots from `links` and attach to current panorama.
   *  They are invisible (but ray-hittable), with optional icon if link.iconUrl exists.
   *  Call only AFTER XR session starts; remove when XR ends.
   */
  function buildFixedNavHotspots() {
    if (!panoRef.current) return;

    // Remove old group if any
    if (fixedNavGroupRef.current) {
      try {
        panoRef.current.remove(fixedNavGroupRef.current);
      } catch {}
      fixedNavGroupRef.current = null;
    }

    // Only for non-XR viewing
    if (xrActive) return;

    const g = new THREE.Group();
    g.name = "fixedNextPrevHotspots";

    const R = INFOSPOT_RADIUS * 0.92; // just inside sphere
    const size = 120; // generous hit area
    const planeGeo = new THREE.PlaneGeometry(size, size);
    const planeMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.001, // invisible but raycastable
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Helper: place a plane on inner sphere by yaw (deg), pitch (deg)
    const addAt = (yawDeg: number, pitchDeg: number, dir: "next" | "prev") => {
      const yaw = THREE.MathUtils.degToRad(
        norm360(yawDeg + (northOffsetDeg ?? 0))
      );
      const pitch = THREE.MathUtils.degToRad(pitchDeg);
      const dirVec = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
      );
      const pos = dirVec.clone().multiplyScalar(R);

      const m = new THREE.Mesh(planeGeo, planeMat.clone());
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      (m as any).userData = { type: "fixed-nav", dir };
      g.add(m);
    };

    // Fixed bearings: Next = 90°, Prev = 270°, both at pitch 0°
    addAt(90, 0, "next");
    addAt(270, 0, "prev");

    try {
      panoRef.current.add(g);
    } catch {}
    fixedNavGroupRef.current = g;
  }

  // Rebuild the fixed next/prev hotspots whenever XR state or links change
  useEffect(() => {
    buildFixedNavHotspots();
  }, [xrActive, links, northOffsetDeg]);

  function createVRHotspotsForXR(links: Link[]) {
    // remove any previous VR group
    if (vrHotspotGroupRef.current && panoRef.current) {
      try {
        panoRef.current.remove(vrHotspotGroupRef.current);
        disposeObject3D(vrHotspotGroupRef.current);
      } catch {}
    }
    const g = new THREE.Group();
    const R = INFOSPOT_RADIUS * 0.92;
    const size = 90;

    const hitGeo = new THREE.PlaneGeometry(size, size);

    for (const l of links) {
      if (typeof l.yaw !== "number") continue;

      const yawRad = THREE.MathUtils.degToRad(l.yaw);
      const pitchRad = THREE.MathUtils.degToRad(l.pitch ?? 0);
      const dir = new THREE.Vector3(
        Math.sin(yawRad) * Math.cos(pitchRad),
        Math.sin(pitchRad),
        -Math.cos(yawRad) * Math.cos(pitchRad)
      );
      const pos = dir.clone().multiplyScalar(R);

      // invisible hit plane
      const hitMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0001,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.copy(pos);
      hit.lookAt(0, 0, 0);
      hit.rotateX(THREE.MathUtils.degToRad(0.01));
      (hit as any).userData = { type: "vr-link", targetId: l.targetId };
      g.add(hit);

      // optional visible icon for VR
      if (l.iconUrl) {
        const icoGeo = new THREE.PlaneGeometry(size, size);
        const icoMat = new THREE.MeshBasicMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        // load lightly, without blocking
        new THREE.TextureLoader().load(
          l.iconUrl,
          (tx) => {
            tx.anisotropy = 4;
            icoMat.map = tx;
            icoMat.needsUpdate = true;
          },
          undefined,
          () => {}
        );
        const ico = new THREE.Mesh(icoGeo, icoMat);
        ico.position.copy(pos.clone().multiplyScalar(0.992));
        ico.lookAt(0, 0, 0);
        ico.rotateX(THREE.MathUtils.degToRad(0.01));
        (ico as any).userData = { type: "vr-link", targetId: l.targetId };
        g.add(ico);
      }
    }

    try {
      panoRef.current?.add(g);
    } catch {}
    vrHotspotGroupRef.current = g;
  }

  function yawDelta(aDeg: number, bDeg: number) {
    // minimal signed delta in degrees (a-b) normalized to [-180..+180]
    let d = ((aDeg - bDeg + 540) % 360) - 180;
    return d;
  }
  // live “sources of truth” for the click handler
  const nextLinkRef = useRef<Link | undefined>(undefined);
  const prevLinkRef = useRef<Link | undefined>(undefined);
  const navigateOnceRef = useRef<(id: string) => void>(() => {});

  // ---------- MINI-MAP refs/state ----------
  const miniMapVisibleDivRef = useRef<HTMLDivElement>(null);
  const miniMapHiddenDivRef = useRef<HTMLDivElement>(null);
  const miniMapRef = useRef<any>(null);
  const miniViewRef = useRef<any>(null);
  const miniPosFeatureRef = useRef<any>(null);
  const miniArrowStyleRef = useRef<any>(null);
  const fromLonLatRef = useRef<
    ((c: [number, number]) => [number, number]) | null
  >(null);

  // Breadcrumb (optional)
  const breadcrumbSourceRef = useRef<any>(null);
  const breadcrumbLayerRef = useRef<any>(null);
  const breadcrumbLineFeatRef = useRef<any>(null);
  const PointCtorRef = useRef<any>(null);

  // latest [lon,lat]
  const currentLonLatLiveRef = useRef<LL | undefined>(undefined);

  function onPointerFixedNav(ev: PointerEvent | MouseEvent | TouchEvent) {
    if (xrActive) return; // non-VR only
    const container = containerRef.current;
    const viewer = viewerRef.current;
    const group = fixedNavGroupRef.current;
    if (!container || !viewer || !group) return;

    const raycaster = raycasterRef.current ?? new THREE.Raycaster();
    raycasterRef.current = raycaster;

    let clientX = 0,
      clientY = 0;
    if ("changedTouches" in ev && ev.changedTouches?.length) {
      clientX = ev.changedTouches[0].clientX;
      clientY = ev.changedTouches[0].clientY;
    } else {
      const e2 = ev as MouseEvent;
      clientX = e2.clientX;
      clientY = e2.clientY;
    }

    const rect = container.getBoundingClientRect();
    const ndc = pointerNdcRef.current ?? new THREE.Vector2();
    pointerNdcRef.current = ndc;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

    const camera = viewer.getCamera?.() || (viewer as any).camera;
    raycaster.setFromCamera(ndc, camera);

    const hits = raycaster.intersectObjects(group.children, true);
    const hit = hits[0];
    const dir = (hit?.object as any)?.userData?.dir as
      | ("next" | "prev")
      | undefined;
    if (!dir) return;

    // Use your live refs so we don’t capture stale closures
    const next = nextLinkRef.current;
    const prev = prevLinkRef.current;

    if (dir === "next" && next?.targetId) {
      persistPanoLocation(currentId);

      navigateOnceRef.current(next.targetId);
    } else if (dir === "prev" && prev?.targetId) {
      persistPanoLocation(currentId);

      navigateOnceRef.current(prev.targetId);
    }
  }

  // Attach listeners once (same pattern you already use for other picks)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handler = (ev: any) => onPointerFixedNav(ev);

    root.addEventListener("pointerup", handler as any, { passive: true });
    root.addEventListener("click", handler as any, { passive: true });
    root.addEventListener("touchend", handler as any, { passive: true });

    return () => {
      root.removeEventListener("pointerup", handler as any);
      root.removeEventListener("click", handler as any);
      root.removeEventListener("touchend", handler as any);
    };
  }, []);

  function onPointerHotspot(ev: PointerEvent | MouseEvent | TouchEvent) {
    // Don’t handle while XR is active
    if (xrActive) return;

    const container = containerRef.current;
    const viewer = viewerRef.current;
    const group = hotspotsGroup.current;
    if (!container || !viewer || !group) return;

    const raycaster = raycasterRef.current ?? new THREE.Raycaster();
    raycasterRef.current = raycaster;

    let clientX = 0,
      clientY = 0;
    if ("changedTouches" in ev && ev.changedTouches?.length) {
      clientX = ev.changedTouches[0].clientX;
      clientY = ev.changedTouches[0].clientY;
    } else {
      const e2 = ev as MouseEvent;
      clientX = e2.clientX;
      clientY = e2.clientY;
    }

    const rect = container.getBoundingClientRect();
    const ndc = pointerNdcRef.current ?? new THREE.Vector2();
    pointerNdcRef.current = ndc;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

    const camera = viewer.getCamera?.() || (viewer as any).camera;
    raycaster.setFromCamera(ndc, camera);

    // Intersect all hotspot planes (they’re invisible but raycastable)
    const hits = raycaster.intersectObjects(group.children, true);
    const hit = hits.find((h) => (h.object as any)?.userData?.type === "link");
    const targetId = (hit?.object as any)?.userData?.targetId as
      | string
      | undefined;
    if (targetId) navigateOnce(targetId);
  }

  useEffect(() => {
    currentLonLatLiveRef.current = currentLonLat;
  }, [currentLonLat]);

  /* ---------- Visibility pause/resume ---------- */
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        rafRunningRef.current = false;
      } else {
        startLoopRef.current?.();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const resolveIfNeeded = React.useCallback(
    async (u: string) => {
      if (
        typeof u === "string" &&
        looksRelative(u) &&
        typeof resolveImagePath === "function"
      ) {
        return await resolveImagePath(u);
      }
      return u;
    },
    [resolveImagePath]
  );
  function buildXRHotspots(links: Link[]) {
    // remove old group
    if (hotspotGroupRef.current && panoRef.current) {
      try {
        panoRef.current.remove(hotspotGroupRef.current);
      } catch {}
    }
    hotspotGroupRef.current = new THREE.Group();
    hotspotByIdRef.current.clear();

    const g = hotspotGroupRef.current!;
    const R = INFOSPOT_RADIUS * 0.92; // slightly inside sphere
    const size = 80; // clickable plane size
    const planeGeo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0001, // invisible but ray-hittable
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (const l of links) {
      if (typeof l.yaw !== "number") continue;
      const yawRad = THREE.MathUtils.degToRad(l.yaw);
      const pitchRad = THREE.MathUtils.degToRad(l.pitch ?? 0);

      // Position on inner sphere using yaw/pitch
      const dir = new THREE.Vector3(
        Math.sin(yawRad) * Math.cos(pitchRad),
        Math.sin(pitchRad),
        -Math.cos(yawRad) * Math.cos(pitchRad)
      );
      const pos = dir.clone().multiplyScalar(R);

      const m = new THREE.Mesh(planeGeo, mat.clone());
      m.position.copy(pos);

      // Face the camera center (look-at origin), but tilt a tiny bit for stability
      m.lookAt(new THREE.Vector3(0, 0, 0));
      m.rotateX(THREE.MathUtils.degToRad(0.01));

      // Tag it
      m.userData.kind = "link";
      m.userData.targetId = l.targetId;

      g.add(m);
      hotspotByIdRef.current.set(l.targetId, m);
    }

    // Attach to current panorama node
    try {
      panoRef.current?.add(g);
    } catch {}
  }
  useEffect(() => {
    if (!panoRef.current) return;
    buildXRHotspots(links);
  }, [links]);

  /* ---------- Direction hint ---------- */
  useEffect(() => {
    if (!currentLonLat) return;
    const prev = lastLonLatRef.current;
    lastLonLatRef.current = currentLonLat;
    if (!prev) return;

    const latAvgRad = ((prev[1] + currentLonLat[1]) * Math.PI) / 180 / 2;
    const k = Math.max(0.000001, Math.cos(latAvgRad));
    const dx = (currentLonLat[0] - prev[0]) * k;
    const dy = currentLonLat[1] - prev[1];
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return;

    let nx = dx / dist,
      ny = dy / dist;

    const SMOOTH = 0.85;
    const FLIP_DEG = 60;
    const prevDir = forwardHintRef.current;
    if (prevDir) {
      const dot = Math.max(-1, Math.min(1, prevDir[0] * nx + prevDir[1] * ny));
      const angle = (Math.acos(dot) * 180) / Math.PI;
      if (!(angle > FLIP_DEG && dist < 5e-6)) {
        nx = SMOOTH * prevDir[0] + (1 - SMOOTH) * nx;
        ny = SMOOTH * prevDir[1] + (1 - SMOOTH) * ny;
        const l = Math.hypot(nx, ny) || 1;
        nx /= l;
        ny /= l;
      }
    }

    const prevHint = forwardHintRef.current;
    forwardHintRef.current = [nx, ny];
    if (
      !prevHint ||
      Math.abs(prevHint[0] - nx) + Math.abs(prevHint[1] - ny) > 1e-4
    ) {
      setDirVersion((v) => v + 1);
    }
  }, [currentLonLat]);

  const lastPickRef = useRef<{ nextId?: string; prevId?: string }>({});
  const { next: nextLink, prev: prevLink } = useMemo(() => {
    // Prefer linear hints
    const byRel = pickNextPrevLinear(links);
    if (byRel.next || byRel.prev) return byRel;

    // Fallback (legacy/no rel)
    return pickNextPrevStable(
      links,
      currentLonLat,
      forwardHintRef.current,
      lastPickRef.current
    );
  }, [links, currentLonLat, dirVersion]);
  // keep them fresh every render
  useEffect(() => {
    nextLinkRef.current = nextLink;
  }, [nextLink]);
  useEffect(() => {
    prevLinkRef.current = prevLink;
  }, [prevLink]);
  useEffect(() => {
    persistPanoLocation(currentId);

    navigateOnceRef.current = navigateOnce;
  }, [navigateOnce]);
  useEffect(() => {
    (async () => {
      const nextUrl = nextLink?.imagePath as string | undefined;
      const prevUrl = prevLink?.imagePath as string | undefined;

      if (nextUrl) {
        const u = await resolveIfNeeded(nextUrl);
        enqueuePrefetch(u);
      }
      if (prevUrl) {
        const u = await resolveIfNeeded(prevUrl);
        enqueuePrefetch(u);
      }
    })();
  }, [nextLink?.targetId, prevLink?.targetId, resolveIfNeeded]);

  // Buffer the nearest panoramas (beyond just next/prev)
  useEffect(() => {
    (async () => {
      const NEAREST_COUNT = 5;
      const list = nearestLinks(links, currentLonLat, NEAREST_COUNT);
      const prioritized = [
        ...(nextLink ? [nextLink] : []),
        ...(prevLink ? [prevLink] : []),
        ...list.filter((l) => l !== nextLink && l !== prevLink),
      ];

      for (const l of prioritized) {
        const raw = l.imagePath as string | undefined;
        if (!raw) continue;
        const u = await resolveIfNeeded(raw);
        enqueuePrefetch(u);
      }
    })();
  }, [
    links,
    currentLonLat,
    nextLink?.targetId,
    prevLink?.targetId,
    resolveIfNeeded,
  ]);

  // === [FIX] Handle Quest controller buttons inside VR ===
  useEffect(() => {
    if (!xrActive) return;
const checkControllers = async () => {
  const renderer: any =
    viewerRef.current?.getRenderer?.() || viewerRef.current?.renderer;
  const session: XRSession | null =
    renderer?.xr?.getSession?.() || xrSessionRef.current;

  if (!session) {
    requestAnimationFrame(checkControllers);
    return;
  }

  // 1) Prefer XR inputSources (reliable in WebXR on Quest)
  const padsFromXR: Gamepad[] = [];
  try {
    for (const src of session.inputSources || []) {
      // Some sources (e.g., gaze) have no gamepad
      const gp = (src as any).gamepad as Gamepad | undefined;
      if (gp) padsFromXR.push(gp);
    }
  } catch {}

  // 2) Fallback to navigator.getGamepads (desktop/Sim)
  const padsFromNav = (navigator.getGamepads?.() || []).filter(Boolean) as Gamepad[];

  const gamepads = padsFromXR.length ? padsFromXR : padsFromNav;

  for (const gp of gamepads) {
    if (!gp || !gp.buttons || gp.buttons.length < 2) continue;

    // Read A/B with your robust helper (different browser mappings)
    const { a: aDown, b: bDown } = readABFromRightGp(gp);

    // === A → NEXT ===
    if (aDown && !xrBtnAWasDownRef.current) {
      xrBtnAWasDownRef.current = true;
      const { next } = resolveNextPrevNow();   // recompute NOW (fresh links/GPS/sequence)
      if (next?.targetId) {
        if (xrActive && next.imagePath) {
          const resolved = await resolveIfNeeded(next.imagePath);
          await swapPanoramaInPlaceXR(resolved);     // in-place swap inside XR
          const lastYaw = yawDegStateRef.current;
          requestAnimationFrame(() => setCameraYawDeg(lastYaw));
          // keep sequence index in sync if we used fallback
          if (idToIndexRef.current[next.targetId] != null) {
            currentIndexRef.current = idToIndexRef.current[next.targetId];
          } else if (panoListRef.current?.length) {
            const i = panoListRef.current.findIndex(p => p.imagePath === next.imagePath);
            if (i >= 0) currentIndexRef.current = i;
          }
        } else {
          // No imagePath yet → go through your normal navigation pipeline
          persistPanoLocation(currentId);
          navigateOnceRef.current(next.targetId);
        }
      }
    } else if (!aDown) {
      xrBtnAWasDownRef.current = false;
    }

    // === B → PREV ===
    if (bDown && !xrBtnBWasDownRef.current) {
      xrBtnBWasDownRef.current = true;
      const { prev } = resolveNextPrevNow();
      if (prev?.targetId) {
        if (xrActive && prev.imagePath) {
          const resolved = await resolveIfNeeded(prev.imagePath);
          await swapPanoramaInPlaceXR(resolved);
          const lastYaw = yawDegStateRef.current;
          requestAnimationFrame(() => setCameraYawDeg(lastYaw));
          if (idToIndexRef.current[prev.targetId] != null) {
            currentIndexRef.current = idToIndexRef.current[prev.targetId];
          } else if (panoListRef.current?.length) {
            const i = panoListRef.current.findIndex(p => p.imagePath === prev.imagePath);
            if (i >= 0) currentIndexRef.current = i;
          }
        } else {
          persistPanoLocation(currentId);
          navigateOnceRef.current(prev.targetId);
        }
      }
    } else if (!bDown) {
      xrBtnBWasDownRef.current = false;
    }
  }

  requestAnimationFrame(checkControllers);
};

    requestAnimationFrame(checkControllers);
    return () => {
      xrBtnAWasDownRef.current = false;
      xrBtnBWasDownRef.current = false;
    };
  }, [xrActive, currentId]);
useEffect(() => {
  if (!xrActive) return;
  // If we don’t know the sequence index yet, try to set it now
  if (currentIndexRef.current < 0 && currentId && idToIndexRef.current[currentId] != null) {
    currentIndexRef.current = idToIndexRef.current[currentId];
  }
  // Prefetch whatever resolveNextPrevNow() picks
  const { next, prev } = resolveNextPrevNow();
  (async () => {
    if (next?.imagePath) enqueuePrefetch(await resolveIfNeeded(next.imagePath));
    if (prev?.imagePath) enqueuePrefetch(await resolveIfNeeded(prev.imagePath));
  })();
}, [xrActive, currentId]);
  // === Gaze-based selection in VR/XR ===  

  useEffect(() => {
    if (!xrActive) return;
    let raf = 0;
    const loop = () => {
      const viewer = viewerRef.current;
      const reticle = reticleRef.current;
      if (!viewer || !reticle) {
        raf = requestAnimationFrame(loop);
        return;
      }

      const control = viewer.getControl?.() || (viewer as any).controls;
      let yaw = 0;
      if (control?.getAzimuthalAngle) {
        yaw = (control.getAzimuthalAngle() * 180) / Math.PI;
        if (yaw < 0) yaw += 360;
      }
      const hit = pickLinkByYaw(links, yaw, 15); // tighter threshold for dwell
      const now = performance.now();

      // visual feedback: shrink the ring as time elapses
      if (hit) {
        if (gazeTimerRef.current == null) {
          gazeTimerRef.current = now;
          gazeDeadlineRef.current = now + 2000; // 2s dwell
        }
        const remain = Math.max(0, gazeDeadlineRef.current - now);
        const pct = 1 - remain / 2000;
        reticle.style.transform = `translate(-50%,-50%) scale(${
          1 + pct * 0.5
        })`;
        reticle.style.borderColor = remain < 300 ? "#00FF88" : "#FFFFFF";
        if (remain === 0) {
          gazeTimerRef.current = null;
          onXRSelect();
        }
      } else {
        gazeTimerRef.current = null;
        reticle.style.transform = "translate(-50%,-50%) scale(1)";
        reticle.style.borderColor = "rgba(255,255,255,0.9)";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [xrActive, links, nextLink?.targetId, prevLink?.targetId, currentId]);
  function getSecondHop(
    links: Link[],
    first?: Link,
    here?: [number, number]
  ): Link | undefined {
    if (!first || !here) return undefined;
    // Use nearest to the first link’s coordinates
    const firstHere: [number, number] = [first.longitude!, first.latitude!];
    return nearestLinks(links, firstHere, 2).find(
      (l) => l.targetId !== first.targetId
    );
  }
  useEffect(() => {
    (async () => {
      const p1 = nextLink?.imagePath as string | undefined;
      const p2 = getSecondHop(links, nextLink, currentLonLat)?.imagePath as
        | string
        | undefined;
      if (p1) enqueuePrefetch(await resolveIfNeeded(p1));
      if (p2) enqueuePrefetch(await resolveIfNeeded(p2));
    })();
  }, [nextLink?.targetId, currentLonLat, links, resolveIfNeeded]);

  useEffect(() => {
    (async () => {
      const p1 = prevLink?.imagePath as string | undefined;
      const p2 = getSecondHop(links, prevLink, currentLonLat)?.imagePath as
        | string
        | undefined;
      if (p1) enqueuePrefetch(await resolveIfNeeded(p1));
      if (p2) enqueuePrefetch(await resolveIfNeeded(p2));
    })();
  }, [prevLink?.targetId, currentLonLat, links, resolveIfNeeded]);

  /* ---------- Yaw helpers + persistence ---------- */
  const yawKey = (id?: string) => `panovr_lastYaw_${id ?? "global"}`;
  const persistYaw = (degree: number, id?: string) => {
    lastYawRef.current = degree;
    try {
      sessionStorage.setItem(yawKey(id), String(Math.round(degree)));
    } catch {}
  };
  const restoreYaw = (id?: string): number | null => {
    if (lastYawRef.current != null) return lastYawRef.current;
    try {
      const stored = sessionStorage.getItem(yawKey(id));
      if (stored != null) {
        const v = Number(stored);
        if (!Number.isNaN(v)) return v;
      }
    } catch {}
    return null;
  };
  const setCameraYawDeg = (deg: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const control = viewer.getControl?.() || viewer.controls;
    if (!control?.getAzimuthalAngle || !control.rotateLeft) return;
    const normRad = (r: number) => {
      r = (r + Math.PI) % (2 * Math.PI);
      if (r < 0) r += 2 * Math.PI;
      return r - Math.PI;
    };
    let cur = control.getAzimuthalAngle();
    if (cur < 0) cur += Math.PI * 2;
    const target = (deg * Math.PI) / 180;
    const delta = normRad(cur - target);
    control.rotateLeft(delta);
    viewer.render?.();
  };
  const applyPersistedYawOrFallback = (id?: string) => {
    const restored = restoreYaw(id);
    const target = restored == null ? startYawDeg : restored;
    setCameraYawDeg(target);
    requestAnimationFrame(() => setCameraYawDeg(target));
  };

  function pickLinkByYaw(
    links: Link[],
    yawDeg: number,
    maxDelta = 60
  ): Link | null {
    if (!links?.length) return null;
    let best: Link | null = null;
    let bestAbs = 999;

    for (const l of links) {
      if (typeof l.yaw !== "number") continue;
      // normalize difference to [-180..+180]
      let d = ((l.yaw - yawDeg + 540) % 360) - 180;
      const ad = Math.abs(d);
      if (ad < bestAbs) {
        bestAbs = ad;
        best = l;
      }
    }
    return bestAbs <= maxDelta ? best : null;
  }

  /* ---------- Adopt input src ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!src) {
        if (alive) setLiveSrc("");
        return;
      }
      try {
        const next = await adoptToLocalSrc(src, currentObjUrlRef.current, (u) =>
          revokeQueueRef.current.push(u)
        );
        currentObjUrlRef.current =
          typeof next === "string"
            ? next.startsWith("blob:")
              ? next
              : null
            : null;
        if (alive) setLiveSrc(next);
      } catch {
        if (alive) setLiveSrc("");
      }
    })();
    return () => {
      alive = false;
    };
  }, [src]);

  // XR support probe once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const navAny: any = navigator as any;
        if ("xr" in navigator && navAny?.xr?.isSessionSupported) {
          const vr = await navAny.xr.isSessionSupported("immersive-vr");
          if (alive) {
            setXrSupported(!!vr);
            if (vr) webvr.onavailable?.();
          }
        } else if (alive) setXrSupported(false);
      } catch {
        if (alive) setXrSupported(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!xrActive) return;
    try {
      createVRHotspotsForXR(links);
    } catch {}
  }, [xrActive, links]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (currentObjUrlRef.current?.startsWith("blob:"))
          URL.revokeObjectURL(currentObjUrlRef.current);
      } catch {}
      for (const u of revokeQueueRef.current) {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      }
      revokeQueueRef.current = [];
      currentObjUrlRef.current = null;

      try {
        if (miniMapRef.current) miniMapRef.current.setTarget(undefined);
      } catch {}
      miniMapRef.current = null;
      miniViewRef.current = null;
      miniPosFeatureRef.current = null;
      miniArrowStyleRef.current = null;
      fromLonLatRef.current = null;

      // xrCtlRef.current?.dispose();
      //xrCtlRef.current = null;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      rafRunningRef.current = false;
    };
  }, []);

  const hardResizeViewer = () => {
    const viewer = viewerRef.current;
    const container = containerRef.current;
    if (!viewer || !container) return;

    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;

    try {
      const camera = viewer.getCamera?.() || (viewer as any).camera;
      const renderer = viewer.getRenderer?.() || (viewer as any).renderer;

      // Bail out early if XR is presenting
      if (renderer?.xr?.isPresenting) return;

      // (Do NOT call viewer.onWindowResize() during XR)
      viewer.onWindowResize?.();

      if (renderer?.setPixelRatio) {
        const dpr = Math.min(
          window.devicePixelRatio || 1,
          isFullscreen ? 1.75 : 1.5
        );
        renderer.setPixelRatio(dpr);
      }
      if (renderer?.setSize) renderer.setSize(width, height, false);

      if (camera) {
        (camera as any).aspect = width / height;
        (camera as any).updateProjectionMatrix?.();
      }
      viewer.render?.();
    } catch {}
  };

  const [isFullscreenReal, setIsFullscreenReal] = useState<boolean>(() =>
    isFullscreenNow()
  );

  /* Keep prop isFullscreen in sync with real fullscreen state */
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = isFullscreenNow();
      setIsFullscreenReal(isFS); // local truth
      if (isFS !== isFullscreen) onToggleFullscreen(); // keep parent informed if needed
      if (isFS) setPanButtonsEnabled(false);
      if (!isFS) setSettingsOpen(false);
      requestAnimationFrame(() => requestAnimationFrame(hardResizeViewer));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      handleFullscreenChange as any
    );
    document.addEventListener(
      "MSFullscreenChange",
      handleFullscreenChange as any
    );
    document.addEventListener(
      "mozfullscreenchange",
      handleFullscreenChange as any
    );
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange as any
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange as any
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange as any
      );
    };
  }, [isFullscreen, onToggleFullscreen]);

  useEffect(() => {
    requestAnimationFrame(() => hardResizeViewer());
  }, [isFullscreen]);

  useEffect(() => {
    const containerElement = containerRef.current;
    if (!containerElement) return;
    const resizeObserver = new ResizeObserver(() => hardResizeViewer());
    resizeObserver.observe(containerElement);
    return () => resizeObserver.disconnect();
  }, []);

  /* ---------- init (Panolens + Mini-map) ---------- */
  useEffect(() => {
    let cancelled = false;

    const containerElement = containerRef.current;
    if (!containerElement) return;
    const hasValidSize = () =>
      (containerElement.clientWidth || 0) > 0 &&
      (containerElement.clientHeight || 0) > 0;

    const initializePanorama = async () => {
      try {
        if (!liveSrc) return;
        const validationResult = await validatePanorama(liveSrc);
        if (!validationResult.ok) {
          setErrorMsg(
            `Unsupported image for panorama: ${validationResult.reason}`
          );
          return;
        }
        setErrorMsg(null);

        const module = await import("@enra-gmbh/panolens");
        const PANOLENS = (module as any).default ?? module;
        panolensAPIRef.current = PANOLENS;

        try {
          if (PANOLENS && "THREE" in PANOLENS) (PANOLENS as any).THREE = THREE;
        } catch {}

        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (!containerRef.current || cancelled) return;

        // Create viewer once
        if (!viewerRef.current) {
          const viewer = new PANOLENS.Viewer({
            container: containerRef.current,
            controlBar: false,
            autoHideInfospot: false,
            cameraFov: 75,
          });
          viewerRef.current = viewer;

          // XR controller
          // xrCtlRef.current = createWebXRController(
          //   renderer,
          //  () => (typeof liveSrc === "string" ? liveSrc : liveSrc[4]),
          //   (active) => setXrActive(active),
          //   links,
          //   (targetId) => navigateOnce(targetId),
          // {
          //      handTracking: false,          // safer while testing controller input
          // turnSpeedDegPerSec: 140,      // RIGHT stick yaw speed
          // pitchSpeedDegPerSec: 100,     // RIGHT stick pitch speed
          // snapTurnDeg: 0,               // set to 30 if you want LEFT-stick snap turn
          // deadzone: 0.18,flip: "mirror" },
          //    rootRef.current ?? undefined
          //  );
        }

        // Create panorama (or reload)
        if (!panoRef.current) {
          let panorama: any;
          if (Array.isArray(liveSrc))
            panorama = new PANOLENS.CubePanorama(liveSrc);
          else panorama = new PANOLENS.ImagePanorama(liveSrc);
          panoRef.current = panorama;
          viewerRef.current.add(panorama);

          // floor + faint grid
          try {
            const diskRadius = INFOSPOT_RADIUS * 2;
            const floorGeometry = new THREE.CircleGeometry(diskRadius, 64);
            floorGeometry.rotateX(-Math.PI / 2);
            const floorMaterial = new THREE.MeshBasicMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0.035,
              depthWrite: false,
              depthTest: false,
            });
            const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
            floorMesh.position.set(0, FLOOR_Y, 0);
            panorama.add(floorMesh);

            const gridHelper = new THREE.GridHelper(diskRadius * 1.6, 32);
            const gridMaterial = gridHelper.material as any;
            gridMaterial.transparent = true;
            gridMaterial.opacity = 0.05;
            gridHelper.position.y = FLOOR_Y + 0.01;
            panorama.add(gridHelper);

            (panorama as any).__floor = floorMesh;
            (panorama as any).__grid = gridHelper;
          } catch {}

          // lighting
          try {
            panorama.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.9));
            const d = new THREE.DirectionalLight(0xffffff, 0.6);
            d.position.set(800, 1200, 600);
            panorama.add(d);
          } catch {}

          // --- Create 3D arrow once ---
          if (!arrowGroupRef.current) {
            raycasterRef.current = new THREE.Raycaster();
            pointerNdcRef.current = new THREE.Vector2();

            // Group that we will rotate/flop 0/180 deg
            const g = new THREE.Group();

            // Base: a flat “puck” to ground the arrow visually
            const base = new THREE.CylinderGeometry(60, 60, 6, 32);
            const baseMat = new THREE.MeshBasicMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0.2,
              depthWrite: false,
            });
            const baseMesh = new THREE.Mesh(base, baseMat);
            baseMesh.position.y = 3; // sit just above floor
            g.add(baseMesh);
            // ----- BODY: flat, pointing forward (-Z) -----
            // Default cone/cylinder point up (+Y). Rotate a child group so +Y becomes -Z.
            const body = new THREE.Group();
            body.rotation.x = -Math.PI / 2; // lay flat -> points along -Z
            body.position.y = 80; // lift body above the base a bit
            g.add(body);

            // Invisible, larger hit area on the floor (keeps click easy)
            const pick = new THREE.CircleGeometry(140, 24);
            const pickMat = new THREE.MeshBasicMaterial({
              color: 0x000000,
              transparent: true,
              opacity: 0.001,
              depthWrite: false,
            });
            const pickMesh = new THREE.Mesh(pick, pickMat);
            pickMesh.rotation.x = -Math.PI / 2;
            pickMesh.position.y = 10;
            arrowPickMeshRef.current = pickMesh;
            g.add(pickMesh);

            // Subtle halo ring on the floor
            const halo = new THREE.RingGeometry(75, 90, 48);
            const haloMat = new THREE.MeshBasicMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0.25,
              side: THREE.DoubleSide,
              depthWrite: false,
            });
            const haloMesh = new THREE.Mesh(halo, haloMat);
            haloMesh.rotation.x = -Math.PI / 2;
            haloMesh.position.y = 7;
            g.add(haloMesh);

            // Place near floor; exact position/orientation updated per-frame
            g.position.set(0, FLOOR_Y + 6, -800);
            g.visible = false;

            arrowGroupRef.current = g;

            // Attach to the active panorama node
            panoRef.current.add(g);

            // Pointer -> raycast -> click the arrow
            const onPointer = (ev: PointerEvent | MouseEvent | TouchEvent) => {
              if (xrActive) return; // not in XR
              if (
                mode !== "NORMAL" &&
                mode !== "STEREO" &&
                mode !== "CARDBOARD"
              ) {
                // we still only want NORMAL (and your fullscreen) to be interactive; Cardboard/Stereo get their own gaze tap handler elsewhere
              }
              // Debounce: avoid double fire from pointerup + click (and fast taps)
              const now = performance.now();
              if (now - clickCooldownRef.current < 280) return;
              clickCooldownRef.current = now;

              if (!arrowGroupRef.current || !arrowPickMeshRef.current) return;

              const container = containerRef.current;
              const viewer = viewerRef.current;
              const raycaster = raycasterRef.current!;
              const ndc = pointerNdcRef.current!;
              if (!container || !viewer) return;

              let clientX = 0,
                clientY = 0;
              if ("changedTouches" in ev && ev.changedTouches?.length) {
                clientX = ev.changedTouches[0].clientX;
                clientY = ev.changedTouches[0].clientY;
              } else {
                const e2 = ev as MouseEvent;
                clientX = e2.clientX;
                clientY = e2.clientY;
              }
              const rect = container.getBoundingClientRect();
              ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
              ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

              const camera = viewer.getCamera?.() || (viewer as any).camera;
              raycaster.setFromCamera(ndc, camera);

              const hits = raycaster.intersectObject(
                arrowPickMeshRef.current,
                true
              );
              if (hits.length) {
                // Decide forward/back NOW and navigate
                const control =
                  viewer.getControl?.() || (viewer as any).controls;
                let yaw = 0;
                if (control?.getAzimuthalAngle) {
                  yaw = (control.getAzimuthalAngle() * 180) / Math.PI;
                  if (yaw < 0) yaw += 360;
                }
                // fallback: if no yaw metadata, prefer forward if exists
                // choose the closer to gaze: next vs prev
                const nextYaw = nextLink?.yaw;
                const prevYaw = prevLink?.yaw;

                // read fresh links & navigateOnce from REFs (avoids stale closure)
                const next = nextLinkRef.current;
                const prev = prevLinkRef.current;
                const go = decideByYaw(yaw, !!next, !!prev);

                if (
                  typeof nextYaw === "number" ||
                  typeof prevYaw === "number"
                ) {
                } else {
                }
                if (go === "forward" && next) {
                  lastPickRef.current = {
                    nextId: next.targetId,
                    prevId: prev?.targetId,
                  };
                  persistPanoLocation(currentId);

                  navigateOnceRef.current(next.targetId);
                  console.debug("arrow click -> go=forward", {
                    yaw,
                    next: next.targetId,
                    prev: prev?.targetId,
                  });
                } else if (go === "back" && prev) {
                  lastPickRef.current = {
                    nextId: next?.targetId,
                    prevId: prev.targetId,
                  };
                  persistPanoLocation(currentId);

                  navigateOnceRef.current(prev.targetId);
                  console.debug("arrow click -> go=back", {
                    yaw,
                    next: next?.targetId,
                    prev: prev.targetId,
                  });
                }
              }
            };

            const root = rootRef.current!;
            root.addEventListener("pointerup", onPointer as any, {
              passive: true,
            });
            root.addEventListener("click", onPointer as any, { passive: true });
          }

          // Events
          const onEnter = () => {
            const camera =
              viewerRef.current.getCamera?.() || viewerRef.current.camera;
            if (camera) {
              (camera as any).fov = Math.max(
                Math.min((camera as any).fov ?? 75, FOV_MAX),
                FOV_MIN
              );
              (camera as any).updateProjectionMatrix?.();
              targetFovRef.current = (camera as any).fov;
            }

            requestAnimationFrame(() => hardResizeViewer());
            if (currentLonLat) updateMiniMapPosition(currentLonLat, true);
            applyPersistedYawOrFallback(currentId);
          };
          panoRef.current.addEventListener("enter", onEnter);
          panoRef.current.addEventListener("load", () => {
            if (revokeQueueRef.current.length) {
              for (const objectUrl of revokeQueueRef.current) {
                try {
                  URL.revokeObjectURL(objectUrl);
                } catch {}
              }
              revokeQueueRef.current = [];
            }
            requestAnimationFrame(() => hardResizeViewer());
          });
          panoRef.current.addEventListener("error", () => {
            setErrorMsg("Failed to load panorama texture.");
          });
        } else {
          try {
            // liveSrc can be a string URL or a Blob. Keep your logic that sets it.
            const doLoad = async () => {
              if (!panoRef.current) return;

              if (typeof liveSrc === "string" && !liveSrc.startsWith("blob:")) {
                const previewUrl = `${liveSrc}${
                  liveSrc.includes("?") ? "&" : "?"
                }w=2048`; // adjust param to your backend
                const previewPrepared = await preloadPanorama(previewUrl);
                panoRef.current.load(previewPrepared);

                // In background, fetch full-res and swap
                (async () => {
                  try {
                    const fullPrepared = await preloadPanorama(
                      liveSrc as string
                    );
                    // Only swap if we're still on the same pano instance
                    if (panoRef.current) panoRef.current.load(fullPrepared);
                  } catch {}
                })();
              } else {
                // Blob or blob: URL or no preview route
                const prepared = await (typeof liveSrc === "string"
                  ? preloadPanorama(liveSrc)
                  : Promise.resolve(liveSrc));
                panoRef.current.load(prepared);
              }

              // Restore yaw immediately after the load request
              requestAnimationFrame(() => {
                try {
                  applyPersistedYawOrFallback(currentId);
                } catch {}
              });
            };

            // Use temporary low DPR during the swap to avoid jank
            await withCheapDPR(viewerRef.current, doLoad);
          } catch {
            setErrorMsg("Failed to load panorama texture.");
          }
        }

        // Controls
        const control =
          viewerRef.current.getControl?.() || viewerRef.current.controls;
        if (control) {
          control.enableZoom = true;
          control.enablePan = false;
          control.rotateSpeed = -0.25;
          (control as any).minPolarAngle = Math.PI / 2;
        }

        // ---------- MINI-MAP boot ----------
        const bootLonLat = currentLonLat ?? userLonLat;
        if (
          !miniMapRef.current &&
          (miniMapHiddenDivRef.current || miniMapVisibleDivRef.current) &&
          bootLonLat
        ) {
          try {
            const [
              { default: Map },
              { default: View },
              { default: TileLayer },
              { default: OSM },
              { default: Feature },
              { default: VectorLayer },
              { default: VectorSource },
              { Style, Fill, Stroke, RegularShape, Circle: CircleStyle },
              { fromLonLat },
              { defaults: defaultControls },
              { defaults: defaultInteractions },
              { default: Point },
              { default: LineString },
            ] = await Promise.all([
              import("ol/Map"),
              import("ol/View"),
              import("ol/layer/Tile"),
              import("ol/source/OSM"),
              import("ol/Feature"),
              import("ol/layer/Vector"),
              import("ol/source/Vector"),
              import("ol/style"),
              import("ol/proj"),
              import("ol/control"),
              import("ol/interaction"),
              import("ol/geom/Point"),
              import("ol/geom/LineString"),
            ]);

            PointCtorRef.current = Point;
            fromLonLatRef.current = fromLonLat as any;

            const startLL = normalizeLL(
              bootLonLat as [number, number],
              coordinateOrder
            );

            const posFeature = new Feature({
              geometry: new Point(fromLonLat(startLL)),
            });

            // Blue dot + green arrow
            const circleStyle = new Style({
              image: new CircleStyle({
                radius: 6,
                fill: new Fill({ color: "rgba(33,150,243,0.9)" }),
                stroke: new Stroke({ color: "white", width: 2 }),
              }),
            });
            const arrow = new RegularShape({
              points: 3,
              radius: 10,
              rotation: 0,
              angle: Math.PI / 2,
              fill: new Fill({ color: "rgba(46,125,50,0.95)" }),
              stroke: new Stroke({ color: "white", width: 2 }),
            });
            miniArrowStyleRef.current = arrow;
            const arrowStyle = new Style({ image: arrow });
            posFeature.setStyle([circleStyle, arrowStyle]);

            const vectorSource = new VectorSource({ features: [posFeature] });
            const vectorLayer = new VectorLayer({ source: vectorSource });

            // Breadcrumb (optional)
            const breadcrumbSource = new VectorSource();
            const breadcrumbLineFeat = new Feature({
              geometry: new LineString([fromLonLat(startLL)]),
            });
            breadcrumbSource.addFeature(breadcrumbLineFeat);
            const breadcrumbStyle = new Style({
              stroke: new Stroke({
                color: "rgba(0,0,0,0.55)",
                width: 2,
                lineDash: [6, 6],
              }),
            });
            const breadcrumbLayer = new VectorLayer({
              source: breadcrumbSource,
              style: breadcrumbStyle,
            });

            breadcrumbSourceRef.current = breadcrumbSource;
            breadcrumbLayerRef.current = breadcrumbLayer;
            breadcrumbLineFeatRef.current = breadcrumbLineFeat;

            // Mount on the visible div first (fallback to hidden)
            const initialTarget = (miniMapVisibleDivRef.current ??
              miniMapHiddenDivRef.current)!;

            const map = new Map({
              target: initialTarget,
              controls: defaultControls({
                zoom: false,
                rotate: false,
                attribution: false,
              }),
              interactions: defaultInteractions({
                mouseWheelZoom: false,
                dragPan: false,
                doubleClickZoom: false,
                keyboard: false,
                altShiftDragRotate: false,
                pinchRotate: false,
                pinchZoom: false,
              }),
              layers: [
                new TileLayer({ source: new OSM() }),
                breadcrumbLayer,
                vectorLayer,
              ],
              view: new View({
                center: fromLonLat(startLL),
                zoom: 17,
              }),
            });

            miniMapRef.current = map;
            miniViewRef.current = map.getView();
            miniPosFeatureRef.current = posFeature;
          } catch (error) {
            console.warn("Mini-map init failed:", error);
          }
        }

        // frame loop
        const updateFrame = () => {
          rafRunningRef.current = true;

          if (!viewerRef.current) {
            rafRef.current = requestAnimationFrame(updateFrame);
            return;
          }

          let needsRender = false;

          // FOV tween
          const activeCamera =
            viewerRef.current.getCamera?.() || viewerRef.current.camera;
          if (activeCamera) {
            const targetFov = targetFovRef.current;
            const curFov = (activeCamera as any).fov ?? 75;
            if (Math.abs(curFov - targetFov) > 0.01) {
              (activeCamera as any).fov += (targetFov - curFov) * FOV_DAMP;
              if (Math.abs((activeCamera as any).fov - targetFov) < 0.02) {
                (activeCamera as any).fov = targetFov;
              }
              (activeCamera as any).updateProjectionMatrix?.();
              needsRender = true;
            }
          }

          // compass + yaw + mini-map arrow/breadcrumb
          const control2 =
            viewerRef.current.getControl?.() || viewerRef.current.controls;
          if (control2?.getAzimuthalAngle && compassRotRef.current) {
            let yaw = (control2.getAzimuthalAngle() * 180) / Math.PI;
            if (yaw < 0) yaw += 360;

            lastYawRef.current = yaw;

            const heading = norm360(yaw - northOffsetDeg);
            compassRotRef.current.style.transform = `rotate(${-heading}deg)`;

            // Rotate arrow
            if (miniArrowStyleRef.current && miniPosFeatureRef.current) {
              try {
                miniArrowStyleRef.current.setRotation(
                  (heading * Math.PI) / 180
                );
                miniPosFeatureRef.current.changed();
                miniMapRef.current?.renderSync?.();
              } catch {}
            }

            // breadcrumb extend
            const liveLL = currentLonLatLiveRef.current;
            if (
              breadcrumbLineFeatRef.current &&
              miniMapRef.current &&
              fromLonLatRef.current &&
              liveLL
            ) {
              const line = breadcrumbLineFeatRef.current.getGeometry();
              const add = fromLonLatRef.current(
                normalizeLL(liveLL, coordinateOrder)
              );
              const coords = line.getCoordinates();
              const last = coords[coords.length - 1];
              if (
                !last ||
                Math.hypot(add[0] - last[0], add[1] - last[1]) > 0.00005
              ) {
                coords.push(add);
                line.setCoordinates(coords);
              }
              miniMapRef.current.renderSync?.();
            }

            const now = performance.now();
            if (now - lastYawStoreTickRef.current > 400) {
              lastYawStoreTickRef.current = now;
              persistYaw(yaw, currentId);
              if (Math.abs(yaw - yawDegStateRef.current) > 2) setYawDeg(yaw);
            }
          }
          // ----- Update the 3D arrow pose / visibility -----
          try {
            const g = arrowGroupRef.current;
            if (g && !xrActive && mode === "NORMAL") {
              const viewer = viewerRef.current;
              const next = nextLinkRef.current;
              const prev = prevLinkRef.current;
              const yaw = getCameraYawDeg(viewer);
              const dir = chooseDirectionFromYaw(yaw, next, prev) || "forward";
              setArrowKind(dir);
              updateFloorArrowPose(g, viewer, dir, 780, FLOOR_Y);
            } else if (g && xrActive) {
              // in XR we already update in the XR loop; keep visible
              g.visible = true;
            } else if (g) {
              g.visible = false;
            }
            const viewer = viewerRef.current;
            const panorama = panoRef.current;
            if (g && viewer && panorama && !xrActive && mode === "NORMAL") {
              const camera = viewer.getCamera?.() || (viewer as any).camera;

              // Where is the camera looking?
              const control2 = viewer.getControl?.() || viewer.controls;
              let yaw = 0;
              if (control2?.getAzimuthalAngle) {
                yaw = (control2.getAzimuthalAngle() * 180) / Math.PI;
                if (yaw < 0) yaw += 360;
              }

              // Decide which side (forward/back) is closer to gaze.
              // If link yaws exist, choose closest. Else: prefer 'forward' if next exists; otherwise 'back'.
              let want: "forward" | "back" | null = null;
              if (nextLink?.yaw != null || prevLink?.yaw != null) {
                const dNext =
                  nextLink?.yaw != null
                    ? Math.abs(yawDelta(nextLink.yaw, yaw))
                    : Infinity;
                const dPrev =
                  prevLink?.yaw != null
                    ? Math.abs(yawDelta(prevLink.yaw, yaw))
                    : Infinity;
                want = dNext <= dPrev ? "forward" : "back";
              } else {
                want = nextLink ? "forward" : prevLink ? "back" : null;
              }

              // Visible only if we actually have a target
              const visible =
                !!want &&
                ((want === "forward" && nextLink) ||
                  (want === "back" && prevLink));
              g.visible = visible;
              if (arrowVisible !== visible) setArrowVisible(visible);
              if (!visible) {
                /* nothing to draw */
              } else {
                if (arrowKind !== want) setArrowKind(want!);

                // Position ~3 meters in front of the camera, but clamp to floor
                const dist = 800; // sphere radius units; works nicely with your INFOSPOT_RADIUS
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
                  camera.quaternion
                );
                const pos = camera.position
                  .clone()
                  .add(forward.multiplyScalar(dist));
                pos.y = FLOOR_Y + 6; // just above your floor disk
                g.position.copy(pos);

                // Face the direction of travel (0 deg for forward, 180 for back)
                // Construct a yaw-only quaternion aligned to camera yaw
                const yawRad = (yaw * Math.PI) / 180;
                const rotY = new THREE.Quaternion().setFromAxisAngle(
                  new THREE.Vector3(0, 1, 0),
                  yawRad
                );
                g.quaternion.copy(rotY);

                if (want === "back") {
                  // flip 180° around Y
                  const flip = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    Math.PI
                  );
                  g.quaternion.multiply(flip);
                }
              }
            } else if (g) {
              g.visible = false;
              if (arrowVisible) setArrowVisible(false);
            }
          } catch {}

          if (needsRender) viewerRef.current.render?.();

          rafRef.current = requestAnimationFrame(updateFrame);
        };

        startLoopRef.current = () => {
          if (!rafRunningRef.current) {
            rafRunningRef.current = true;
            rafRef.current = requestAnimationFrame(updateFrame);
          }
        };

        updateFrame();
      } catch (err) {
        console.error("Panolens boot error:", err);
        if (!cancelled) setErrorMsg("Failed to initialize panorama viewer.");
      }
    };

    if (hasValidSize()) {
      initializePanorama();
      return () => {
        cancelled = true;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        rafRunningRef.current = false;
      };
    } else {
      const ro = new ResizeObserver(() => {
        if (hasValidSize()) {
          ro.disconnect();
          initializePanorama();
        }
      });
      ro.observe(containerElement);
      return () => {
        cancelled = true;
        ro.disconnect();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        rafRunningRef.current = false;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSrc]);

  // Keep XR hotspots in sync with current links while in VR
  useEffect(() => {
    // if (!xrCtlRef.current) return;
    try {
      //   xrCtlRef.current.setLinks(links as any);
    } catch {}
  }, [links]);
  // Add pointer listeners for non-XR hotspot clicks
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Only handle in non-XR viewing
    const handler = (ev: PointerEvent | MouseEvent | TouchEvent) => {
      if (!xrActive) onPointerHotspot(ev as any);
    };

    root.addEventListener("pointerup", handler as any, { passive: true });
    root.addEventListener("click", handler as any, { passive: true });
    root.addEventListener("touchend", handler as any, { passive: true });

    return () => {
      root.removeEventListener("pointerup", handler as any);
      root.removeEventListener("click", handler as any);
      root.removeEventListener("touchend", handler as any);
    };
  }, [xrActive, links]);

  // Keep XR panorama texture in sync while in VR
  useEffect(() => {
    // if (!xrCtlRef.current) return;
    if (!liveSrc) return;
    const url = typeof liveSrc === "string" ? liveSrc : (liveSrc as any)?.[4];
    if (!url) return;
    try {
      // xrCtlRef.current.setPanorama(url);
    } catch {}
  }, [liveSrc]);

  // UI scaling
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? el.clientWidth;
      const BASE = 2560;
      const s = Math.max(0.7, Math.min(1.6, w / BASE));
      setUiScale(s);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (mode !== "CARDBOARD" && mode !== "STEREO") return;

    const el = rootRef.current;
    if (!el) return;

    const onTap = (e: Event) => {
      // stop the default "zoom" double-tap or text selection
      e.preventDefault();

      // where are we looking now?
      const control =
        viewerRef.current?.getControl?.() || viewerRef.current?.controls;
      let yaw = 0;
      if (control?.getAzimuthalAngle) {
        yaw = (control.getAzimuthalAngle() * 180) / Math.PI;
        if (yaw < 0) yaw += 360;
      }

      // try to pick the link closest to gaze; otherwise prefer "next"
      const byGaze = pickLinkByYaw(links, yaw, 60);
      const target =
        byGaze?.targetId ?? nextLink?.targetId ?? prevLink?.targetId; // last resort

      if (target) {
        // persist yaw of current pano before moving
        if (lastYawRef.current != null)
          persistYaw(lastYawRef.current, currentId);
        navigateOnce(target);
      }
    };

    // Cardboard isn’t WebXR; regular events still hit the canvas.
    el.addEventListener("pointerup", onTap, { passive: false });
    el.addEventListener("touchend", onTap, { passive: false });
    el.addEventListener("click", onTap, { passive: false });

    return () => {
      el.removeEventListener("pointerup", onTap as any);
      el.removeEventListener("touchend", onTap as any);
      el.removeEventListener("click", onTap as any);
    };
    // include things that change the chosen target
  }, [mode, links, nextLink?.targetId, prevLink?.targetId, currentId]);

  /* ---------- Mini-map helpers & effects ---------- */
  function updateMiniMapPosition(lonlat: [number, number], recenter = true) {
    const fixed = normalizeLL(lonlat, coordinateOrder);
    try {
      const Point = PointCtorRef.current;
      const fromLonLat = fromLonLatRef.current;
      const feature = miniPosFeatureRef.current;
      const view = miniViewRef.current;
      const map = miniMapRef.current;
      if (!Point || !fromLonLat || !feature) return;

      const olCoord = fromLonLat(fixed);
      feature.setGeometry(new Point(olCoord));

      if (recenter && view) {
        if (typeof (view as any).animate === "function") {
          (view as any).animate({ center: olCoord, duration: 350 });
        } else {
          view.setCenter(olCoord);
        }
      }
      map?.renderSync?.();
    } catch {}
  }

  // Move marker / recenter on coordinate changes
  useEffect(() => {
    if (!miniMapRef.current && (currentLonLat ?? userLonLat)) {
      // map not ready yet; init effect will handle it
    } else if (miniMapRef.current && currentLonLat) {
      updateMiniMapPosition(currentLonLat, true);
    }
  }, [currentLonLat, userLonLat]);

  // Retarget OL map between hidden/visible targets across mode changes
  useEffect(() => {
    if (!miniMapRef.current) return;
    const wantVisible = isFullscreenReal && !isImmersive && hasLonLat;
    const targetEl = wantVisible
      ? miniMapVisibleDivRef.current
      : miniMapHiddenDivRef.current;
    try {
      miniMapRef.current.setTarget((targetEl ?? undefined) as any);
      if (wantVisible) {
        requestAnimationFrame(() => {
          miniMapRef.current?.updateSize?.();
          miniMapRef.current?.getView?.()?.setZoom(17);
          miniMapRef.current?.renderSync?.();
        });
      }
    } catch {}
  }, [isFullscreenReal, isImmersive, hasLonLat]);

  /* ---------- navigation helpers ---------- */
  function navigateOnce(targetId: string) {
    if (lastYawRef.current != null) persistYaw(lastYawRef.current, currentId);
    const link = links.find((l) => l.targetId === targetId);
    if (link) {
      if (link.longitude != null && link.latitude != null) {
        const llLatLon: [number, number] = [link.longitude!, link.latitude!]; // [lon,lat]
        updateMiniMapPosition(llLatLon, true);
      }
      onNavigate(targetId, {
        lon: link.longitude,
        lat: link.latitude,
        imagePath: link.imagePath,
      });
    } else {
      onNavigate(targetId);
    }
  }
  useEffect(() => {
    const viewer = viewerRef.current as any;
    const renderer: THREE.WebGLRenderer =
      viewer?.getRenderer?.() || viewer?.renderer;
    const camera: THREE.Camera = viewer?.getCamera?.() || viewer?.camera;
    const canvas: HTMLCanvasElement = renderer?.domElement;
    if (!renderer || !camera || !canvas) return;

    const raycaster = new THREE.Raycaster();

    function pickForward() {
      // forward center ray
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
        camera.quaternion
      );
      raycaster.set(camera.position.clone(), dir.normalize());
      const group = hotspotsGroup.current;
      if (!group) return;
      const hits = raycaster.intersectObjects(group.children, true);
      const hit = hits.find(
        (h) => (h.object as any)?.userData?.type === "link"
      );
      const targetId = hit?.object?.userData?.targetId as string | undefined;
      if (targetId) navigateOnce(targetId);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") pickForward();
    }
    canvas.addEventListener("pointerup", pickForward);
    window.addEventListener("keydown", onKey);

    return () => {
      canvas.removeEventListener("pointerup", pickForward);
      window.removeEventListener("keydown", onKey);
    };
  }, [onNavigate]);

  // === Arrow helpers (direction by camera yaw) ===
  function getCameraYawDeg(viewer: any): number {
    const ctrl = viewer?.getControl?.() || viewer?.controls;
    if (ctrl?.getAzimuthalAngle) {
      let yaw = (ctrl.getAzimuthalAngle() * 180) / Math.PI;
      if (yaw < 0) yaw += 360;
      return yaw;
    }
    return 0;
  }

  /** Decide 'forward' vs 'back' from current yaw and available links. */
  function chooseDirectionFromYaw(
    yawDeg: number,
    nextL?: Link,
    prevL?: Link
  ): "forward" | "back" | null {
    // If you have yaw on links, you can bias by which hotspot is closer to gaze;
    // otherwise default to simple "front hemisphere = forward":
    const want = yawDeg < 180 ? "forward" : "back";
    if (want === "forward" && nextL) return "forward";
    if (want === "back" && prevL) return "back";
    if (nextL) return "forward";
    if (prevL) return "back";
    return null;
  }

  /** Position + orient the floor arrow in front of the camera, on the floor. */
  function updateFloorArrowPose(
    g: THREE.Group,
    viewer: any,
    kind: "forward" | "back",
    dist = 780, // how far ahead on the floor
    floorY = FLOOR_Y // keep consistent with your floor plane
  ) {
    const cam: THREE.Camera = viewer.getCamera?.() || (viewer as any).camera;
    if (!cam) return;

    // forward dir from camera (on XZ plane only)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) return;
    fwd.normalize();

    // if pointing "back", flip direction
    if (kind === "back") fwd.multiplyScalar(-1);

    const origin = cam.getWorldPosition(new THREE.Vector3());
    const target = origin.clone().add(fwd.multiplyScalar(dist));

    g.position.set(target.x, floorY + 6, target.z);

    // rotate the arrow to face movement direction
    const yaw = Math.atan2(-fwd.z, fwd.x); // X-right, -Z-forward
    g.rotation.set(0, yaw, 0);
    g.visible = true;
  }
async function swapPanoramaInPlaceXR(nextImage: string | Blob) {
  const viewer = viewerRef.current;
  const pano = panoRef.current;
  if (!viewer || !pano) return;
  const resolvedUrl = await preloadPanorama(nextImage);

  // Prevent black flash by lowering resolution temporarily
 /*await withCheapDPR(viewer, async () => {
    // Build a fresh Panolens ImagePanorama and switch to it without ending XR
    const nextPano = new (pano as any).ImagePanorama(resolvedUrl);

    // Transfer your VR-only hotspots container if you keep one
    try {
      if (vrHotspotGroupRef.current) nextPano.add(vrHotspotGroupRef.current);
    } catch {}

    // Add and activate
    viewer.add(nextPano);
    viewer.setPanorama(nextPano);

    // Keep a ref so later code (hotspots, picks) attaches to the right node
    panoRef.current = nextPano;

    // Rebuild non-VR hotspots onto the new pano (so desktop mode keeps working)
    try { buildHotspots(linksRef.current || []); } catch {}

    // Force a render
    viewer.render?.();
  });*/
}

  /* ---------- camera/zoom helpers ---------- */
  const setTargetFov = (f: number) => {
    const v = Math.max(FOV_MIN, Math.min(FOV_MAX, f));
    targetFovRef.current = v;
  };
  const zoomIn = () => setTargetFov(targetFovRef.current - FOV_STEP);
  const zoomOut = () => setTargetFov(targetFovRef.current + FOV_STEP);
  const resetZoom = () => setTargetFov(75);

  const goNorth = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const control = viewer.getControl?.() || viewer.controls;
    if (!control) return;
    const current = control.getAzimuthalAngle?.() ?? 0;
    const target = (northOffsetDeg * Math.PI) / 180;
    control.rotateLeft(current - target);
    viewer.render?.();
  };

  const orbitBy = (dYawDeg: number, dPitchDeg: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const control = viewer.getControl?.() || viewer.controls;
    if (!control) return;
    control.rotateLeft((dYawDeg * Math.PI) / 180);
    control.rotateUp((dPitchDeg * Math.PI) / 180);
    viewer.render?.();
  };
  const lookLeft = () => orbitBy(+PAD_STEP_DEG, 0);
  const lookRight = () => orbitBy(-PAD_STEP_DEG, 0);
  const lookUp = () => orbitBy(0, +PAD_STEP_DEG);
  const lookDown = () => orbitBy(0, -PAD_STEP_DEG);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      switch (e.key.toLowerCase()) {
        case "w":
          if (nextLink) navigateOnce(nextLink.targetId);
          break;
        case "s":
          if (prevLink) navigateOnce(prevLink.targetId);
          break;
        case "a":
          orbitBy(+20, 0);
          break;
        case "d":
          orbitBy(-20, 0);
          break;
        case "+":
        case "=":
          zoomIn();
          break;
        case "-":
          zoomOut();
          break;
        case "0":
          resetZoom();
          break;
        case "m":
          if (isFullscreenNow()) setSettingsOpen((v) => !v);
          break;
        case "p":
          if (isFullscreenNow() && !isImmersive)
            setPanButtonsEnabled((v) => !v);
          break;
        case "f": {
          applyPersistedYawOrFallback(currentId);
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    links,
    isImmersive,
    yawDeg,
    nextLink,
    prevLink,
    currentLonLat,
    currentId,
  ]);
  const onXRSelect = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const control = viewer.getControl?.() || (viewer as any).controls;
    let yaw = 0;
    if (control?.getAzimuthalAngle) {
      yaw = (control.getAzimuthalAngle() * 180) / Math.PI;
      if (yaw < 0) yaw += 360;
    }
    // prefer exact yaw‑closest link; fallback to next/prev by direction
    const byGaze = pickLinkByYaw(links, yaw, 60);
    const target = byGaze?.targetId ?? nextLink?.targetId ?? prevLink?.targetId;
    if (target) {
      if (lastYawRef.current != null) persistYaw(lastYawRef.current, currentId);
      navigateOnce(target);
    }
  };

  useEffect(() => {
    xrRaycasterRef.current = new THREE.Raycaster();
    return () => {
      xrRaycasterRef.current = null;
    };
  }, []);
  // ADD: once-only helpers for camera-gaze ray visuals (optional)
  useEffect(() => {
    // world-space Ray
    if (!rayRef.current) rayRef.current = new THREE.Ray();

    // arrow from camera forward
    if (!rayArrowRef.current) {
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 0, 0),
        INFOSPOT_RADIUS * 0.9
      );
      arrow.visible = false;
      rayArrowRef.current = arrow;
      panoRef.current?.add(arrow);
    }

    // small marker where the camera-ray hits (optional)
    if (!rayMarkerRef.current) {
      const g = new THREE.SphereGeometry(10, 16, 16);
      const m = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.4,
      });
      const s = new THREE.Mesh(g, m);
      s.visible = false;
      rayMarkerRef.current = s;
      panoRef.current?.add(s);
    }
    return () => {
      if (rayArrowRef.current) {
        try {
          panoRef.current?.remove(rayArrowRef.current);
        } catch {}
      }
      if (rayMarkerRef.current) {
        try {
          panoRef.current?.remove(rayMarkerRef.current);
        } catch {}
      }
    };
  }, []);
  /* function makeLaserLine(len = 10) {
    const positions = new Float32Array([0, 0, 0, 0, 0, -len]);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setDrawRange(0, 2);
    const mat = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.95,
    });
    const line = new THREE.Line(geom, mat);
    (line as any).name = "laser";
    line.frustumCulled = false;
    return line;
  }*/

  function setLaserLength(line: THREE.Line, dist: number) {
    const geom = line.geometry as THREE.BufferGeometry;
    const attr = geom.getAttribute("position") as
      | THREE.BufferAttribute
      | undefined;
    if (!attr || attr.itemSize !== 3 || attr.count < 2) {
      const positions = new Float32Array([0, 0, 0, 0, 0, -dist]);
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setDrawRange(0, 2);
      return;
    }
    attr.setXYZ(1, 0, 0, -dist);
    attr.needsUpdate = true;
  }

  function updateLaserToHit(
    ctrl: THREE.Object3D,
    rc: THREE.Raycaster,
    targetRoot: THREE.Object3D
  ) {
    const laser = ctrl.getObjectByName("laser") as THREE.Line | null;
    if (!laser) return;

    // Build controller-space forward ray in world space
    const origin = new THREE.Vector3().setFromMatrixPosition(ctrl.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().extractRotation(ctrl.matrixWorld)
      )
    );
    rc.ray.origin.copy(origin);
    rc.ray.direction.copy(dir);

    const children = (targetRoot as any)?.children || [];
    const hits = children.length ? rc.intersectObjects(children, true) : [];
    const dist = hits.length ? hits[0].distance : 10;

    // SAFE update of the laser length
    setLaserLength(laser, dist);
  }

  function makeLaserLine(len = 10) {
    const positions = new Float32Array([0, 0, 0, 0, 0, -len]);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setDrawRange(0, 2);
    const mat = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.95,
    });
    const line = new THREE.Line(geom, mat);
    (line as any).name = "laser";
    line.frustumCulled = false;
    return line;
  }
  const enterXR = async () => {
  

    // 1) Grab core objects
    const navXR: any = (navigator as any)?.xr;
    const viewer:any = viewerRef.current ;
    const renderer: THREE.WebGLRenderer | null =
      (viewer &&
        typeof viewer.getRenderer === "function" &&
        viewer.getRenderer()) ||
      (viewer && viewer.renderer) ||
      null;
    const scene: THREE.Scene | null =
      (viewer && typeof viewer.getScene === "function" && viewer.getScene()) ||
      (viewer && viewer.scene) ||
      null;
    const pano = panoRef.current;

    if (!navXR || !renderer || !viewer || !scene || !pano || !liveSrc) {
      console.warn("XR prerequisites missing — cannot enter XR.");
      setErrorMsg("VR not supported or unavailable.");
      return;
    }

    // 2) Switch Panolens to NORMAL mode (let WebXR drive rendering)
    try {
      const PAN = panolensAPIRef.current as any;
      const NORMAL =
        (PAN && PAN.Modes && (PAN.Modes.NORMAL ?? PAN.Modes.DEFAULT)) || 1;
      if (viewer.disableEffect) viewer.disableEffect();
      if (viewer.enableEffect) viewer.enableEffect(NORMAL);
    } catch (err) {
      console.warn("Panolens NORMAL mode set failed:", err);
    }

    try {
      // 3) Start WebXR session
      renderer.xr.enabled = true;
      if ((renderer.xr as any).setReferenceSpaceType) {
        (renderer.xr as any).setReferenceSpaceType("local-floor");
      }

      const session: XRSession = await navXR.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"],
      });

      if ((renderer.xr as any).setSession) {
        await (renderer.xr as any).setSession(session);
      }
      // Keep a reference so we can dispose on exit

      xrSessionRef.current = session;
      setXrActive(true);
      webvr?.onvrcontrollers?.();
      webvr?.onentervr?.();

      // Prefetch next/prev pano images in the background to make A/B instant
      try {
        await Promise.allSettled([
          prefetchLink(nextLinkRef.current),
          prefetchLink(prevLinkRef.current),
        ]);
      } catch {}

      // 4) Set up controllers and lasers (only if enabled)
      const ctrl0 = renderer.xr.getController(0) as THREE.Group;
      const ctrl1 = renderer.xr.getController(1) as THREE.Group;
      scene.add(ctrl0, ctrl1);

      if (ENABLE_LASERS) {
        const addLaser = (ctrl: THREE.Group) => {
          const laser = makeLaserLine(10);
          ctrl.add(laser);
          (ctrl as any).laser = laser;
        };
        addLaser(ctrl0);
        addLaser(ctrl1);
      }

      // Reset pano rotation
      pano.rotation.set(0, 0, 0);

      // 6) Stop non-XR RAF loop to avoid conflicts
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      rafRunningRef.current = false;

      // 7) Controller SELECT (trigger) → raycast to VR hotspots
      const onControllerSelect = (ev: any) => {
        try {
          const inputSource: XRInputSource = ev.inputSource;
          const handed = (inputSource && inputSource.handedness) || "right";
          const ctrlObj: THREE.Group = renderer.xr.getController(
            handed === "left" ? 0 : 1
          );
          if (!ctrlObj) return;

          const origin = new THREE.Vector3();
          const direction = new THREE.Vector3(0, 0, -1);
          ctrlObj.updateMatrixWorld(true);
          origin.setFromMatrixPosition(ctrlObj.matrixWorld);
          direction.applyMatrix4(ctrlObj.matrixWorld).sub(origin).normalize();

          const raycaster = new THREE.Raycaster(origin, direction, 0.01, 500);
          const group = vrHotspotGroupRef.current;
          if (!group || group.children.length === 0) return;

          const hits = raycaster.intersectObjects(group.children, true);
          const hit = hits.find(
            (h) => (h.object as any)?.userData?.type === "vr-link"
          );
          const targetId = (hit && (hit.object as any)?.userData?.targetId) as
            | string
            | undefined;
          if (targetId) navigateOnce(targetId);
        } catch (e) {
          console.warn("select handler error:", e);
        }
      };

      session.addEventListener("select", onControllerSelect);

      // 8) XR animation loop
      let lastLaserUpdate = 0;

      renderer.setAnimationLoop(() => {
        try {
          const xrSession = renderer.xr.getSession && renderer.xr.getSession();
          if (!xrSession) return;

          // Update lasers only periodically (if enabled)
          if (ENABLE_LASERS) {
            const nowTs = performance.now();
            if (nowTs - lastLaserUpdate > LASER_UPDATE_INTERVAL_MS) {
              lastLaserUpdate = nowTs;
              const rc = xrRaycasterRef.current || new THREE.Raycaster();
              xrRaycasterRef.current = rc;
              const target = vrHotspotGroupRef.current;
              if (target && target.children.length > 0) {
                updateLaserToHit(ctrl0, rc, target);
                updateLaserToHit(ctrl1, rc, target);
              }
            }
          }

          // --- Gamepads ---
          const sources = xrSession.inputSources || [];
          let leftGp: Gamepad | undefined;
          let rightGp: Gamepad | undefined;

          for (const src of sources) {
            const gp = (src as any).gamepad as Gamepad | undefined;
            if (!gp) continue;
            const hand = (src as any).handedness as XRHandedness | undefined;
            if (hand === "left") leftGp = gp;
            else if (hand === "right") rightGp = gp;
          }

          // Hide reticle if controllers are active
          if (reticleRef.current) {
            reticleRef.current.style.opacity = leftGp || rightGp ? "0" : "1";
          }

          // RIGHT STICK: look around
          if (rightGp) {
            const { right: rs } = xrGamepadSticks(rightGp);
            const x = dz(rs.x);
            const y = dz(rs.y);
            if (x || y) {
              const dYaw = -x * XR_YAW_SPEED * (1 / 60);
              const dPitch = y * XR_PITCH_SPEED * (1 / 60);
              rotatePanorama(pano, dYaw, dPitch);
            }
          }

          // LEFT GRIP + LEFT STICK: ZOOM
          let leftGripActive = false;
          if (leftGp) {
            const b = leftGp.buttons && leftGp.buttons[1];
            let squeezeVal = 0;
            if (b)
              squeezeVal =
                typeof b.value === "number" ? b.value : b.pressed ? 1 : 0;
            leftGripActive = squeezeVal > 0.15;

            const { left: ls } = xrGamepadSticks(leftGp);
            if (leftGripActive) {
              const zoomAxis = dz(-(ls.y || 0)); // up = zoom in
              if (zoomAxis) {
                const delta = -zoomAxis * (XR_ZOOM_FOV_SPEED * (1 / 60));
                setTargetFov(targetFovRef.current + delta);
              }
            }
          }

          // LEFT STICK: snap turn + nav (only when NOT gripping)
          if (leftGp && !leftGripActive) {
            const { left: ls } = xrGamepadSticks(leftGp);
            const nowTs = performance.now();

            // Forward/back navigation on left stick
            if (nowTs >= xrNavCooldownUntilRef.current) {
              const up = dz(-(ls.y || 0));
              if (up > XR_NAV_THRESH && nextLinkRef.current) {
                xrNavCooldownUntilRef.current = nowTs + XR_NAV_COOLDOWN_MS;
                persistPanoLocation(currentId);

                navigateOnceRef.current(nextLinkRef.current.targetId);
                // warm next/prev again after move
                prefetchLink(nextLinkRef.current);
                prefetchLink(prevLinkRef.current);
              } else if (up < -XR_NAV_THRESH && prevLinkRef.current) {
                xrNavCooldownUntilRef.current = nowTs + XR_NAV_COOLDOWN_MS;
                persistPanoLocation(currentId);

                navigateOnceRef.current(prevLinkRef.current.targetId);
                prefetchLink(nextLinkRef.current);
                prefetchLink(prevLinkRef.current);
              }
            }

            // Snap turn left/right
            const lx = dz(ls.x || 0);
            if (XR_SNAP_TURN_DEG > 0) {
              if (
                Math.abs(lx) > 0.75 &&
                nowTs >= xrSnapCooldownUntilRef.current
              ) {
                rotatePanorama(pano, (lx > 0 ? -1 : +1) * XR_SNAP_TURN_DEG, 0);
                xrSnapCooldownUntilRef.current =
                  nowTs + XR_SNAP_TURN_COOLDOWN_MS;
              }
            }
          }

          // RIGHT A/B: Next / Prev (edge-triggered)
          if (rightGp) {
            const btns = rightGp.buttons || [];
            const aNow = !!(btns[4] && btns[4].pressed);
            const bNow = !!(btns[5] && btns[5].pressed);

            if (aNow && !xrBtnAWasDownRef.current && nextLinkRef.current) {
              persistPanoLocation(currentId);

              navigateOnceRef.current(nextLinkRef.current.targetId);
              prefetchLink(nextLinkRef.current);
              prefetchLink(prevLinkRef.current);
            }
            if (bNow && !xrBtnBWasDownRef.current && prevLinkRef.current) {
              persistPanoLocation(currentId);

              navigateOnceRef.current(prevLinkRef.current.targetId);
              prefetchLink(nextLinkRef.current);
              prefetchLink(prevLinkRef.current);
            }

            xrBtnAWasDownRef.current = aNow;
            xrBtnBWasDownRef.current = bNow;
          }

          // Gaze ray for reticle/hover (only if needed)
          const getCam =
            viewer && viewer.getCamera
              ? viewer.getCamera.bind(viewer)
              : undefined;
          const cam: THREE.Camera =
            (getCam && getCam()) || (viewer && (viewer as any).camera);

          if (cam && rayRef.current && rayArrowRef.current) {
            cam.updateMatrixWorld(true);
            const origin = cam.getWorldPosition(new THREE.Vector3());
            const dir = new THREE.Vector3(0, 0, -1)
              .applyQuaternion(cam.quaternion)
              .normalize();
            rayRef.current.origin.copy(origin);
            rayRef.current.direction.copy(dir);
            rayArrowRef.current.position.copy(origin);
            rayArrowRef.current.setDirection(dir);

            if (rayMarkerRef.current) {
              const p = rayRef.current.at(
                INFOSPOT_RADIUS * 0.9,
                new THREE.Vector3()
              );
              rayMarkerRef.current.position.copy(p);
              rayMarkerRef.current.visible = true;
            }
          }

          // Hotspot hover highlight (limit to hotspot group)
          const group = vrHotspotGroupRef.current;
          const rc2 = xrRaycasterRef.current;
          const ray = rayRef.current;
          if (group && rc2 && ray && group.children.length > 0) {
            rc2.set(ray.origin, ray.direction);
            const hits = rc2.intersectObjects(group.children, true);
            const h0 = hits[0] && (hits[0].object as any);

            for (const child of group.children) {
              const m = child as THREE.Mesh;
              const isHit = m === h0 || m.parent === h0;
              m.scale.setScalar(isHit ? 1.12 : 1.0);
            }
          }
        } catch (err) {
          console.warn("XR loop error:", err);
        }
        const camera = viewer.getCamera?.() || (viewer as any).camera;
        renderer.render(scene, camera);
      });

      // 9) Session end cleanup
      session.addEventListener("end", () => {
        try {
          session.removeEventListener("select", onControllerSelect);
        } catch {}

        try {
          if (ENABLE_LASERS) {
            const removeLaser = (ctrl: THREE.Group) => {
              const laser = (ctrl as any).laser;
              if (laser) {
                ctrl.remove(laser);
                disposeObject3D(laser);
              }
            };
            removeLaser(ctrl0);
            removeLaser(ctrl1);
          }
          scene.remove(ctrl0, ctrl1);
        } catch {}

        try {
          if (vrHotspotGroupRef.current) {
            pano.remove(vrHotspotGroupRef.current);
            disposeObject3D(vrHotspotGroupRef.current);
            vrHotspotGroupRef.current = null;
          }
        } catch {}

        try {
          if (rayArrowRef.current) {
            scene.remove(rayArrowRef.current);
            disposeObject3D(rayArrowRef.current);
            rayArrowRef.current = null;
          }
          if (rayMarkerRef.current) {
            scene.remove(rayMarkerRef.current);
            disposeObject3D(rayMarkerRef.current);
            rayMarkerRef.current = null;
          }
        } catch {}

        setXrActive(false);
        xrSessionRef.current = null;
        renderer.xr.enabled = false;
        renderer.setAnimationLoop(null);
        startLoopRef.current?.(); // Restart non-XR loop
        webvr?.onexitvr?.();
      });
    } catch (err) {
      console.warn("enterXR failed:", err);
      webvr?.ondenied?.();
      setErrorMsg("Failed to enter VR.");
    }
  };

  const exitXR = async () => {
    try {
      await xrSessionRef.current?.end();
    } catch (err) {
      console.warn("exitXR failed:", err);
    }
  };

  /* ---------- styles ---------- */
  const normalModeBottomNavStyle: React.CSSProperties = {
    position: "absolute",
    ...logicalSides("left", "0%", isRTL),
    bottom: "2%",
    display: "flex",
    gap: "12px",
    zIndex: 12,
    padding: "8px 12px",
    borderRadius: 12,
    backdropFilter: "blur(4px)",
    transformOrigin: originStart(isRTL, "bottom"),
    transform: `scale(${uiScale})`,
  };
  const miniMapWrapStyle: React.CSSProperties = {
    position: "absolute",
    ...logicalSides("left", 14, isRTL),
    bottom: "1.4%",
    width: 160,
    height: 160,
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
    background: "#f8f8f8",
    zIndex: 20,
    outline: "1px solid rgba(109, 11, 11, 1)",
    transform: `scale(${uiScale})`,
    transformOrigin: originStart(isRTL, "bottom"),
  };

  const fullscreenBottomNavStyle: React.CSSProperties = {
    position: "absolute",
    left: "48%",
    bottom: "2%",
    display: "flex",
    gap: "12px",
    //zIndex: 12,
    padding: "8px 12px",
    borderRadius: 12,
    backdropFilter: "blur(4px)",
    transformOrigin: originStart(isRTL, "bottom"),
    transform: `scale(${uiScale})`,
    zIndex: 1002,
    pointerEvents: "auto",
    touchAction: "manipulation",
    userSelect: "none",
  };

  /* ---------- render ---------- */
  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#000",
        // Raise above the map only while WebXR VR is active
        ...(xrActive ? { zIndex: 2000 } : {}),
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          ...(xrActive ? { zIndex: 2001 } : {}),
        }}
      />

      {errorMsg && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "12%",
            transform: "translateX(-50%)",
            zIndex: 20,
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            fontSize: 14,
            boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
            maxWidth: 520,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {errorMsg}
        </div>
      )}
      {/* Gaze reticle */}
      <div
        ref={reticleRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 24 * uiScale,
          height: 24 * uiScale,
          marginLeft: -(12 * uiScale),
          marginTop: -(12 * uiScale),
          borderRadius: "999px",
          border: "2px solid rgba(255,255,255,0.9)",
          boxShadow: "0 0 0 2px rgba(0,0,0,0.35)",
          opacity: xrActive ? 1 : 0,
          transition: "opacity 200ms",
          pointerEvents: "none",
          zIndex: 40,
        }}
      />
      {xrSupported && !xrActive && isFullscreenReal && (
        <button
          onClick={enterXR}
          style={{ position: "absolute", top: 16, right: 16, zIndex: 41 }}
          title="Enter VR"
        >
          Enter VR
        </button>
      )}
      {xrActive && (
        <button
          onClick={exitXR}
          style={{ position: "absolute", top: 16, right: 16, zIndex: 41 }}
          title="Exit VR"
        >
          Exit VR
        </button>
      )}
      {/* close */}
      {/*{!isImmersive && (*/}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 10,
          ...logicalSides("right", 10, !isRTL ? false : true),
          zIndex: 10,
          border: "none",
          cursor: "pointer",
          transform: `scale(${uiScale})`,
          transformOrigin: lr("top right", "top left", isRTL),
          background: "transparent",
        }}
        aria-label="Close panorama"
      >
        <img
          src="/close2.png"
          alt=""
          style={{ width: 25, height: 25, display: "block" }}
        />
      </button>
      {/*)}*/}

      {/* fullscreen */}
      {!isImmersive && (
        <button
          onClick={() => {
            const el = rootRef.current;
            if (!el) return;
            !isFullscreenNow() ? enterFullscreen(el) : exitFullscreen();
          }}
          style={{
            position: "absolute",
            top: 10,
            ...logicalSides("left", 10, !isRTL ? false : true),
            zIndex: 10,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            transform: `scale(${uiScale})`,
            transformOrigin: lr("top left", "top right", isRTL),
          }}
        >
          {isFullscreenReal ? (
            <img src="/Exit.png" alt="Exit Fullscreen" width={30} height={30} />
          ) : (
            <img
              src="/fullscreen.png"
              alt="Fullscreen"
              width={30}
              height={30}
            />
          )}
        </button>
      )}

      {/* bottom nav (Prev / Next) */}
      {!isImmersive && navButtonsVisible && (
        <div
          style={
            isFullscreenReal
              ? fullscreenBottomNavStyle
              : normalModeBottomNavStyle
          }
        >
          <NavBtn
            label={isRTL ? "▶" : "◀"}
            title="Previous Panorama (S)"
            onClick={() => prevLink && navigateOnce(prevLink.targetId)}
            disabled={!prevLink}
          />
          <NavBtn
            label={isRTL ? "◀" : "▶"}
            title="Next Panorama (W)"
            onClick={() => nextLink && navigateOnce(nextLink.targetId)}
            disabled={!nextLink}
            primary
          />
        </div>
      )}

      {isFullscreenReal && !isImmersive && (
        <RightRailControls
          uiScale={uiScale}
          onGoNorth={goNorth}
          compassRotRef={compassRotRef}
          compassIconUrl={compassIconUrl}
          zoomPlusIconUrl={zoomPlusIconUrl}
          zoomMinusIconUrl={zoomMinusIconUrl}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
        />
      )}

      {/* MOVE / PAD-TOGGLE */}
      {isFullscreenReal && (
        <PanPad
          uiScale={uiScale}
          enabled={panButtonsEnabled}
          onToggle={() => setPanButtonsEnabled((v) => !v)}
          onLookUp={lookDown}
          onLookLeft={lookRight}
          onLookRight={lookLeft}
          onLookDown={lookUp}
          panSettingsIconUrl={panSettingsIconUrl}
          panUpIconUrl={panUpIconUrl}
          panLeftIconUrl={panLeftIconUrl}
          panRightIconUrl={panRightIconUrl}
          panDownIconUrl={panDownIconUrl}
        />
      )}

      {/* SETTINGS */}
      {isFullscreenReal && (
        <>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            title="Settings (M)"
            style={{
              position: "absolute",
              bottom: "0.6%",
              ...(isRTL ? { left: 16 } : { right: 16 }),
              zIndex: 12,
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#B8D0FFB2",
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              transform: `scale(${uiScale})`,
              transformOrigin: isRTL ? "bottom left" : "bottom right",
            }}
            aria-label="Settings"
          >
            <img src="/settings1.png" width={20} height={20} />
          </button>

          <VrSettingsPanel
            open={settingsOpen}
            uiScale={uiScale}
            mode={mode}
            onChangeMode={(opt) => {
              setMode(opt);
              const viewer = viewerRef.current;
              const PAN = panolensAPIRef.current;
              if (!viewer || !PAN) return;

              if (opt === "NORMAL") {
                viewer.disableEffect?.();
                viewer.enableEffect?.(PAN.Modes?.NORMAL ?? 1);
              } else if (opt === "CARDBOARD") {
                viewer.enableEffect?.(PAN.Modes?.CARDBOARD ?? 2);
              } else if (opt === "STEREO") {
                viewer.enableEffect?.(PAN.Modes?.STEREO ?? 3);
              }
              setSettingsOpen(false);
              viewer.render?.();
            }}
            navButtonsVisible={navButtonsVisible}
            onToggleNavButtons={() => setNavButtonsVisible((v) => !v)}
            xrSupported={xrSupported}
            xrActive={xrActive}
            onEnterXR={enterXR}
            onExitXR={exitXR}
          />
        </>
      )}

      {/* ---------- MINI-MAP targets ---------- */}
      <div
        ref={miniMapHiddenDivRef}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          left: -99999,
          top: -99999,
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
        }}
      />
      {isFullscreenReal && !isImmersive && hasLonLat && (
        <div style={miniMapWrapStyle}>
          <div
            ref={miniMapVisibleDivRef}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      )}

      {/* HUD layer */}
      {/*<div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 999,
          pointerEvents: "none",
        }}
      >
        {nextLink && (
          <ChevronHUD
            kind="forward"
            enabled={true}
            uiScale={uiScale}
            size={isFullscreenReal ? 120 : 72}
            leanDeg={leanNext}
            style={{
              left: "50%",
              bottom: isFullscreenReal ? "11%" : "8%",
              transform: `translateX(-50%) scale(${uiScale})`,
              pointerEvents: "auto",
            }}
            onClick={() => navigateOnce(nextLink.targetId)}
          />
        )}

        {prevLink && (
          <ChevronHUD
            kind="back"
            enabled={true}
            uiScale={uiScale}
            size={isFullscreenReal ? 120 : 72}
            leanDeg={leanPrev}
            style={{
              left: "50%",
              bottom: isFullscreenReal ? "3%" : "-7%",
              transform: `translateX(-50%) scale(${uiScale})`,
              pointerEvents: "auto",
            }}
            onClick={() => navigateOnce(prevLink.targetId)}
          />
        )}
      </div>*/}
    </div>
  );
}

/* ---------- small UI helpers ---------- */
type NavBtnProps = {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
};
function NavBtn(props: NavBtnProps) {
  const { label, title, onClick, disabled, primary } = props;
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? "#b8d0ffe1" : "#B8D0FFB2",
        color: "#ffffffff",
        border: "none",
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: "clamp(12px, 1.4vw, 18px)",
        lineHeight: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      }}
      aria-label={title}
    >
      {label}
    </button>
  );
}

/*function ChevronHUD({
  kind,
  enabled,
  uiScale = 1,
  leanDeg = 0,
  style,
  onClick,
  size = 120,
}: ChevronHUDProps) {
  const chevStyle = (_i: number): React.CSSProperties => ({
    width: size,
    height: size,
    margin: 0,
    opacity: enabled ? 1 : 0.6,
    filter: "drop-shadow(0 8px 10px rgba(0,0,0,.35))",
    transform: `perspective(900px) rotateX(58deg) rotate(${leanDeg}deg)`,
    pointerEvents: "none",
  });

  const wrapper: React.CSSProperties = {
    position: "absolute",
    zIndex: 9999,
    userSelect: "none",
    touchAction: "manipulation",
    cursor: enabled ? "pointer" : "default",
    ...style,
    transform: `${style?.transform ?? ""}${
      kind === "back" ? " rotate(180deg)" : ""
    }`,
  };

  const ChevSVG = ({ s }: { s: React.CSSProperties }) => (
    <svg viewBox="0 0 100 100" style={s} aria-hidden>
      <path
        d="M50 5 L95 60 Q50 52 5 60 Z"
        fill="#ffffffff"
        stroke="rgba(0,0,0,.1)"
        strokeWidth="2"
      />
    </svg>
  );

  return (
    <div
      onClick={enabled ? onClick : undefined}
      title={
        kind === "back"
          ? enabled
            ? "Go back"
            : "No back link"
          : enabled
          ? "Go forward"
          : "No forward link"
      }
      style={wrapper}
    >
      <ChevSVG s={chevStyle(0)} />
    </div>
  );
}*/
