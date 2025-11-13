// ================================
// /src/components/WebXRViewerPlus.tsx
// ================================
"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/** Public hotspot type for the wrapper */
export type XRHotspot = {
  id: string;
  yawDeg: number;
  pitchDeg?: number;
  label?: string;
  targetId?: string; // optional routing payload
};

export type WebXRViewerPlusProps = {
  /** Direct texture URL or blob: URL. If omitted, provide imagePath + resolveImagePath. */
  src?: string;
  /** Relative/absolute API image path */
  imagePath?: string;
  /** Resolve imagePath -> final fetchable URL or blob: URL */
  resolveImagePath?: (p: string) => Promise<string> | string;

  /** Initial yaw in degrees */
  startYawDeg?: number;

  /** XR controller callbacks */
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;

  /** Hotspots */
  hotspots?: XRHotspot[];
  onHotspot?: (h: XRHotspot) => void;
};

// --- Compatibility for setSession (TS null/undefined) ---
async function setXRSessionCompat(
  renderer: THREE.WebGLRenderer,
  session: XRSession | null | undefined
) {
  const xrAny = renderer.xr as any;
  if (session) return xrAny.setSession(session);
  try {
    return await xrAny.setSession?.(null);
  } catch {}
  try {
    return await xrAny.setSession?.(undefined);
  } catch {}
}

// --- Helper: read right-stick X axis ---
function getRightStickX(session?: XRSession | null): number {
  if (!session) return 0;
  for (const src of session.inputSources) {
    if (src.handedness !== "right" || !src.gamepad) continue;
    const a = src.gamepad.axes || [];
    let x = 0;
    if (a.length >= 1) x = a[0];
    if (a.length >= 3 && Math.abs(a[2]) > Math.abs(x)) x = a[2];
    return x;
  }
  return 0;
}

// Convert yaw/pitch (deg) to vector on unit sphere (inside view)
function dirFromYawPitch(yawDeg: number, pitchDeg = 0): THREE.Vector3 {
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  const x = Math.sin(yaw) * Math.cos(pitch);
  const y = Math.sin(pitch);
  const z = Math.cos(yaw) * Math.cos(pitch);
  // inside the sphere (invert)
  return new THREE.Vector3(x, y, z).normalize().multiplyScalar(-1);
}

export default function WebXRViewerPlus({
  src,
  imagePath,
  resolveImagePath,
  onClose,
  onNext,
  onPrev,
  startYawDeg = 0,
  hotspots = [],
  onHotspot,
}: WebXRViewerPlusProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Double-buffered pano meshes
  const meshARef = useRef<THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null>(null);
  const meshBRef = useRef<THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null>(null);
  const activeIdxRef = useRef<0 | 1>(0); // 0 = A visible, 1 = B visible
  const sessionRef = useRef<XRSession | null>(null);

  const cleanupTexRef = useRef<() => void>(() => {});
  const btnAWasDown = useRef(false);
  const btnBWasDown = useRef(false);

  // hotspot internals
  const hotspotGroupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const rightRayRef = useRef<THREE.Line | null>(null);
  const tmpMat4 = useRef(new THREE.Matrix4());
  const tmpVec3 = useRef(new THREE.Vector3());
  const hoveredIdRef = useRef<string | null>(null);
  const lastTriggerDownRef = useRef(false);

  const [showEnterVR, setShowEnterVR] = useState(false);

  async function startXR() {
    try {
      const xr: any = (navigator as any).xr;
      const renderer = rendererRef.current;
      if (!xr || !renderer?.xr?.setSession) throw new Error("No WebXR");
      const supported = await xr.isSessionSupported?.("immersive-vr");
      if (!supported) throw new Error("immersive-vr not supported");

      const session: XRSession = await xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor"],
      });

      sessionRef.current = session;
      await setXRSessionCompat(renderer, session);

      session.addEventListener("end", async () => {
        sessionRef.current = null;
        try {
          await setXRSessionCompat(renderer, null);
        } catch {}
        onClose();
      });

      setShowEnterVR(false);
    } catch (e) {
      console.warn("[XR] requestSession blocked or failed:", e);
      setShowEnterVR(true); // show button if auto-enter failed
    }
  }

  // ---------- Build scene once ----------
  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.xr.enabled = true;

    // Color management (new & old Three)
    if ("outputColorSpace" in renderer) {
      (renderer as any).outputColorSpace = THREE.SRGBColorSpace;
    } else {
      (renderer as any).outputEncoding = (THREE as any).sRGBEncoding;
    }
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    renderer.setPixelRatio(Math.max(1, window.devicePixelRatio || 1));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      host.clientWidth / host.clientHeight,
      0.1,
      2000
    );

    // Raycaster
    const rc = new THREE.Raycaster();
    (rc as any).params.Sprite = { threshold: 0.6 };
    raycasterRef.current = rc;

    // Shared sphere geometry
    const geom = new THREE.SphereGeometry(500, 64, 48);

    // Two materials; start white (map gets assigned later)
    const matA = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0xffffff });
    const matB = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0xffffff });

    // Two meshes
    const meshA = new THREE.Mesh(geom, matA);
    const meshB = new THREE.Mesh(geom, matB);
    meshA.rotation.y = THREE.MathUtils.degToRad(startYawDeg);
    meshB.rotation.y = THREE.MathUtils.degToRad(startYawDeg);
    meshA.visible = true;
    meshB.visible = false;
    scene.add(meshA);
    scene.add(meshB);
    meshARef.current = meshA;
    meshBRef.current = meshB;

    // Hotspot group
    const hotspotGroup = new THREE.Group();
    scene.add(hotspotGroup);
    hotspotGroupRef.current = hotspotGroup;

    // Visible right-hand ray line
    const rayGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const rayLine = new THREE.Line(
      rayGeom,
      new THREE.LineBasicMaterial({ depthTest: false, depthWrite: false })
    );
    rayLine.visible = true;
    scene.add(rayLine);
    rightRayRef.current = rayLine;

    // Resize (skip while presenting to avoid Quest blank frame)
    const onResize = () => {
      const w = host.clientWidth,
        h = host.clientHeight;
      const xrSys: any = renderer.xr;
      if (xrSys?.isPresenting) return; // skip while in VR
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    // ---------- Controller rotation + A/B nav + hotspot interaction ----------
    let yaw = THREE.MathUtils.degToRad(startYawDeg);
    let yawVel = 0;
    const DEADZONE = 0.15;
    const TURN_SPEED_DEG_PER_SEC = 220;
    const FRICTION = 0.86;
    const SPHERE_RADIUS = 500;

    // hotspot sprite factory
    const makeSprite = (label?: string) => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.stroke();
      if (label) {
        ctx.fillStyle = "white";
        ctx.font = "bold 64px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, size / 2, size / 2);
      }
      const tex = new THREE.CanvasTexture(canvas);
      if ("colorSpace" in tex) (tex as any).colorSpace = THREE.SRGBColorSpace;
      else (tex as any).encoding = (THREE as any).sRGBEncoding;
      const smat = new THREE.SpriteMaterial({
        map: tex,
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(smat);
      sprite.scale.setScalar(24);
      (sprite as any).__dispose = () => {
        tex.dispose();
        smat.dispose();
      };
      return sprite;
    };

    const rebuildSprites = (list: XRHotspot[]) => {
      // clear
      while (hotspotGroup.children.length) {
        const ch = hotspotGroup.children.pop()!;
        (ch as any).__dispose?.();
        (ch as any).material?.dispose?.();
        (ch as any).geometry?.dispose?.();
      }
      // add
      for (const h of list) {
        const s = makeSprite(h.label);
        const dir = dirFromYawPitch(h.yawDeg, h.pitchDeg ?? 0);
        s.position.copy(dir.multiplyScalar(SPHERE_RADIUS - 0.1));
        s.userData.id = h.id;
        hotspotGroup.add(s);
      }
    };

    let prev = performance.now();
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.max(0.001, (now - prev) / 1000);
      prev = now;

      const xrSession = renderer.xr.getSession();
      const x = getRightStickX(xrSession);
      const ax = Math.abs(x) < DEADZONE ? 0 : x;
      const turnPerSec = THREE.MathUtils.degToRad(TURN_SPEED_DEG_PER_SEC);

      yawVel += -ax * turnPerSec * dt;
      yawVel *= FRICTION;
      yaw += yawVel * dt;

      // rotate whichever mesh is currently visible
      const activeMesh = activeIdxRef.current === 0 ? meshA : meshB;
      activeMesh.rotation.y = yaw;

      // --- Read right controller pose for ray + trigger ---
      if (xrSession) {
        for (const src of xrSession.inputSources) {
          if (src.handedness !== "right" || !src.targetRaySpace) continue;

          const refSpace: XRReferenceSpace | undefined = (renderer.xr as any).getReferenceSpace?.();
          const frame: XRFrame | undefined = (renderer.xr as any).getFrame?.();

          if (refSpace && frame && rightRayRef.current) {
            const pose = frame.getPose(src.targetRaySpace, refSpace);
            if (pose) {
              const m = tmpMat4.current.fromArray(pose.transform.matrix as any);
              const origin = tmpVec3.current.setFromMatrixPosition(m);
              const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(m).sub(origin).normalize();

              // update visible ray line
              const positions = (rightRayRef.current.geometry as THREE.BufferGeometry).getAttribute(
                "position"
              ) as THREE.BufferAttribute;
              positions.setXYZ(0, origin.x, origin.y, origin.z);
              positions.setXYZ(1, origin.x + dir.x * 5, origin.y + dir.y * 5, origin.z + dir.z * 5);
              positions.needsUpdate = true;

              // Raycast sprites with XR camera
              const rc = raycasterRef.current!;
              const xrCam = (renderer.xr as any)?.getCamera?.(camera) || camera;
              (rc as any).camera = xrCam;
              rc.set(origin, dir);

              const sprites = hotspotGroup.children as THREE.Sprite[];
              if (sprites.length) {
                const hits = rc.intersectObjects(sprites, false);
                const top = hits[0]?.object as THREE.Sprite | undefined;
                sprites.forEach((s) => s.scale.setScalar(top && s === top ? 30 : 24));
                hoveredIdRef.current = (top?.userData?.id as string) ?? null;
              } else {
                hoveredIdRef.current = null;
              }

              // trigger click (index 0)
              const gp = src.gamepad;
              const triggerDown = !!gp?.buttons?.[0]?.pressed;
              if (triggerDown && !lastTriggerDownRef.current && hoveredIdRef.current) {
                const found = (hotspotsRef.current || []).find(
                  (h) => h.id === hoveredIdRef.current
                );
                if (found) onHotspotRef.current?.(found);
              }
              lastTriggerDownRef.current = triggerDown;
            }
          }

          // A/B buttons for nav
          const gp = src.gamepad;
          if (!gp) continue;
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

      renderer.render(scene, camera);
    });

    // expose rebuild to props change
    (renderer as any).__rebuildHotspots = rebuildSprites;

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;

    return () => {
      try {
        ro.disconnect();
      } catch {}
      try {
        renderer.setAnimationLoop(null);
      } catch {}
      try {
        const mats = [matA, matB];
        mats.forEach((m) => {
          try {
            (m.map as any)?.dispose?.();
          } catch {}
          try {
            m.dispose();
          } catch {}
        });
        geom.dispose();
      } catch {}
      try {
        hotspotGroup.children.forEach((ch) => (ch as any).__dispose?.());
        hotspotGroup.clear();
      } catch {}
      try {
        renderer.dispose();
        renderer.domElement.remove();
      } catch {}
      cleanupTexRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startYawDeg, onNext, onPrev]);

  // keep latest callbacks/props in refs for use inside anim loop
  const onHotspotRef = useRef(onHotspot);
  const hotspotsRef = useRef(hotspots);
  useEffect(() => {
    onHotspotRef.current = onHotspot;
  }, [onHotspot]);
  useEffect(() => {
    hotspotsRef.current = hotspots;
    const r = rendererRef.current as any;
    r?.__rebuildHotspots?.(hotspots);
  }, [hotspots]);

  // ---------- Load texture and flip spheres (double-buffer, no white screen) ----------
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        let url = src || "";
        if (!url && imagePath) {
          const maybe = resolveImagePath?.(imagePath);
          url = typeof maybe === "string" ? maybe : await maybe!;
        }
        if (!url) return;

        const loader = new THREE.TextureLoader();
        loader.load(
          url,
          (tex) => {
            if (!active) return;
            const meshA = meshARef.current,
              meshB = meshBRef.current,
              renderer = rendererRef.current,
              scene = sceneRef.current,
              camera = cameraRef.current;
            if (!meshA || !meshB || !renderer || !scene || !camera) return;

            // Configure equirect + sRGB
            tex.flipY = true;
            tex.wrapS = THREE.RepeatWrapping;
            tex.repeat.x = -1;
            tex.offset.x = 1;

            // (optional quality)
tex.minFilter = THREE.LinearMipmapLinearFilter;
tex.magFilter = THREE.LinearFilter;
tex.generateMipmaps = true;
tex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() ?? 1;

            if ("colorSpace" in tex) (tex as any).colorSpace = THREE.SRGBColorSpace;
            else (tex as any).encoding = (THREE as any).sRGBEncoding;
            tex.needsUpdate = true;

            const frontIdx = activeIdxRef.current;
            const backIdx = (frontIdx ^ 1) as 0 | 1;
            const frontMesh = frontIdx === 0 ? meshA : meshB;
            const backMesh = backIdx === 0 ? meshA : meshB;

            // Copy current yaw to back mesh
            backMesh.rotation.y = frontMesh.rotation.y;

            // Swap map on the hidden mesh
            const backMat = backMesh.material as THREE.MeshBasicMaterial;
            const oldMap = backMat.map as THREE.Texture | null;
            backMat.map = tex;
            backMat.needsUpdate = true;

            // Flip visibility (instant “new scene”)
            backMesh.visible = true;
            frontMesh.visible = false;
            activeIdxRef.current = backIdx;

            // Nudge GL so XR compositor binds this frame (use XR camera if present)
            const xrCam = (renderer.xr as any)?.getCamera?.(camera) || camera;
            (renderer as any).state?.reset?.();
            try {
              renderer.compile(scene, xrCam);
            } catch {}

            // Dispose previous map on hidden mesh next frame
            if (oldMap) requestAnimationFrame(() => { try { oldMap.dispose(); } catch {} });

            // Cleanup for this load
            cleanupTexRef.current = () => {
              try {
                tex.dispose();
              } catch {}
            };
          },
          undefined,
          (err) => console.error("[XR] Texture load failed:", err)
        );
      } catch (e) {
        console.error("[XR] load error", e);
      }
    })();

    return () => {
      active = false;
    };
  }, [src, imagePath, resolveImagePath]);

  // ---------- Enter XR automatically (single path with fallback button) ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // only attempt after renderer exists
        if (!rendererRef.current) {
          setShowEnterVR(true);
          return;
        }
        await startXR();
      } catch {
        if (!cancelled) setShowEnterVR(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Also try after first user gesture (helps when auto-enter is blocked)
  useEffect(() => {
    const onFirstTap = async () => {
      window.removeEventListener("click", onFirstTap, true);
      try {
        await startXR();
      } catch {
        setShowEnterVR(true);
      }
    };
    window.addEventListener("click", onFirstTap, true);
    return () => window.removeEventListener("click", onFirstTap, true);
  }, []);

  const handleClose = async () => {
    try {
      await sessionRef.current?.end();
    } catch {}
    onClose();
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />

      <button
        onClick={handleClose}
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          padding: "8px 12px",
          borderRadius: 8,
          border: "none",
          background: "rgba(255,255,255,0.85)",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Close
      </button>

      {showEnterVR && (
        <button
          onClick={startXR}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 10,
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            background: "#1f4aff",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Enter VR
        </button>
      )}
    </div>
  );
}
