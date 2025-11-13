"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

export type WebXRViewerProps = {
  /** Direct texture URL or blob: URL (preferred). If omitted, provide imagePath+resolveImagePath. */
  src?: string;

  /** Relative or absolute API image path, e.g. "Panos/288843846312647.jpg" */
  imagePath?: string;

  /** Resolve imagePath -> final fetchable URL or blob: URL */
  resolveImagePath?: (p: string) => Promise<string>;

  onClose: () => void;

  /** XR controller callbacks */
  onNext?: () => void;
  onPrev?: () => void;

  /** Initial yaw in degrees */
  startYawDeg?: number;
};

// --- Compatibility for setSession (TS null/undefined) ---
async function setXRSessionCompat(
  renderer: THREE.WebGLRenderer,
  session: XRSession | null | undefined
) {
  const xrAny = renderer.xr as any;
  if (session) return xrAny.setSession(session);
  try { return await xrAny.setSession?.(null); } catch {}
  try { return await xrAny.setSession?.(undefined); } catch {}
}

// --- Helper: read right-stick X axis ---
function getRightStickX(session?: XRSession | null): number {
  if (!session) return 0;
  for (const src of session.inputSources) {
    if (src.handedness !== "right" || !src.gamepad) continue;
    const axes = src.gamepad.axes || [];
    let x = 0;
    if (axes.length >= 1) x = axes[0];
    if (axes.length >= 3 && Math.abs(axes[2]) > Math.abs(x)) x = axes[2];
    return x;
  }
  return 0;
}

export default function WebXRViewer({
  src,
  imagePath,
  resolveImagePath,
  onClose,
  onNext,
  onPrev,
  startYawDeg = 0,
}: WebXRViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const panoMeshRef = useRef<THREE.Mesh | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const cleanupTexRef = useRef<() => void>(() => {});
  const btnAWasDown = useRef(false);
  const btnBWasDown = useRef(false);

  // ---------- Build scene once ----------
  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.xr.enabled = true;
    renderer.setPixelRatio(Math.max(1, window.devicePixelRatio || 1));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, host.clientWidth / host.clientHeight, 0.1, 2000);

    // Inside sphere
    const geom = new THREE.SphereGeometry(500, 64, 48);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x222222 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.y = THREE.MathUtils.degToRad(startYawDeg);
    scene.add(mesh);
    panoMeshRef.current = mesh;

    // Resize
    const onResize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    // ---------- Controller rotation + A/B button nav ----------
    let yaw = THREE.MathUtils.degToRad(startYawDeg);
    let yawVel = 0;
    const DEADZONE = 0.15;
    const TURN_SPEED_DEG_PER_SEC = 220;
    const FRICTION = 0.86;

    let prev = performance.now();
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.max(0.001, (now - prev) / 1000);
      prev = now;

      const xrSession = renderer.xr.getSession();
      const x = getRightStickX(xrSession);
      const ax = Math.abs(x) < DEADZONE ? 0 : x;
      const turnPerSec = THREE.MathUtils.degToRad(TURN_SPEED_DEG_PER_SEC);

      yawVel += (-ax * turnPerSec) * dt;
      yawVel *= FRICTION;
      yaw += yawVel * dt;

      // --- Handle A/B buttons (for next/prev pano) ---
      if (xrSession) {
        for (const src of xrSession.inputSources) {
          const gp = src.gamepad;
          if (!gp || src.handedness !== "right") continue;

          const btnA = gp.buttons[0]; // A
          const btnB = gp.buttons[1]; // B

          if (btnA?.pressed && !btnAWasDown.current) {
            btnAWasDown.current = true;
            onNext?.();
          } else if (!btnA?.pressed) {
            btnAWasDown.current = false;
          }

          if (btnB?.pressed && !btnBWasDown.current) {
            btnBWasDown.current = true;
            onPrev?.();
          } else if (!btnB?.pressed) {
            btnBWasDown.current = false;
          }
        }
      }

      if (panoMeshRef.current) panoMeshRef.current.rotation.y = yaw;
      renderer.render(scene, camera);
    });

    rendererRef.current = renderer;

    return () => {
      try { ro.disconnect(); } catch {}
      try { renderer.setAnimationLoop(null); } catch {}
      try {
        (mesh.material as any)?.map?.dispose?.();
        (mesh.material as any)?.dispose?.();
        geom.dispose();
      } catch {}
      try { renderer.dispose(); renderer.domElement.remove(); } catch {}
      cleanupTexRef.current?.();
    };
  }, [startYawDeg, onNext, onPrev]);

  // ---------- Load texture ----------
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let url = src || "";
        if (!url && imagePath) {
          url = resolveImagePath ? await resolveImagePath(imagePath) : imagePath;
        }
        if (!url || !panoMeshRef.current) return;

        const loader = new THREE.TextureLoader();
        loader.load(url, (texture) => {
          if (!active || !panoMeshRef.current) return;
          texture.flipY = true; // equirect
          texture.wrapS = THREE.RepeatWrapping;
          texture.repeat.x = -1;
          texture.offset.x = 1;
          texture.colorSpace = THREE.SRGBColorSpace;

          const oldMat = panoMeshRef.current.material as any;
          panoMeshRef.current.material = new THREE.MeshBasicMaterial({
            side: THREE.BackSide,
            map: texture,
          });

          cleanupTexRef.current = () => {
            texture.dispose();
            oldMat?.map?.dispose?.();
            oldMat?.dispose?.();
          };
        });
      } catch {}
    })();
    return () => { active = false; };
  }, [src, imagePath, resolveImagePath]);

  // ---------- Enter XR automatically ----------
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const xr: any = (navigator as any).xr;
        const renderer = rendererRef.current;
        if (!xr || !renderer?.xr?.setSession) return;
        const supported = await xr.isSessionSupported?.("immersive-vr");
        if (!supported || cancel) return;
        const session = await xr.requestSession("immersive-vr", {
          requiredFeatures: [],
          optionalFeatures: ["local-floor", "bounded-floor"],
        });
        sessionRef.current = session;
        await setXRSessionCompat(renderer, sessionRef.current);
        session.addEventListener("end", () => {
          sessionRef.current = null;
          onClose();
        });
      } catch {}
    })();
    return () => { cancel = true; };
  }, [onClose]);

  const handleClose = async () => {
    try { await sessionRef.current?.end(); } catch {}
    onClose();
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      <button
        onClick={handleClose}
        style={{
          position: "absolute", top: 12, left: 12, zIndex: 10,
          padding: "8px 12px", borderRadius: 8, border: "none",
          background: "rgba(255,255,255,0.85)", fontWeight: 700, cursor: "pointer",
        }}
      >
        Close
      </button>
    </div>
  );
}
