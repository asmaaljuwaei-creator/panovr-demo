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
const logicalSides = (
  startKey: "left" | "right",
  value: number | string,
  isRTL: boolean
) => (isRTL ? { [startKey === "left" ? "right" : "left"]: value } : { [startKey]: value });
const originInline = (isRTL: boolean, vertical: "top" | "bottom" = "bottom") =>
  `${vertical} ${isRTL ? "left" : "right"}`; // for items that anchor at inline-end by default
const originStart = (isRTL: boolean, vertical: "top" | "bottom" = "bottom") =>
  `${vertical} ${isRTL ? "right" : "left"}`; // for items at inline-start

export type PanPadProps = {
  uiScale: number;

  /** whether the pad is visible (expanded) */
  enabled: boolean;
  /** toggle the pad open/closed */
  onToggle: () => void;

  /** directional handlers */
  onLookUp: () => void;
  onLookLeft: () => void;
  onLookRight: () => void;
  onLookDown: () => void;

  /** icon urls */
  panSettingsIconUrl?: string;
  panUpIconUrl?: string;
  panLeftIconUrl?: string;
  panRightIconUrl?: string;
  panDownIconUrl?: string;

  /** optional style override for the toggle button */
  toggleStyle?: React.CSSProperties;
  /** optional style override for the pad grid wrapper */
  gridStyle?: React.CSSProperties;

  /** language-direction hints (optional) */
  dir?: "ltr" | "rtl";
  lang?: string;
};

/* ---------- sizing constants kept together to avoid mismatch ---------- */
const BTN = 40;  // button width/height (px)
const GAP = 1;   // grid gap (px) - slightly larger to avoid subpixel shimmer
const IMG = 30;  // icon size (px) - smaller than BTN to avoid edge bleed

/* ---------- memoized button to avoid unnecessary re-renders ---------- */
const PadBtn = React.memo(function PadBtn({
  title,
  onClick,
  icon,
  area,
}: {
  title: string;
  onClick: () => void;
  icon: string;
  area: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        gridArea: area,
        width: BTN,
        height: BTN,
        borderRadius: BTN, // circular
       // border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
        // Layer & AA stability
        willChange: "transform, opacity",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        contain: "layout paint",
      }}
      aria-label={title}
    >
      <img
        src={icon}
        alt={title}
        style={{
          width: 35,
          height: 35,
          display: "block",
          imageRendering: "auto",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
        }}
      />
    </button>
  );
});

/* ---------- template areas (swap left/right in RTL) ---------- */
const templateAreasLTR = `
  ".    up    ."
  "left .     right"
  ".    down  ."
`;
const templateAreasRTL = `
  ".    up    ."
  "right .    left"
  ".    down  ."
`;

export default function PanPad({
  uiScale,
  enabled,
  onToggle,
  onLookUp,
  onLookLeft,
  onLookRight,
  onLookDown,
  panSettingsIconUrl = "/move.png",
  panUpIconUrl = "/PanUP.png",
  panLeftIconUrl = "/PanLeft.png",
  panRightIconUrl = "/PanRight.png",
  panDownIconUrl = "/PanDown.png",
  toggleStyle,
  gridStyle,
  dir,
  lang,
}: PanPadProps) {
  const isRTL = useIsRTL(dir, lang);

  return (
    <>
      {/* Toggle button (dock to inline-end) */}
      <button
        onClick={onToggle}
        title={enabled ? "Hide Pan Pad (P)" : "Show Pan Pad (P)"}
        aria-pressed={enabled}
        aria-label={enabled ? "Hide pan pad" : "Show pan pad"}
        style={{
          position: "absolute",
          ...logicalSides("right", 16, isRTL), // flips to left:16 if RTL
          bottom: "4%",
          zIndex: 12,
          width: BTN,
          height: BTN,
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          transform: `scale(${uiScale}) translateZ(0)`,
          transformOrigin: originInline(isRTL, "bottom"),
          background: "#B8D0FFB2",
          // layer stability
          willChange: "transform, opacity",
          backfaceVisibility: "hidden",
          contain: "layout paint",
          ...toggleStyle,
        }}
      >
        <img
          src={panSettingsIconUrl}
          width={IMG}
          height={IMG}
          alt="Toggle Pan Pad"
          style={{ display: "block", opacity: enabled ? 1 : 0.9 }}
        />
      </button>

      {/* Pad grid (dock next to the toggle; mirror layout in RTL) */}
      {enabled && (
        <div
          style={{
            position: "absolute",
            ...(isRTL ? { left: 70 } : { right: 70 }),
            bottom: 22,
            zIndex: 9999,
            transform: `scale(${uiScale}) translateZ(0)`,
            transformOrigin: isRTL ? originStart(true, "bottom") : originInline(false, "bottom"),
            display: "grid",
            gridTemplateColumns: `${BTN}px ${BTN}px ${BTN}px`,
            gridTemplateRows: `${BTN}px ${BTN}px ${BTN}px`,
            gap: GAP,
            alignItems: "center",
            justifyItems: "center",
            gridTemplateAreas: isRTL ? templateAreasRTL : templateAreasLTR,
            // compositor isolation to prevent flicker with WebGL canvas behind
            willChange: "transform",
            transformStyle: "preserve-3d",
            backfaceVisibility: "hidden",
            isolation: "isolate",
            contain: "layout paint",
            ...gridStyle,
          }}
          aria-label="Pan pad"
          dir={dir ?? (isRTL ? "rtl" : "ltr")}
        >
          <PadBtn title="Look Up (↑)" onClick={onLookUp} icon={panUpIconUrl} area="up" />
          <PadBtn title="Look Left (←)" onClick={onLookLeft} icon={panLeftIconUrl} area="left" />
          <PadBtn
            title="Look Right (→)"
            onClick={onLookRight}
            icon={panRightIconUrl}
            area="right"
          />
          <PadBtn title="Look Down (↓)" onClick={onLookDown} icon={panDownIconUrl} area="down" />
        </div>
      )}
    </>
  );
}
