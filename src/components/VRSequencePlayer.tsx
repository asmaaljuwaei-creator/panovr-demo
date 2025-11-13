// ================================
// /src/components/VRSequencePlayer.tsx
// ================================
"use client";

import React, { useCallback, useMemo, useState } from "react";
import WebXRViewerPlus, { XRHotspot, WebXRViewerPlusProps } from "./WebXRViewerPlus";

export type VRLink = { targetId: string; yaw: number; pitch?: number; label?: string; rel?: "next" | "prev" };
export type VRPanoMeta = { id: string; imagePath: string; yawDeg?: number; links?: VRLink[] };

export type VRSequencePlayerProps = {
  panos: VRPanoMeta[];
  startId?: string;
  resolveImagePath?: (p: string) => Promise<string> | string;
  onExit?: () => void;
};

const indexById = (list: VRPanoMeta[]) => {
  const m = new Map<string, VRPanoMeta>();
  for (const p of list) m.set(p.id, p);
  return m;
};

export default function VRSequencePlayer({ panos, startId, resolveImagePath, onExit }: VRSequencePlayerProps) {
  const idToPano = useMemo(() => indexById(panos), [panos]);
  const [currentId, setCurrentId] = useState<string>(startId && idToPano.has(startId) ? startId : panos[0]?.id);

  const cur = currentId ? idToPano.get(currentId) : undefined;
  const idx = cur ? panos.findIndex(p => p.id === cur.id) : -1;

  const nextId = useMemo(() => {
    if (!cur) return;
    const byRel = cur.links?.find(l => l.rel === "next")?.targetId;
    if (byRel && idToPano.has(byRel)) return byRel;
    if (idx >= 0 && idx + 1 < panos.length) return panos[idx + 1].id;
  }, [cur, idx, panos, idToPano]);

  const prevId = useMemo(() => {
    if (!cur) return;
    const byRel = cur.links?.find(l => l.rel === "prev")?.targetId;
    if (byRel && idToPano.has(byRel)) return byRel;
    if (idx > 0) return panos[idx - 1].id;
  }, [cur, idx, panos, idToPano]);

  // Hotspots from links; id === targetId (so the viewer can find it by raycast id)
  const hotspots: XRHotspot[] = useMemo(() => {
    if (!cur?.links?.length) return [];
    return cur.links.map((l) => ({
      id: l.targetId,
      targetId: l.targetId,
      yawDeg: l.yaw,
      pitchDeg: l.pitch ?? 0,
      label: l.label ?? "▶",
    }));
  }, [cur?.id, cur?.links]);

  const onHotspot = useCallback((hs: XRHotspot) => {
    if (hs?.targetId && idToPano.has(hs.targetId)) setCurrentId(hs.targetId);
  }, [idToPano]);

  const goNext = useCallback(() => { if (nextId) setCurrentId(nextId); }, [nextId]);
  const goPrev = useCallback(() => { if (prevId) setCurrentId(prevId); }, [prevId]);

  if (!cur) return null;

  const startYawDeg = cur.yawDeg ?? 0;
  const srcOrPath: Partial<WebXRViewerPlusProps> = resolveImagePath
    ? { imagePath: cur.imagePath, resolveImagePath: (p: string) => Promise.resolve(resolveImagePath(p)) }
    : { src: cur.imagePath };

  return (
    <WebXRViewerPlus
      key="main-xr-viewer" // fixed key (prevents remount; keeps XR session + inputs alive)
      {...srcOrPath}
      startYawDeg={startYawDeg}
      hotspots={hotspots}
      onHotspot={onHotspot}
      onNext={goNext}
      onPrev={goPrev}
      onClose={() => onExit?.()}
    />
  );
}
