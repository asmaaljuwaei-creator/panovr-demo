'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type AnalysisMode = 'none' | 'lineOfSight' | 'visibilityDome' | 'viewshed' | 'humanEye';

interface Map3DContextType {
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    controls: OrbitControls | null;
    tileGroup: THREE.Group | null;
    cameraManager: any | null; // CameraControlManager type
    analysisMode: AnalysisMode;
    setScene: (scene: THREE.Scene | null) => void;
    setCamera: (camera: THREE.PerspectiveCamera | null) => void;
    setRenderer: (renderer: THREE.WebGLRenderer | null) => void;
    setControls: (controls: OrbitControls | null) => void;
    setTileGroup: (tileGroup: THREE.Group | null) => void;
    setCameraManager: (manager: any | null) => void;
    setAnalysisMode: (mode: AnalysisMode) => void;
}

const Map3DContext = createContext<Map3DContextType | undefined>(undefined);

export const Map3DProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [scene, setScene] = useState<THREE.Scene | null>(null);
    const [camera, setCamera] = useState<THREE.PerspectiveCamera | null>(null);
    const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null);
    const [controls, setControls] = useState<OrbitControls | null>(null);
    const [tileGroup, setTileGroup] = useState<THREE.Group | null>(null);
    const [cameraManager, setCameraManager] = useState<any | null>(null);
    const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('none');

    return (
        <Map3DContext.Provider
            value={{
                scene,
                camera,
                renderer,
                controls,
                tileGroup,
                cameraManager,
                analysisMode,
                setScene,
                setCamera,
                setRenderer,
                setControls,
                setTileGroup,
                setCameraManager,
                setAnalysisMode,
            }}
        >
            {children}
        </Map3DContext.Provider>
    );
};

export const useMap3D = (): Map3DContextType | null => {
    const context = useContext(Map3DContext);
    return context || null;
};

// For components that absolutely require the context
export const useMap3DRequired = (): Map3DContextType => {
    const context = useContext(Map3DContext);
    if (!context) {
        throw new Error('useMap3D must be used within a Map3DProvider');
    }
    return context;
};
