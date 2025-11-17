import * as THREE from 'three';

/**
 * Shared geometry pool for analysis markers to reduce memory overhead
 * Functional approach with closure-based state
 */
function createAnalysisGeometryPool() {
    // Private state via closure
    const sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
    const markerMaterial = new Map<number, THREE.MeshBasicMaterial>();

    /**
     * Get or create a marker with specified color
     */
    function getMarker(options: { color: number; radius?: number; opacity?: number }): THREE.Mesh {
        const { color, radius = 1, opacity = 1 } = options;

        // Get or create material for this color
        if (!markerMaterial.has(color)) {
            markerMaterial.set(
                color,
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: opacity < 1,
                    opacity,
                    depthTest: true,
                    depthWrite: true,
                })
            );
        }

        const material = markerMaterial.get(color)!;
        const mesh = new THREE.Mesh(sphereGeometry, material);
        mesh.scale.setScalar(radius);
        mesh.userData.isAnalysisMarker = true;

        return mesh;
    }

    /**
     * Return a marker to the pool (remove from parent)
     */
    function returnMarker(marker: THREE.Mesh, parent: THREE.Object3D): void {
        parent.remove(marker);
        // Material is shared, so we don't dispose it
        // Geometry is shared, so we don't dispose it
    }

    /**
     * Dispose all resources
     */
    function dispose(): void {
        sphereGeometry.dispose();
        markerMaterial.forEach((material) => material.dispose());
        markerMaterial.clear();
    }

    return {
        getMarker,
        returnMarker,
        dispose,
    };
}

// Global singleton instance
export const globalAnalysisPool = createAnalysisGeometryPool();
