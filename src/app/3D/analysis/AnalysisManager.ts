/**
 * Analysis Manager - Singleton that persists analysis data independently of component lifecycle
 * Created once on app launch, survives panel mount/unmount cycles
 */

import * as THREE from 'three';

export interface ViewshedLayer {
    id: string;
    name: string;
    point: {
        id: string;
        position: THREE.Vector3;
        marker: THREE.Mesh;
    };
    mesh: THREE.Mesh;
    range: number;
    resolution: number;
    heightOffset: number;
    verticalResolution: number;
    bbox: {
        minX: number;
        minZ: number;
        maxX: number;
        maxZ: number;
    };
    timestamp: Date;
    visible: boolean;
    groundVisibility: number;
    skyVisibility: number;
}

class AnalysisManagerClass {
    // Viewshed data
    private viewshedLayers: ViewshedLayer[] = [];
    private activeViewshedLayerId: string | null = null;
    
    // Line of Sight data (can be added later)
    // private lineOfSightData: any[] = [];
    
    // Visibility Dome data (can be added later)
    // private visibilityDomeData: any[] = [];

    // Viewshed methods
    getViewshedLayers(): ViewshedLayer[] {
        return this.viewshedLayers;
    }

    addViewshedLayer(layer: ViewshedLayer): void {
        this.viewshedLayers.push(layer);
        this.activeViewshedLayerId = layer.id;
    }

    removeViewshedLayer(layerId: string): void {
        this.viewshedLayers = this.viewshedLayers.filter(l => l.id !== layerId);
        if (this.activeViewshedLayerId === layerId) {
            this.activeViewshedLayerId = null;
        }
    }

    updateViewshedLayer(layerId: string, updates: Partial<ViewshedLayer>): void {
        const layer = this.viewshedLayers.find(l => l.id === layerId);
        if (layer) {
            Object.assign(layer, updates);
        }
    }

    getActiveViewshedLayerId(): string | null {
        return this.activeViewshedLayerId;
    }

    setActiveViewshedLayerId(layerId: string | null): void {
        this.activeViewshedLayerId = layerId;
    }

    clearAllViewshedLayers(): void {
        this.viewshedLayers = [];
        this.activeViewshedLayerId = null;
    }

    // Add more methods as needed for other analysis tools
}

// Singleton instance - created once and persists
export const analysisManager = new AnalysisManagerClass();
