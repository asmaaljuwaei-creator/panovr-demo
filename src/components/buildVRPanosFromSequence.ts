// /src/components/buildVRPanosFromSequence.ts
// ================================
// A tiny helper to convert your raw list into VR-ready panos with next/prev links.
export type RawItem = {
  id: string;
  sequence: string;
  latitude: number;
  longitude: number;
  imagePath: string;
};

export type VRLink = {
  targetId: string;
  yaw: number;
  pitch?: number;
  label?: string;
  rel?: "next" | "prev";
};

export type VRPanoMeta = {
  id: string;
  imagePath: string;
  yawDeg?: number;
  lonlat?: [number, number];
  links?: VRLink[];
};

function toRad(d: number) { return (d * Math.PI) / 180; }
function toDeg(r: number) { return (r * 180) / Math.PI; }

// Bearing from A -> B (degrees, 0=N, 90=E)
function bearingBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360; // 0..360 (0 = north)
}

/**
 * Convert your raw items into VRPanoMeta[] with Next/Prev links.
 * - `inOrder`: items must be in desired play order (or filter via sequenceId)
 * - `useBearing`: if true, compute yaw to next/prev from lat/lon; else default yaws (next=90, prev=270)
 */
export function buildVRPanosFromSequence(
  inOrder: RawItem[],
  options?: { sequenceId?: string; useBearing?: boolean }
): VRPanoMeta[] {
  const { sequenceId, useBearing = true } = options || {};

  const filtered = sequenceId ? inOrder.filter(i => i.sequence === sequenceId) : inOrder.slice();

  const panos: VRPanoMeta[] = filtered.map(i => ({
    id: i.id,
    imagePath: i.imagePath,
    lonlat: [i.longitude, i.latitude],
  }));

  for (let k = 0; k < panos.length; k++) {
    const cur = panos[k];
    const links: VRLink[] = [];

    // Prev
    if (k > 0) {
      const prev = panos[k - 1];
      const yawPrev = useBearing && cur.lonlat && prev.lonlat
        ? ((90 - bearingBetween(cur.lonlat[1], cur.lonlat[0], prev.lonlat[1], prev.lonlat[0])) + 360) % 360
        : 270;
      links.push({ targetId: prev.id, yaw: yawPrev, rel: "prev", label: "←" });
    }

    // Next
    if (k + 1 < panos.length) {
      const nxt = panos[k + 1];
      const yawNext = useBearing && cur.lonlat && nxt.lonlat
        ? ((90 - bearingBetween(cur.lonlat[1], cur.lonlat[0], nxt.lonlat[1], nxt.lonlat[0])) + 360) % 360
        : 90;
      links.push({ targetId: nxt.id, yaw: yawNext, rel: "next", label: "→" });
    }

    cur.links = links;
  }

  // Optional: face toward next by default
  for (let k = 0; k < panos.length; k++) {
    const n = panos[k].links?.find(l => l.rel === "next");
    if (n) panos[k].yawDeg = n.yaw;
  }

  return panos;
}
