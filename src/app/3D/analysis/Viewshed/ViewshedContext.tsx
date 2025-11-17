'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useViewshed, ViewshedLayer } from './useViewshed';

interface ViewshedContextType {
    point: any;
    range: number;
    setRange: (range: number) => void;
    resolution: number;
    setResolution: (resolution: number) => void;
    heightOffset: number;
    setHeightOffset: (offset: number) => void;
    verticalResolution: number;
    setVerticalResolution: (resolution: number) => void;
    isAnalyzing: boolean;
    progress: number;
    visibilityPercentage: number;
    groundVisibility: number;
    skyVisibility: number;
    placePoint: (position: any) => void;
    clear: () => void;
    exportAsImage: () => void;
    exportAsLayer: () => void;
    layers: ViewshedLayer[];
    activeLayerId: string | null;
    setActiveLayerId: (id: string | null) => void;
    toggleLayerVisibility: (layerId: string) => void;
    deleteLayer: (layerId: string) => void;
    loadLayerParameters: (layerId: string) => void;
    renameLayer: (layerId: string, newName: string) => void;
    rerunLayer: (layerId: string) => void;
}

const ViewshedContext = createContext<ViewshedContextType | undefined>(undefined);

export const ViewshedProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const viewshedData = useViewshed();

    return (
        <ViewshedContext.Provider value={viewshedData}>
            {children}
        </ViewshedContext.Provider>
    );
};

export const useViewshedContext = () => {
    const context = useContext(ViewshedContext);
    if (!context) {
        throw new Error('useViewshedContext must be used within ViewshedProvider');
    }
    return context;
};
