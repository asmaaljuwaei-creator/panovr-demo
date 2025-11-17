"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import BaseMapOriginal, { BasePoint } from "@/components/BaseMap";
const BaseMap = BaseMapOriginal as unknown as any;
import PanoramaVR from "@/components/PanoramaVR";
import graph from "@/data/graph.json";

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

const VR_DEBUG = true;





// Replace normalizeImageUrl in your page with a proxy’d/absolute form
function normalizeImageUrl(raw: string): string {
  // Example: route through your API that adds auth and returns the image
  return `/api/neomaps/api/v1/Images/GetPanoramaPoiImages?imagePath=${encodeURIComponent(
    raw
  )}`;
}


export default function Page() {
  const router = useRouter();
  const bootstrap = graph as unknown as Graph;
  const [streetViewEnabled, setStreetViewEnabled] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null); // which pano is open
  const currentNode = currentId ? bootstrap.nodes[currentId] : null;

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


  const closePano = useCallback(() => setCurrentId(null), []);


  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {/* --- Button Controls --- */}
      <div style={{
        position: "absolute",
        top: 20,
        left: 20,
        zIndex: 100,
        display: "flex",
        gap: 10,
      }}>
        <button
          onClick={() => setStreetViewEnabled((v) => !v)}
          style={{
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
        
        <button
          onClick={() => router.push('/3D')}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Enter 3D Mode
        </button>
      </div>
    
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
              src={normalizeImageUrl(currentNode.imageUrl)}
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
              resolveImagePath={async (imagePath) => normalizeImageUrl(imagePath)}
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
    </div>
  );
}
