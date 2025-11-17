"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useThemeStore } from "./useThemeStore";
import { useLocale } from "./useLocale";

interface MapControlsProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export const MapControls = ({ onZoomIn, onZoomOut }: MapControlsProps) => {
  const [activeZoom, setActiveZoom] = useState<"in" | "out" | null>(null);
  const [activeRotation, setActiveRotation] = useState<"clockwise" | "counterclockwise" | "reset" | null>(null);
  const [streetViewActive, setStreetViewActive] = useState(false);
  const router = useRouter();
  const { mode, primaryColor } = useThemeStore();
  const { t, currentLocale } = useLocale();

  const isDark = mode === "dark";
  const rawColor = primaryColor || "#2563eb";

  const baseButtonClass =
    "flex h-7 w-7 items-center justify-center rounded text-base font-bold transition-all duration-150 ease-in-out";

  const getButtonStyle = (type: "in" | "out") => {
    const isActive = activeZoom === type;
    const base = "bg-primary-background text-primary-text";

    const activeStyle = isActive
      ? {
          backgroundColor: rawColor,
          color: "#fff",
          transform: "scale(1.05)",
          boxShadow: `0 0 4px ${rawColor}`,
        }
      : undefined;

    return {
      className: `${baseButtonClass} ${base}`,
      style: activeStyle,
    };
  };

  const getCurrentLocationStyle = "bg-primary-background text-primary-text";

  const getStreetViewStyle = () => {
    const base = "bg-primary-background text-primary-text";
    const activeStyle = streetViewActive
      ? {
          backgroundColor: rawColor,
          color: "#fff",
          transform: "scale(1.05)",
          boxShadow: `0 0 4px ${rawColor}`,
        }
      : undefined;

    return {
      className: `${baseButtonClass} ${base}`,
      style: activeStyle,
    };
  };

  const getRotationButtonStyle = (type: "clockwise" | "counterclockwise" | "reset") => {
    const isActive = activeRotation === type;
    const base = "bg-primary-background text-primary-text";

    const activeStyle = isActive
      ? {
          backgroundColor: rawColor,
          color: "#fff",
          transform: "scale(1.05)",
          boxShadow: `0 0 4px ${rawColor}`,
        }
      : undefined;

    return {
      className: `${baseButtonClass} ${base}`,
      style: activeStyle,
    };
  };

  

  return (
      <div className="flex flex-col space-y-2 w-fit">     


      {/* Rotation Controls */}
      {/* <button
        onClick={() => {
          rotateClockwise();
          setActiveRotation("clockwise");
          setTimeout(() => setActiveRotation(null), 200); // Brief visual feedback
        }}
        {...getRotationButtonStyle("clockwise")}
        title={t("MapControls.RotateClockwise")}
      >
        <RotateClockwiseIcon size={14} className="transition-colors duration-150" />
      </button>

      <button
        onClick={() => {
          rotateCounterClockwise();
          setActiveRotation("counterclockwise");
          setTimeout(() => setActiveRotation(null), 200); // Brief visual feedback
        }}
        {...getRotationButtonStyle("counterclockwise")}
        title={t("MapControls.RotateCounterClockwise")}
      >
        <RotateCounterClockwiseIcon size={14} className="transition-colors duration-150" />
      </button> */}
      <button
        onClick={(e) => {
          e.currentTarget.blur();
          setActiveZoom("in");
          onZoomIn?.();
          setTimeout(() => setActiveZoom(null), 200);
        }}
        className={`${
          activeZoom === "in" 
            ? 'bg-brand text-white transform scale-105 shadow-lg' 
            : 'bg-primary-background text-primary-text hover:bg-brand/10'
        } h-7 w-7 flex items-center justify-center rounded-md shadow-sm transition-all duration-200 ease-in-out`} 
        title={t("MapControls.ZoomIn")}
      >
        +
      </button>

      <button
        onClick={(e) => {
          e.currentTarget.blur();
          setActiveZoom("out");
          onZoomOut?.();
          setTimeout(() => setActiveZoom(null), 200);
        }}
        className={`${
          activeZoom === "out" 
            ? 'bg-brand text-white transform scale-105 shadow-lg' 
            : 'bg-primary-background text-primary-text hover:bg-brand/10'
        } h-7 w-7 flex items-center justify-center rounded-md shadow-sm transition-all duration-200 ease-in-out`} 
        title={t("MapControls.ZoomOut")}
      >
        −
      </button>

      <button
        onClick={() => {
          router.push('/map');
        }}
        className={`${
          streetViewActive 
            ? 'bg-brand text-white transform scale-105 shadow-lg' 
            : 'bg-primary-background text-primary-text hover:bg-brand/10'
        } h-7 w-7 flex items-center justify-center rounded-md shadow-sm transition-all duration-200 ease-in-out`} 
        title={t("MapControls.3D")}
      >
        2-D
      </button>
      
    </div>
  );
};