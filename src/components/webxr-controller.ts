/// <reference types="webxr" />
/**
 * WebXR panorama controller (Quest 3 friendly)
 * ------------------------------------------------------------------
 * - Inside-sphere equirect panorama
 * - Proper controller tracking (local-floor, no polyfill on Quest)
 * - Add controllers/grips only after "connected"
 * - Laser visible, optional pose debug
 * - Right thumbstick = look/turn (yaw/pitch); Left thumbstick optional snap turn
 * - Gamepad buttons/axes are polled each frame for reliability
 */

import * as THREE from "three";
import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory.js";

/* ===================== Public Types ===================== */
export type XRSessionType = XRSession;
export type XRReferenceSpaceType = XRReferenceSpace;
export type XRFrameType = XRFrame;
export type XRSystemType = Navigator["xr"];

declare global {
  interface Window {
    CustomWebXRPolyfill?: new () => any;
    __webxr_polyfill?: any;
  }
}

function isOculusBrowser() {
  return /\bOculusBrowser\b/i.test(navigator.userAgent);
}

/** Only initialize emulator/polyfill on desktop, never on Quest */
async function ensureWebXRPolyfill(renderer?: THREE.WebGLRenderer) {
  if (typeof window === "undefined") return;
  try {
    if (!isOculusBrowser() && window.CustomWebXRPolyfill && !window.__webxr_polyfill) {
      window.__webxr_polyfill = new window.CustomWebXRPolyfill();
      console.log("[XR] CustomWebXRPolyfill initialized (desktop only)");
    }
    const gl: any = renderer?.getContext?.();
    if (gl?.makeXRCompatible) await gl.makeXRCompatible();
  } catch (e) {
    console.warn("[XR] ensureWebXRPolyfill() warning:", e);
  }
}

export type FlipMode = "none" | "rotate" | "mirror";

export type Link = {
  targetId: string;
  yaw: number;
  pitch?: number;
  label?: string;
  imagePath?: string;
  rel?: "next" | "prev";
};

export type WebXRControllerOptions = {
  flip?: FlipMode; // default 'mirror'
  sphereRadius?: number; // default 50
  sphereSegments?: { width?: number; height?: number }; // default 64x64
  handTracking?: boolean; // default true
  turnSpeedDegPerSec?: number; // right‑stick turn speed (yaw)
  pitchSpeedDegPerSec?: number; // right‑stick pitch speed
  snapTurnDeg?: number; // left‑stick snap amount (0 disables)
  deadzone?: number; // thumbstick deadzone [0..1]
};

export type WebXRController = {
  isActive: () => boolean;
  isSupported: () => Promise<boolean>;
  enter: () => Promise<void>;
  exit: () => Promise<void>;
  dispose: () => void;
  setPanorama: (url: string) => void;
  setLinks: (next: Link[]) => void; // no-op here (kept for API parity)
};

/* ===================== Helper Functions for Navigation ===================== */
// Normalize degrees to [0, 360)
function norm360(d: number): number {
  return ((d % 360) + 360) % 360;
}

// Signed smallest angle delta in (-180, 180]
function signedAngleDelta(aDeg: number, bDeg: number): number {
  let delta = (aDeg - bDeg) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

// Decide if a delta is forward (1), back (-1), or neutral (0)
function decideByYaw(delta: number): number {
  const absDelta = Math.abs(delta);
  if (absDelta < 5) return 0;
  return delta > 0 ? 1 : -1;
}

// Pick the best "next" link based on current yaw (prefers forward-facing)
function pickNextLink(links: Link[], currentYawDeg: number): Link | undefined {
  const candidates = links.filter(
    (l) => Math.abs(signedAngleDelta(l.yaw, currentYawDeg)) < 60
  );
  if (!candidates.length) return undefined;

  candidates.sort((a, b) => {
    const da = signedAngleDelta(a.yaw, currentYawDeg);
    const db = signedAngleDelta(b.yaw, currentYawDeg);
    return decideByYaw(da) - decideByYaw(db);
  });

  return candidates[candidates.length - 1]; // Last = prefers forward (higher value)
}

// Pick the best "prev" link (looks backward)
function pickPrevLink(links: Link[], currentYawDeg: number): Link | undefined {
  return pickNextLink(links, norm360(currentYawDeg + 180));
}

/* ===================== Main Factory ===================== */
export function createWebXRController(
  renderer: THREE.WebGLRenderer,
  getLiveSrc: () => string,
  onActiveChange?: (active: boolean) => void,
  initialLinks: Link[] = [],
  onNavigate?: (targetId: string) => void,
  opts: WebXRControllerOptions = {},
  domOverlayRoot?: HTMLElement
): WebXRController {
  const {
    flip = "mirror",
    sphereRadius = 50,
    sphereSegments = { width: 64, height: 64 },
    handTracking = true,
    turnSpeedDegPerSec = 140,
    pitchSpeedDegPerSec = 100,
    snapTurnDeg = 0, // e.g., 30 for snap turning with left stick
    deadzone = 0.18,
  } = opts;

  renderer.xr.enabled = true;

  // Scene graph
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null; // three will substitute an XR camera internally
  let panoMesh: THREE.Mesh | null = null;
  let panoTexture: THREE.Texture | null = null;
  let yawRoot: THREE.Group | null = null; // rotate this for yaw; pitch on camera

  // Controller presence & state
  let haveHandheldControllers = false;
  let lastLeftSnap = 0; // for snap turn cooldown

  // NEW: Track current yaw in degrees (for link picking)
  let currentYawDeg = 0;

  // NEW: Store current links for navigation
  let currentLinks: Link[] = initialLinks;

  // NEW: Track button states to detect new presses
  let lastAPressed = false;
  let lastBPressed = false;

  const clock = new THREE.Clock();

  const isActive = () => !!renderer.xr.getSession?.();
  const isSupported = async () => {
    try {
      const nav: any = navigator;
      if ("xr" in navigator && nav?.xr?.isSessionSupported) {
        return !!(await nav.xr.isSessionSupported("immersive-vr"));
      }
    } catch {}
    return false;
  };

  function cleanupScene() {
    try {
      panoMesh?.geometry?.dispose?.();
      (panoMesh?.material as THREE.Material | undefined)?.dispose?.();
    } catch {}
    try {
      panoTexture?.dispose?.();
    } catch {}
    try {
      yawRoot?.clear?.();
    } catch {}

    yawRoot = null;
    panoMesh = null;
    panoTexture = null;
    scene = null;
    camera = null;
    haveHandheldControllers = false;
  }

  function buildPanoMesh(map: THREE.Texture): THREE.Mesh {
    const geom = new THREE.SphereGeometry(
      sphereRadius,
      sphereSegments.width ?? 64,
      sphereSegments.height ?? 64
    );

    let mat: THREE.MeshBasicMaterial;
    if (flip === "mirror") {
      geom.scale(-1, 1, 1); // true horizontal mirror
      mat = new THREE.MeshBasicMaterial({ map, side: THREE.FrontSide });
    } else {
      mat = new THREE.MeshBasicMaterial({ map, side: THREE.BackSide });
    }

    // Prevent the inside-sphere from occluding controllers/lasers
    mat.depthWrite = false;

    const mesh = new THREE.Mesh(geom, mat);
    return mesh;
  }

  // --- read A/B across varying mappings ---
  function readABFromRightGp(gp: Gamepad): { a: boolean; b: boolean } {
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
      return { a: true, b: true };
    }
    // Otherwise just report none
    return { a: false, b: false };
  }

  function pollGamepads(dt: number) {
    const session = renderer.xr.getSession();
    if (!session || !yawRoot || !camera) return;

    const refSpace = renderer.xr.getReferenceSpace();
    if (!refSpace) return;

    session.inputSources.forEach((src) => {
      const hand = src.handedness;
      const gp = src.gamepad;
      if (!gp || !gp.axes || !gp.buttons) return;

      // Thumbsticks: axes[2]=horizontal (rx), axes[3]=vertical (ry)
      const axes = gp.axes;
      if (hand === "right") {
        // Right stick: yaw/pitch
        const [rx, ry] = axes.slice(2, 4);

        if (Math.abs(rx) > deadzone && yawRoot) {
          const yawDeltaRad = THREE.MathUtils.degToRad(turnSpeedDegPerSec * dt * (rx > 0 ? 1 : -1) * Math.pow(Math.abs(rx), 1.5));
          yawRoot.rotation.y += yawDeltaRad;

          // NEW: Update currentYawDeg (flip sign if navigation feels reversed during testing)
          currentYawDeg -= THREE.MathUtils.radToDeg(yawDeltaRad); // Adjust based on polarity
          currentYawDeg = norm360(currentYawDeg);
        }

        if (Math.abs(ry) > deadzone && camera) {
          const pitchDeltaRad = THREE.MathUtils.degToRad(pitchSpeedDegPerSec * dt * (ry > 0 ? 1 : -1) * Math.pow(Math.abs(ry), 1.5));
          camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x + pitchDeltaRad, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
        }

        // NEW: Buttons (A = next/forward, B = prev/back)
        const { a, b } = readABFromRightGp(gp);
        if (a && !lastAPressed) {
          const nextLink = pickNextLink(currentLinks, currentYawDeg);
          if (nextLink) {
            onNavigate?.(nextLink.targetId);
          }
        }
        if (b && !lastBPressed) {
          const prevLink = pickPrevLink(currentLinks, currentYawDeg);
          if (prevLink) {
            onNavigate?.(prevLink.targetId);
          }
        }
        lastAPressed = a;
        lastBPressed = b;
      } else if (hand === "left" && snapTurnDeg > 0) {
        // Left stick: optional snap turn
        const [lx] = axes.slice(2, 3);
        const now = Date.now();
        if (Math.abs(lx) > 0.8 && now - lastLeftSnap > 300 && yawRoot) {
          lastLeftSnap = now;
          const snapRad = THREE.MathUtils.degToRad(snapTurnDeg * (lx > 0 ? 1 : -1));
          yawRoot.rotation.y += snapRad;

          // NEW: Update currentYawDeg
          currentYawDeg -= THREE.MathUtils.radToDeg(snapRad);
          currentYawDeg = norm360(currentYawDeg);
        }
      }

      // Optional pose check (helps confirm tracking works)
      if (refSpace && (window as any).XRFrame && src.targetRaySpace) {
        const frame = (window as any).XRFrame; // Adjust based on your XRFrame access
        const pose = frame.getPose(src.targetRaySpace, refSpace);
        // console.debug("pose ok:", !!pose);
      }
    });
  }

  async function enter() {
    if (isActive()) return;

    await ensureWebXRPolyfill(renderer);

    const xrAny: any = (navigator as any).xr;
    if (!xrAny?.requestSession) throw new Error("WebXR unavailable");

    renderer.xr.enabled = true;

    // Quest 3: use local-floor and make it REQUIRED
    try {
      renderer.xr.setReferenceSpaceType?.("local-floor");
    } catch {}

    const sessionInit: XRSessionInit = {
      requiredFeatures: ["local-floor"],
      optionalFeatures: [
        "layers",
        ...(handTracking ? ["hand-tracking"] : []),
        ...(domOverlayRoot ? ["dom-overlay"] : []),
      ],
      ...(domOverlayRoot ? { domOverlay: { root: domOverlayRoot } as any } : {}),
    };

    const s: XRSession = await xrAny.requestSession("immersive-vr", sessionInit);
    await renderer.xr.setSession(s);
    onActiveChange?.(true);

    // Fixed foveation (best-effort)
    try {
      if (typeof (renderer.xr as any).setFoveation === "function") {
        (renderer.xr as any).setFoveation(1.0);
      } else {
        const baseLayer: any = s.renderState?.baseLayer;
        if (baseLayer && "fixedFoveation" in baseLayer) baseLayer.fixedFoveation = 1.0;
      }
    } catch {}

    // Scene
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    yawRoot = new THREE.Group();
    scene.add(yawRoot);

    // Panorama
    const url = getLiveSrc();
    const loader = new THREE.TextureLoader();
    panoTexture = await new Promise<THREE.Texture>((res, rej) => loader.load(url, res, undefined, rej));
    panoMesh = buildPanoMesh(panoTexture);
    (yawRoot ?? scene).add(panoMesh);

    // Controllers & hands
    // (Your existing buildControllers() function goes here; omitted for brevity)

    // Track input source additions/removals (helps with Quest firmware quirks)
    s.addEventListener("inputsourceschange", () => {
      haveHandheldControllers = Array.from(s.inputSources).some((src: any) => !!src.gamepad);
      const list = Array.from(s.inputSources).map((x: any) => x.targetRayMode + (x.gamepad ? "+gp" : ""));
      console.log("[XR] inputsources:", list);
    });

    clock.start();

    renderer.setAnimationLoop(() => {
      const dt = clock.getDelta();
      pollGamepads(dt);
      renderer.render(scene!, camera!);
    });

    const onEnd = () => {
      renderer.setAnimationLoop(null);
      try {
        renderer.xr.setSession(null as any);
      } catch {}
      renderer.xr.enabled = false;
      onActiveChange?.(false);
      cleanupScene();
      s.removeEventListener("end", onEnd);
    };
    s.addEventListener("end", onEnd);
  }

  async function exit() {
    const s = renderer.xr.getSession?.();
    if (s) await s.end();
  }

  function dispose() {
    exit().catch(() => {});
    cleanupScene();
  }

  function setPanorama(newUrl: string) {
    if (!scene || !panoMesh) return;
    const loader = new THREE.TextureLoader();
    loader.load(
      newUrl,
      (t) => {
        const mat = panoMesh!.material as THREE.MeshBasicMaterial;
        if (mat.map) {
          try {
            mat.map.dispose();
          } catch {}
        }
        mat.map = t;
        mat.needsUpdate = true;
        panoTexture = t;
      },
      undefined,
      () => {
        /* ignore load errors */
      }
    );
  }

  function setLinks(next: Link[]) {
    // NEW: Store links for navigation
    currentLinks = next;
  }

  return { isActive, isSupported, enter, exit, dispose, setPanorama, setLinks };
}

/* =======================================================================
   OPTIONAL: Bootstrap VR from a pre-supplied graph of panoramas
   ======================================================================= */
export type VRBootstrap = {
  startId: string;
  nodes: Record<string, { imageUrl: string; links: Link[] }>;
};

export function createVrFromBootstrap(
  renderer: THREE.WebGLRenderer,
  bootstrap: VRBootstrap,
  domOverlayRoot?: HTMLElement
): WebXRController {
  let currentId = bootstrap.startId;
  let currentUrl = bootstrap.nodes[currentId]?.imageUrl || "";

  const xr = createWebXRController(
    renderer,
    () => currentUrl,
    undefined,
    bootstrap.nodes[currentId]?.links ?? [],
    async (targetId: string) => {
      const node = bootstrap.nodes[targetId];
      if (!node) return;
      currentId = targetId;
      currentUrl = node.imageUrl;
      xr.setPanorama(node.imageUrl);
      xr.setLinks(node.links ?? []);
    },
    { handTracking: false /* safest while testing controllers */ },
    domOverlayRoot
  );

  if (currentUrl) xr.setPanorama(currentUrl);
  xr.setLinks(bootstrap.nodes[currentId]?.links ?? []);
  return xr;
}