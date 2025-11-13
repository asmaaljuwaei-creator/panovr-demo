"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import BaseMapOriginal, { BasePoint } from "@/components/BaseMap";
const BaseMap = BaseMapOriginal as unknown as any;
import PanoramaVR from "@/components/PanoramaVR";
import graph from "@/data/graph.json";
import WebXRViewer from "@/components/WebXRViewer";

type Graph = {
  startId: string;
  nodes: Record<
    string,
    {
      imageUrl: string;
      lat?: number;
      lon?: number;
      latitude?: number;
      longitude?: number;
      links: Array<{
        targetId: string;
        yaw: number;
        latitude?: number;
        longitude?: number;
        imagePath?: string;
        label?: string;
      }>;
    }
  >;
};

type VRLink = {
  targetId: string;
  yaw: number;
  pitch?: number;
  label?: string;
  imagePath?: string;
  rel?: "next" | "prev";
};
type VRPano = {
  src: string;
  index: number;
  links: VRLink[];
  markers: any[];
  lonlat?: [number, number];
  markerId?: string; // current pano id
};
// ========= API + resolution helpers (paste above your component) =========
const VR_DEBUG = true;

function getAuth() {
  const baseURL = "https://api.neomaps.com";
  const contractId = "721ae8ac-4d08-4caf-8722-694716000b68";
  const accessToken = "QkjsnZKZ-df3_62Pxht1FC3JMY5NB2O7aOyo1VG6SjI";
  if (!contractId || !accessToken) throw new Error("Missing auth");
  return { baseURL, contractId, accessToken };
}

// Keep your function — used below
function encodeKeepSlashes(segment: string) {
  return segment.split("/").map(encodeURIComponent).join("/");
}

// ---- add a tiny normalizer (helps with odd path inputs) ----
function normalizeVariants(imagePath: string): string[] {
  const s = imagePath.trim();
  const noLead = s.startsWith("/") ? s.slice(1) : s;
  const noSpace = noLead.replace(/\s+/g, "%20");
  return Array.from(new Set([s, noLead, decodeURIComponent(noLead), noSpace]));
}

// Keep your function — used below
function buildImageUrls(_baseURL: string, imagePath: string) {
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

// ---- core: try every variant with auth; return a blob URL on first 200 ----
async function fetchPanoBlobUrlFromApi(
  imagePath: string
): Promise<{ blobUrl: string; hitUrl: string } | null> {
  const { baseURL, contractId, accessToken } = getAuth();
  const candidates = buildImageUrls(baseURL, imagePath);

  for (const path of candidates) {
    const url = path.startsWith("http") ? path : `${baseURL}${path}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-contract-id": contractId,
        },
        credentials: "include",
      });

      VR_DEBUG && console.log("[VR] Try", url, "→", res.status, res.statusText);

      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        VR_DEBUG &&
          console.log("[VR] ✅ Resolved blob:", { hitUrl: url, blobUrl });
        return { blobUrl, hitUrl: url };
      }
    } catch (e) {
      VR_DEBUG && console.warn("[VR] fetch error", url, e);
    }
  }
  VR_DEBUG &&
    console.error(
      "[VR] ❌ No variant worked for imagePath:",
      imagePath,
      candidates
    );
  return null;
}

// Replace normalizeImageUrl in your page with a proxy’d/absolute form
function normalizeImageUrl(raw: string): string {
  // Example: route through your API that adds auth and returns the image
  return `/api/neomaps/api/v1/Images/GetPanoramaPoiImages?imagePath=${encodeURIComponent(
    raw
  )}`;
}

// Build a VRPano out of a graph node id (always authoritative from graph)
function buildVRPanoFromId(
  id: string,
  graphNodes: Graph["nodes"]
): VRPano | null {
  const node = graphNodes[id];
  if (!node?.imageUrl) {
    VR_DEBUG &&
      console.warn("[VR] buildVRPanoFromId: node missing imageUrl", {
        id,
        node,
      });
    return null;
  }

  const src = normalizeImageUrl(node.imageUrl);

  // Build neighbor links and inject their resolved imageUrl as imagePath
  const links: VRLink[] = (node.links ?? []).map((l) => {
    const neigh = graphNodes[l.targetId];
    const neighImage = neigh?.imageUrl
      ? normalizeImageUrl(neigh.imageUrl)
      : undefined;
    return {
      targetId: l.targetId,
      yaw: l.yaw,
      pitch: (l as any).pitch,
      label: l.label,
      imagePath: neighImage, // <-- critical so next/prev can prefetch
    };
  });

  const lon = (node.lon ?? node.longitude) as number | undefined;
  const lat = (node.lat ?? node.latitude) as number | undefined;

  const pano: VRPano = {
    src,
    index: 0,
    links,
    markers: [],
    lonlat:
      typeof lon === "number" && typeof lat === "number"
        ? [lon, lat]
        : undefined,
    markerId: id,
  };

  VR_DEBUG && console.log("[VR] buildVRPanoFromId →", pano);
  return pano;
}

// Pick helpers (with guard/logging)
function pickNextLink(links: VRLink[] = []): VRLink | undefined {
  if (!links.length) {
    VR_DEBUG && console.warn("[VR] pickNextLink: no links");
    return;
  }
  return links.find((l) => l.rel === "next") ?? links[0];
}
function pickPrevLink(links: VRLink[] = []): VRLink | undefined {
  if (!links.length) {
    VR_DEBUG && console.warn("[VR] pickPrevLink: no links");
    return;
  }
  return links.find((l) => l.rel === "prev") ?? links[links.length - 1];
}

export default function Page() {
  const bootstrap = graph as unknown as Graph;
  const [streetViewEnabled, setStreetViewEnabled] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null); // which pano is open
  const currentNode = currentId ? bootstrap.nodes[currentId] : null;
  // 🔹 Independent VR state
  const [currentVRId, setCurrentVRId] = useState<string | null>(null);
  const [panoForVR, setPanoForVR] = useState<VRPano | null>(null);
  const [showXR, setShowXR] = useState(false);

  // Convert graph nodes to basemap points
  const points = useMemo<BasePoint[]>(() => {
    return Object.entries(bootstrap.nodes)
      .map(([id, n]) => {
        const lon = (n.lon ?? n.longitude) as number | undefined;
        const lat = (n.lat ?? n.latitude) as number | undefined;
        if (typeof lon !== "number" || typeof lat !== "number") return null;
        return { id, lon, lat, label: id };
      })
      .filter(Boolean) as BasePoint[];
  }, [bootstrap]);
  useEffect(() => {
    if (panoForVR?.markerId) setCurrentVRId(panoForVR.markerId);
  }, [panoForVR?.markerId]);

  const closePano = useCallback(() => setCurrentId(null), []);
  // 🔹 Your API mapper for VR (replace with your auth/base URL logic if needed)
  async function resolveImagePath(imagePath: string): Promise<string> {
    // Example: return `${API_BASE}/Panos/${imagePath}` with auth headers blobbed in a route
    return imagePath; // or the blob/http URL built by your server route
  }

  // Load a pano by its targetId (authoritative from graph)
  async function loadPanoramaById(id: string) {
    const pano = buildVRPanoFromId(id, bootstrap.nodes);
    if (!pano) {
      VR_DEBUG && console.error("[VR] loadPanoramaById: failed for", id);
      return;
    }
    setPanoForVR(pano);
    setCurrentVRId(id);
  }

  // Controller A/B will call these:
  async function loadNextPanorama() {
    if (!panoForVR) {
      VR_DEBUG && console.warn("[VR] loadNextPanorama: no panoForVR");
      return;
    }
    const link = pickNextLink(panoForVR.links);
    if (!link) return;
    VR_DEBUG && console.log("[VR] NEXT →", link);
    await loadPanoramaById(link.targetId);
  }

  async function loadPreviousPanorama() {
    if (!panoForVR) {
      VR_DEBUG && console.warn("[VR] loadPreviousPanorama: no panoForVR");
      return;
    }
    const link = pickPrevLink(panoForVR.links);
    if (!link) return;
    VR_DEBUG && console.log("[VR] PREV ←", link);
    await loadPanoramaById(link.targetId);
  }
  function prefetchLink(link?: VRLink) {
    if (!link?.imagePath) return;
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.src = link.imagePath;
  }

  useEffect(() => {
    if (!panoForVR) return;
    prefetchLink(pickNextLink(panoForVR.links));
    prefetchLink(pickPrevLink(panoForVR.links));
  }, [panoForVR?.markerId]);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {/* --- Enable Street View toggle button --- */}
      <button
        onClick={() => setStreetViewEnabled((v) => !v)}
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          zIndex: 100,
          padding: "10px 18px",
          borderRadius: 8,
          border: "none",
          background: streetViewEnabled ? "#00a86b" : "#555",
          color: "white",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {streetViewEnabled ? "Disable Street View" : "Enable Street View"}
      </button>
      {/* 🔹 Independent VR button — only when SV is ON and we have a pano */}
      {streetViewEnabled && panoForVR?.src && (
        <button
          onClick={() => setShowXR(true)}
          title="Enter WebXR"
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            zIndex: 1000,
            padding: "10px 18px",
            border: "none",
            borderRadius: 999,
            background: "#1f4aff",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          VR
        </button>
      )}
      {/* --- Map --- */}
      <BaseMap
        points={points}
        start={
          bootstrap.startId &&
          (bootstrap.nodes[bootstrap.startId].lon != null ||
            bootstrap.nodes[bootstrap.startId].longitude != null)
            ? {
                lon: (bootstrap.nodes[bootstrap.startId].lon ??
                  bootstrap.nodes[bootstrap.startId].longitude)!,
                lat: (bootstrap.nodes[bootstrap.startId].lat ??
                  bootstrap.nodes[bootstrap.startId].latitude)!,
                zoom: 25,
              }
            : undefined
        }
        onPanoChange={(pano: VRPano) => {
          // If BaseMap already gives a markerId, prefer that id; else try to infer from its src.
          const id =
            pano?.markerId ??
            (typeof pano?.src === "string" ? pano.markerId : undefined);
          const chosenId = id ?? currentId ?? bootstrap.startId;

          const built = buildVRPanoFromId(chosenId, bootstrap.nodes);
          if (built) {
            setPanoForVR(built);
            setCurrentVRId(built.markerId ?? null);
          } else {
            // Fallback: at least keep what BaseMap sent so WebXR can still open
            setPanoForVR(pano);
            VR_DEBUG &&
              console.warn(
                "[VR] onPanoChange: used fallback pano from BaseMap",
                pano
              );
          }
        }}
        height="100%"
      />
      {/* --- Panorama Overlay --- */}
      {streetViewEnabled && currentNode && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              position: "relative",
              width: "min(1200px, 92vw)",
              height: "min(720px, 78vh)",
              background: "#000",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 12px 48px rgba(0,0,0,.45)",
            }}
          >
            <PanoramaVR
              src={currentNode.imageUrl}
              links={currentNode.links ?? []}
              isFullscreen={false}
              currentId={currentId!}
              onClose={closePano}
              onNavigate={(targetId) => {
                if (targetId && bootstrap.nodes[targetId]) {
                  setCurrentId(targetId);
                }
              }}
              onToggleFullscreen={() => {}}
              resolveImagePath={async (p) => p}
              currentLonLat={
                currentNode?.lon != null || currentNode?.longitude != null
                  ? [
                      (currentNode.lon ?? currentNode.longitude)!,
                      (currentNode.lat ?? currentNode.latitude)!,
                    ]
                  : undefined
              }
            />
          </div>
        </div>
      )}
      /* WebXR overlay (independent from any panorama overlay) */
      {showXR && streetViewEnabled && panoForVR?.src && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#000",
            zIndex: 2000,
          }}
        >
          <WebXRViewer
            // You can provide src directly, or pass imagePath + resolveImagePath
            imagePath={panoForVR.src} // imagePath={/* panoForVR.markerId or link.imagePath if you prefer */}
            resolveImagePath={resolveImagePath}
            onClose={() => setShowXR(false)}
            startYawDeg={0}
            onNext={() => loadNextPanorama()}
            onPrev={() => loadPreviousPanorama()}
          />
        </div>
      )}
    </div>
  );
}
