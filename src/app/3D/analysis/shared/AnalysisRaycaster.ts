import * as THREE from 'three';

export interface RaycastResult {
    hit: boolean;
    distance: number;
    point?: THREE.Vector3;
    object?: THREE.Object3D;
}

export interface SphericalRayResult {
    azimuth: number;
    elevation: number;
    blocked: boolean;
    distance: number | null;
    hit?: THREE.Vector3;
}

/**
 * Shared raycaster for all analysis tools
 * Functional approach with closure-based state
 */
function createAnalysisRaycaster() {
    // Private state via closure
    const raycaster = new THREE.Raycaster();
    raycaster.far = 100000; // Extended range for analysis
    
    let camera: THREE.Camera | null = null;
    let scene: THREE.Scene | null = null;

    function setCamera(cam: THREE.Camera): void {
        camera = cam;
    }

    function setScene(scn: THREE.Scene): void {
        scene = scn;
    }

    /**
     * Cast a single ray from origin in direction
     */
    function castRay(
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        options: {
            maxDistance?: number;
            excludeUserData?: string[];
        } = {}
    ): RaycastResult {
        const { maxDistance = 10000, excludeUserData = [] } = options;

        raycaster.set(origin, direction.normalize());
        raycaster.far = maxDistance;

        if (!scene) {
            return { hit: false, distance: maxDistance };
        }

        const intersects = raycaster.intersectObjects(scene.children, true);

        // Filter out excluded objects
        const validIntersects = intersects.filter((intersect) => {
            let obj = intersect.object;
            while (obj) {
                for (const key of excludeUserData) {
                    if (obj.userData[key]) return false;
                }
                obj = obj.parent as THREE.Object3D;
            }
            return true;
        });

        if (validIntersects.length > 0) {
            const firstHit = validIntersects[0];
            return {
                hit: true,
                distance: firstHit.distance,
                point: firstHit.point.clone(),
                object: firstHit.object,
            };
        }

        return { hit: false, distance: maxDistance };
    }

    /**
     * Cast rays in a spherical pattern (360° horizontally + vertical coverage)
     */
    function castSphericalRays(
        origin: THREE.Vector3,
        horizontalRays: number,
        verticalRays: number,
        options: {
            maxDistance?: number;
            excludeUserData?: string[];
        } = {}
    ): SphericalRayResult[] {
        const results: SphericalRayResult[] = [];
        const { maxDistance = 2000, excludeUserData = [] } = options;

        // Vertical angles from -90° to +90° (elevation)
        for (let v = 0; v < verticalRays; v++) {
            const elevation = (v / (verticalRays - 1)) * Math.PI - Math.PI / 2;

            // Horizontal angles from 0° to 360° (azimuth)
            for (let h = 0; h < horizontalRays; h++) {
                const azimuth = (h / horizontalRays) * Math.PI * 2;

                // Convert spherical to Cartesian coordinates
                const direction = new THREE.Vector3(
                    Math.cos(elevation) * Math.cos(azimuth),
                    Math.sin(elevation),
                    Math.cos(elevation) * Math.sin(azimuth)
                );

                const result = castRay(origin, direction, { maxDistance, excludeUserData });

                results.push({
                    azimuth,
                    elevation,
                    blocked: result.hit,
                    distance: result.distance,
                    hit: result.point,
                });
            }
        }

        return results;
    }

    /**
     * Cast rays in a circular pattern (horizontal only, at eye level)
     */
    function castCircularRays(
        origin: THREE.Vector3,
        numRays: number,
        options: {
            maxDistance?: number;
            excludeUserData?: string[];
        } = {}
    ): Array<{ angle: number; blocked: boolean; distance: number; hit?: THREE.Vector3 }> {
        const results = [];
        const { maxDistance = 2000, excludeUserData = [] } = options;

        for (let i = 0; i < numRays; i++) {
            const angle = (i / numRays) * Math.PI * 2;
            const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

            const result = castRay(origin, direction, { maxDistance, excludeUserData });

            results.push({
                angle,
                blocked: result.hit,
                distance: result.distance,
                hit: result.point,
            });
        }

        return results;
    }

    return {
        setCamera,
        setScene,
        castRay,
        castSphericalRays,
        castCircularRays,
    };
}

// Global singleton instance
export const globalAnalysisRaycaster = createAnalysisRaycaster();
