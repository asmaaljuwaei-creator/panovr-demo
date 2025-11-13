// src/components/BaseMap.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import { defaults as defaultControls } from "ol/control";
import "ol/ol.css";

import PanoramaVR from "@/components/PanoramaVR";
import type { Link, Marker } from "./useStreetViewMap";
import { useStreetViewMap } from "./useStreetViewMap";

type Props = {
  start?: { lon: number; lat: number; zoom?: number };
  height?: number | string;
};

export type PanoChangePayload = {
  src: string;                   // blob/http URL (preview image)
  index: number;
  links: Link[];
  markers: Marker[];
  lonlat?: [number, number];
  markerId?: string;
};

export type BasePoint = {
  id: string;
  lon: number;
  lat: number;
  label?: string;
};

export default function BaseMap(props: {
  points?: BasePoint[];
  start?: { lon: number; lat: number; zoom?: number };
  height?: string | number;
  onPanoChange?: (p: PanoChangePayload) => void;
}) {
  const { start, height = "100%", onPanoChange } = props;

  const mapRef = useRef<Map | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);

  // Street View on/off + current pano index (for next/prev)
  const [svEnabled, setSvEnabled] = useState<boolean>(true);

  // Mini Panorama preview state
  const [isPanoOpen, setIsPanoOpen] = useState(false);
  const [isPanoFullscreen, setIsPanoFullscreen] = useState(false);
  const [panoramaSrc, setPanoramaSrc] = useState<string>("");
  const [links, setLinks] = useState<Link[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [panoramaIndex, setPanoramaIndex] = useState(0);
  const [panoLonLat, setPanoLonLat] = useState<[number, number] | undefined>();

  // Revoke blob URLs when replacing previews
  const lastBlobUrlRef = useRef<string | null>(null);
  const revokeLastBlob = () => {
    if (lastBlobUrlRef.current) {
      URL.revokeObjectURL(lastBlobUrlRef.current);
      lastBlobUrlRef.current = null;
    }
  };

  const closePano = () => {
    revokeLastBlob();
    setIsPanoOpen(false);
    setIsPanoFullscreen(false);
    setPanoramaSrc("");
    setLinks([]);
    setMarkers([]);
    setPanoramaIndex(0);
  };

  // Called by the Street View hook when a pano image is ready
  const setPanoramaImageUrl = useCallback(
    (objectUrl: string, index: number, allMarkers: Marker[], hotspotLinks: Link[]) => {
      revokeLastBlob();
      lastBlobUrlRef.current = objectUrl;

      setPanoramaSrc(objectUrl);
      setIsPanoOpen(true);
      setIsPanoFullscreen(false);
      setMarkers(allMarkers);
      setLinks(hotspotLinks);
      setPanoramaIndex(index);

      // Lon/Lat + id (if available on marker)
      const m = allMarkers[index];
      const lonlat =
        m && typeof (m as any).longitude === "number" && typeof (m as any).latitude === "number"
          ? [(m as any).longitude, (m as any).latitude] as [number, number]
          : undefined;
      setPanoLonLat(lonlat);

      onPanoChange?.({
        src: objectUrl,
        index,
        links: hotspotLinks,
        markers: allMarkers,
        lonlat,
        markerId: (m as any)?.id?.toString?.(),
      });
    },
    [onPanoChange]
  );

  // Create the OL map once
  useEffect(() => {
    if (mapRef.current || !divRef.current) return;
    const map = new Map({
      target: divRef.current,
      layers: [new TileLayer({ source: new OSM(), zIndex: 0 })],
      view: new View({
        center: fromLonLat([start?.lon ?? 46.6753, start?.lat ?? 24.7136]),
        zoom: start?.zoom ?? 6,
      }),
      controls: defaultControls({ attribution: true, zoom: true }),
    });
    mapRef.current = map;
    return () => {
      map.setTarget(undefined as any);
      mapRef.current = null;
    };
  }, [start?.lat, start?.lon, start?.zoom]);

  // Wire the Street View hook — this adds layers/interactions and does fetches
  const streetApi = useStreetViewMap(
    mapRef.current,
    svEnabled,
    setPanoramaImageUrl,
    /* isPanoOpen: */ isPanoOpen,
    panoramaIndex
  );

  // Minimal “navigate by link target id” (from PanoramaVR)
  const handleNavigate = (targetId: string) => {
    streetApi.selectMarkerById?.(targetId, {
      center: true,
      animateMs: 250,
      keepZoom: true,
      moveOnly: false,
    });
  };

  // Make ANY clickable feature open the preview if it carries pano props
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleSingleClick = (evt: any) => {
      const hit = map.forEachFeatureAtPixel(
        evt.pixel,
        (feature: any, layer: any) => {
          if (layer?.get && layer.get("neo_ignoreClicks")) return undefined;
          return { feature, layer };
        },
        { hitTolerance: 6 }
      );
      if (!hit) return;

      const panoImagePath =
        hit.feature.get?.("panoImagePath") ??
        hit.feature.get?.("imagePath") ??
        hit.feature.get?.("pano_image_path");

      const panoId =
        hit.feature.get?.("panoId") ??
        hit.feature.get?.("id") ??
        hit.feature.getId?.();

      if (panoImagePath) {
        streetApi.selectMarkerByImagePath?.(String(panoImagePath), {
          center: true, animateMs: 250, keepZoom: true, moveOnly: false,
        });
        return;
      }
      if (typeof panoId === "string") {
        streetApi.selectMarkerById?.(panoId, {
          center: true, animateMs: 250, keepZoom: true, moveOnly: false,
        });
        return;
      }
    };

    map.on("singleclick", handleSingleClick);
    return () => map.un("singleclick", handleSingleClick);
  }, [svEnabled, streetApi]);

  // Optional: auto-highlight nearest at zoom 13 after enabling
  useEffect(() => {
    if (!mapRef.current || !svEnabled) return;
    const t = setTimeout(() => streetApi.highlightNearestAtLevel13?.(), 600);
    return () => clearTimeout(t);
  }, [svEnabled, streetApi]);

  // Revoke last blob on unmount
  useEffect(() => () => revokeLastBlob(), []);

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      <div ref={divRef} style={{ width: "100%", height: "100%" }} />

      {/* Mini Panorama preview */}
      {isPanoOpen && (
        <div
          style={
            isPanoFullscreen
              ? { position: "fixed", inset: 0, zIndex: 9999, background: "black" }
              : {
                  position: "absolute",
                  bottom: 16,
                  left: 16,
                  width: 320,
                  height: 200,
                  zIndex: 9999,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#000",
                }
          }
        >
          <PanoramaVR
            src={panoramaSrc}
            links={links}
            isFullscreen={isPanoFullscreen}
            onClose={closePano}
            onNavigate={handleNavigate}
            onToggleFullscreen={() => setIsPanoFullscreen((v) => !v)}
            userLonLat={panoLonLat}
            miniMapZoom={17}
          />
        </div>
      )}
    </div>
  );
}
