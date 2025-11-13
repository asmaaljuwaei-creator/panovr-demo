"use client";

import React from "react";

/* ---------- tiny RTL helpers ---------- */
function inferIsRTL(lang?: string) {
  const r = (lang || "").toLowerCase();
  return r.startsWith("ar") || r.startsWith("he") || r.startsWith("fa") || r.startsWith("ur");
}
function useIsRTL(dir?: "ltr" | "rtl", lang?: string) {
  const htmlDir = (typeof document !== "undefined" ? (document.dir as "ltr" | "rtl" | "") : "");
  return (dir || htmlDir || (inferIsRTL(lang) ? "rtl" : "ltr")) === "rtl";
}
/** place at inline-end or inline-start (auto-flips in RTL) */
const logicalSide = (
  at: "start" | "end",
  value: number | string,
  isRTL: boolean
) =>
  at === "end"
    ? isRTL
      ? { left: value }
      : { right: value }
    : isRTL
      ? { right: value }
      : { left: value };

const originAtInlineEnd = (isRTL: boolean, vertical: "top" | "bottom" = "bottom") =>
  `${vertical} ${isRTL ? "left" : "right"}`;

export type RightRailControlsProps = {
  uiScale: number;
  /** called when the compass is clicked (face north) */
  onGoNorth: () => void;

  /** refs so the parent can rotate the compass every frame */
  compassRotRef:
    | React.RefObject<HTMLDivElement | null>
    | React.MutableRefObject<HTMLDivElement | null>;

  /** image urls */
  compassIconUrl?: string;
  zoomPlusIconUrl?: string;
  zoomMinusIconUrl?: string;

  /** zoom handlers */
  onZoomIn: () => void;
  onZoomOut: () => void;

  /** optional style override for the wrapper */
  style?: React.CSSProperties;

  /** language-direction hints (optional) */
  dir?: "ltr" | "rtl";
  lang?: string;

  /** override docking side (default = inline-end). Use 'start' to pin to inline-start. */
  side?: "start" | "end";
};

export default function RightRailControls({
  uiScale,
  onGoNorth,
  compassRotRef,
  compassIconUrl = "/compass.png",
  zoomPlusIconUrl = "/plus.png",
  zoomMinusIconUrl = "/Minus.png",
  onZoomIn,
  onZoomOut,
  style,
  dir,
  lang,
  side = "end",
}: RightRailControlsProps) {
  const isRTL = useIsRTL(dir, lang);

  const zoomBtnStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 4,
    padding: 1,
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1,
    color: "#000",
    //background: "white",
  };

  return (
    <div
      style={{
        position: "absolute",
        ...logicalSide(side, 16, isRTL), // inline-end by default (right in LTR, left in RTL)
        bottom: "10%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        zIndex: 10,
        transform: `scale(${uiScale})`,
        transformOrigin: originAtInlineEnd(isRTL, "bottom"),
        ...style,
      }}
      // helpful if you later use CSS logical props inside this subtree
      dir={dir ?? (isRTL ? "rtl" : "ltr")}
    >
      {/* Compass */}
      <button
        onClick={onGoNorth}
        title="Compass"
        aria-label="Face North"
        style={{
          width: 43,
          height: 43,
          borderRadius: "9999px",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          padding: 0,
          //background: "white",
        }}
      >
        <div
          ref={compassRotRef}
          style={{
            width: 43,
            height: 43,
            transform: "rotate(0deg)",
            willChange: "transform",
          }}
        >
          <img src={compassIconUrl} alt="" style={{ width: 43, height: 43, display: "block" }} />
        </div>
      </button>

      {/* Zoom in/out */}
      <button onClick={onZoomIn} title="Zoom In" style={zoomBtnStyle} aria-label="Zoom In">
        <img src={zoomPlusIconUrl || "/plus.png"} alt="+" />
      </button>
      <button onClick={onZoomOut} title="Zoom Out" style={zoomBtnStyle} aria-label="Zoom Out">
        <img src={zoomMinusIconUrl || "/Minus.png"} alt="−" />
      </button>
    </div>
  );
}
