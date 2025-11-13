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
  latitude?: number;
  longitude?: number;
  imagePath?: string;
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
    if (flip === "rotate") mesh.rotation.y = Math.PI; // 180°
    return mesh;
  }

  function buildControllers() {
    const factory = new XRControllerModelFactory();

    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);

      // Laser (helps you see orientation immediately)
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, -1),
        ]),
        new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95 })
      );
      line.scale.z = Math.max(8, (sphereRadius ?? 50) * 1.2);
      c.add(line);

      c.addEventListener("connected", (e: any) => {
        scene!.add(c);
        const gp: Gamepad | undefined = e?.data?.gamepad ?? (e?.data?.inputSource as any)?.gamepad;
        if (gp) haveHandheldControllers = true;
        console.log(`[XR] controller ${i} connected`, e?.data);
      });
      c.addEventListener("disconnected", () => {
        scene!.remove(c);
        const sess = renderer.xr.getSession?.();
        haveHandheldControllers = !!sess && Array.from(sess.inputSources).some((s: any) => !!s?.gamepad);
        console.log(`[XR] controller ${i} disconnected`);
      });

      // Basic select logging
      c.addEventListener("selectstart", () => console.log("[XR] selectstart", i));
      c.addEventListener("selectend", () => console.log("[XR] selectend", i));
      c.addEventListener("squeezestart", () => console.log("[XR] squeezestart", i));
      c.addEventListener("squeezeend", () => console.log("[XR] squeezeend", i));

      // Grip + visible model
      const g = renderer.xr.getControllerGrip(i);
      if (g) {
        g.add(factory.createControllerModel(g));
        g.addEventListener("connected", () => scene!.add(g));
        g.addEventListener("disconnected", () => scene!.remove(g));
      }
    }
  }

  function applyDeadzone(v: number, dz: number) {
    return Math.abs(v) < dz ? 0 : v;
  }

  // Reads XR-standard gamepads and performs look/turn based on right stick
  function pollGamepads(dt: number) {
    const sess = renderer.xr.getSession?.();
    if (!sess) return;

    const refSpace: XRReferenceSpace | undefined = (renderer.xr as any).getReferenceSpace?.();
    const frame: XRFrame | undefined = (renderer as any).xr.getFrame?.();

    // Snap turn cooldown (~250ms)
    const snapCooldown = 0.25;
    lastLeftSnap = Math.max(0, lastLeftSnap - dt);

    for (const src of sess.inputSources) {
      const gp = (src as any).gamepad as Gamepad | undefined;
      if (!gp) continue; // hands don't have gamepads

      // Per WebXR standard, thumbsticks are named
      const rightStick: any = (gp as any)["xr-standard-thumbstick"]; // chromium alias
      const leftStick: any = (gp as any)["xr-standard-thumbstick"]; // some browsers only expose one; we'll also read axes by index

      // Fallback to indices when the alias objects are not present
      const ax0 = gp.axes[0] ?? 0; // left X
      const ax1 = gp.axes[1] ?? 0; // left Y
      const ax2 = gp.axes[2] ?? 0; // right X
      const ax3 = gp.axes[3] ?? 0; // right Y

      const rx = applyDeadzone((rightStick?.xAxis ?? ax2) as number, deadzone);
      const ry = applyDeadzone((rightStick?.yAxis ?? ax3) as number, deadzone);

      // === Right stick: look (turn & pitch) ===
      const yawPerSec = THREE.MathUtils.degToRad(turnSpeedDegPerSec);
      const pitchPerSec = THREE.MathUtils.degToRad(pitchSpeedDegPerSec);
      if (yawRoot) yawRoot.rotation.y -= rx * yawPerSec * dt; // turn left/right
      if (camera) {
        camera.rotation.x = THREE.MathUtils.clamp(
          camera.rotation.x - ry * pitchPerSec * dt, // look up/down
          -Math.PI / 2 + 0.01,
          Math.PI / 2 - 0.01
        );
      }

      // === Left stick: optional snap turn ===
      const lx = applyDeadzone(ax0, deadzone);
      if (snapTurnDeg > 0 && Math.abs(lx) > 0.8 && lastLeftSnap === 0 && yawRoot) {
        const snap = THREE.MathUtils.degToRad(snapTurnDeg) * Math.sign(lx);
        yawRoot.rotation.y -= snap;
        lastLeftSnap = snapCooldown;
      }

      // === Buttons (simple logging so you can see they fire) ===
      gp.buttons.forEach((b, bi) => {
        // You can map specific indices here for A/B/X/Y triggers
        if ((b as any).pressed) {
          // Example: A button (often index 0) could trigger navigation
          if (bi === 0) {
            // onNavigate?.("next-id");
          }
        }
      });

      // Optional pose check (helps confirm tracking works)
      if (refSpace && frame && src.targetRaySpace) {
        const pose = frame.getPose(src.targetRaySpace, refSpace);
        // console.debug("pose ok:", !!pose);
      }
    }
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
    buildControllers();

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

  function setLinks(_next: Link[]) {
    // Intentionally no-op here; re-enable your hotspot system later.
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
