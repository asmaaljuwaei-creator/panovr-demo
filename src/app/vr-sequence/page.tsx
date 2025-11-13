
// ================================
// /src/app/page.tsx  (or wherever you mount it)
// ================================
"use client";

import React, { useMemo } from "react";
import VRSequencePlayer from "@/components/VRSequencePlayer";
import { buildVRPanosFromSequence, RawItem } from "@/components/buildVRPanosFromSequence";

/** Encode each segment but keep slashes */
const encodeKeepSlashes = (p: string) => p.split("/").map(encodeURIComponent).join("/");

function getAuth() {
  const baseURL = "http://localhost:3000"; // adjust for prod
  const contractId = "721ae8ac-4d08-4caf-8722-694716000b68";
  const accessToken = "NjyAv9F2Fzw7IO19IrKL1w7bWy0Hg3J-KZUOpvdiF6g";
  return { baseURL, contractId, accessToken };
}

const resolveImagePath = async (p: string) => {
  const { baseURL, contractId, accessToken } = getAuth();
  const url = `${baseURL}/api/neomaps/api/v1/Images/GetPanoramaPoiImages?imagePath=${encodeKeepSlashes(p)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "image/*",
      "X-Client-Type": "Web",
      "X-Contract-Id": contractId,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    credentials: "omit",
  });
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${res.statusText}`);
  return URL.createObjectURL(await res.blob());
};

const RAW: RawItem[] = [
  { id: "35b5c649-4002-42d6-980b-81a37f911b81", sequence: "PjYUolixdCJmqwy536DvcE", latitude: 26.436360014549, longitude: 50.130738436074, imagePath: "Panos/1074754643617732.jpg" },
  { id: "a8a44781-239f-4f58-b508-f7d393b8b804", sequence: "PjYUolixdCJmqwy536DvcE", latitude: 26.436263203807, longitude: 50.130840645054, imagePath: "Panos/388594260722791.jpg" },
  { id: "9c69ee34-7fd9-472b-8491-a96042173981", sequence: "PjYUolixdCJmqwy536DvcE", latitude: 26.436213661825, longitude: 50.130813400871, imagePath: "Panos/825280426092732.jpg" },
];

export default function VRSequencePage() {
  const first = RAW[0];

  const panosWithLinks = useMemo(() => {
    const seqId = first?.sequence ?? "";
    const panos = buildVRPanosFromSequence(RAW, { sequenceId: seqId, useBearing: true });

    // Ensure simple next/prev links exist (safety)
    for (let i = 0; i < panos.length; i++) {
      const pano = panos[i];
      if (!pano) continue;
      const next = panos[i + 1];
      const prev = i > 0 ? panos[i - 1] : undefined;
      if (next && !pano.links?.some(l => l.targetId === next.id)) {
        pano.links ??= [];
        pano.links.push({ targetId: next.id, yaw: 0, rel: "next" });
      }
      if (prev && !pano.links?.some(l => l.targetId === prev.id)) {
        pano.links ??= [];
        pano.links.push({ targetId: prev.id, yaw: 180, rel: "prev" });
      }
    }

    return panos;
  }, [first]);

  const startId = panosWithLinks.length > 0 ? panosWithLinks[0].id : undefined;

  return (
    <VRSequencePlayer
      panos={panosWithLinks}
      startId={startId}
      resolveImagePath={resolveImagePath}
      onExit={() => history.back()}
    />
  );
}
