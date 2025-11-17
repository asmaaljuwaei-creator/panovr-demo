'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/components/useLocale';
import { useThemeStore } from '@/components/useThemeStore';

interface ThreeDMapControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onSwitchTo2D?: () => void;
}

export const ThreeDMapControls: React.FC<ThreeDMapControlsProps> = ({ onZoomIn, onZoomOut, onSwitchTo2D }) => {
    const router = useRouter();
    const { mode, primaryColor } = useThemeStore();
    const { t } = useLocale();
    const [activeZoom, setActiveZoom] = useState<"in" | "out" | null>(null);

    const rawColor = primaryColor || "#2563eb";
    const baseButtonClass = "flex h-7 w-7 items-center justify-center rounded text-base font-bold transition-all duration-150 ease-in-out";

    const handleZoomIn = () => {
        onZoomIn();
        setActiveZoom("in");
        setTimeout(() => setActiveZoom(null), 200);
    };

    const handleZoomOut = () => {
        onZoomOut();
        setActiveZoom("out");
        setTimeout(() => setActiveZoom(null), 200);
    };

    const handleGoTo2D = () => {
        if (onSwitchTo2D) {
            onSwitchTo2D();
        } else {
            router.push('/map');
        }
    };

    return (
        <div className="flex flex-col space-y-2">
            <button
                onClick={handleZoomIn}
                className={`${baseButtonClass} bg-primary-background text-primary-text focus:bg-brand focus:text-white shadow-sm`}
                style={activeZoom === "in" ? {
                    backgroundColor: rawColor,
                    color: "#fff",
                    transform: "scale(1.05)",
                    boxShadow: `0 0 4px ${rawColor}`,
                } : undefined}
                title="Zoom In"
            >
                +
            </button>

            <button
                onClick={handleZoomOut}
                className={`${baseButtonClass} bg-primary-background text-primary-text focus:bg-brand focus:text-white shadow-sm`}
                style={activeZoom === "out" ? {
                    backgroundColor: rawColor,
                    color: "#fff",
                    transform: "scale(1.05)",
                    boxShadow: `0 0 4px ${rawColor}`,
                } : undefined}
                title="Zoom Out"
            >
                −
            </button>

            <button
                onClick={handleGoTo2D}
                className={`${baseButtonClass} bg-primary-background text-primary-text focus:bg-brand focus:text-white shadow-sm`}
                title="Switch to 2D"
            >
                2D
            </button>
        </div>
    );
};
