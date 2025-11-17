import { useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useMap3DRequired } from '../../context/Map3DContext';
import { globalAnalysisPool, globalAnalysisRaycaster } from '../shared';

export interface HumanEyePoint {
    id: string;
    position: THREE.Vector3;
    marker: THREE.Mesh;
}

interface ObstructedObject {
    object: THREE.Object3D;
    hitData: Array<{
        point: THREE.Vector3;
        normal: THREE.Vector3;
        face: THREE.Face | null;
    }>;
}

interface PlaneMarker {
    plane: THREE.Mesh;
    center: THREE.Vector3;
    normal: THREE.Vector3;
    hitCount: number;
    buildingDepth: number;
}

export const useHumanEye = () => {
    const { scene, camera, cameraManager, analysisMode, tileGroup } = useMap3DRequired();
    const [point, setPoint] = useState<HumanEyePoint | null>(null);
    const [planeMarkers, setPlaneMarkers] = useState<PlaneMarker[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isFirstPersonMode, setIsFirstPersonMode] = useState(false);
    const [originalBuildingOpacities, setOriginalBuildingOpacities] = useState<Map<THREE.Object3D, number>>(new Map());

    // Initialize raycaster
    useEffect(() => {
        if (camera) globalAnalysisRaycaster.setCamera(camera);
        if (scene) globalAnalysisRaycaster.setScene(scene);
    }, [camera, scene]);

    // Place human eye point
    const placePoint = useCallback((position: THREE.Vector3) => {
        if (!tileGroup) return;

        // Clear existing point
        if (point) {
            globalAnalysisPool.returnMarker(point.marker, tileGroup);
        }

        const id = `humaneye-point-${Date.now()}`;

        // Cyan marker for human eye
        const marker = globalAnalysisPool.getMarker({
            color: 0x06b6d4,
            radius: 10,
            opacity: 0.95
        });
        marker.userData.isHumanEyeMarker = true;

        // Convert to tileGroup local space
        const localPosition = tileGroup.worldToLocal(position.clone());
        marker.position.copy(localPosition);

        tileGroup.add(marker);

        console.log('👁️ Human eye point placed at:', position);

        const newPoint: HumanEyePoint = {
            id,
            position: position.clone(),
            marker,
        };

        setPoint(newPoint);
    }, [tileGroup, point]);

    // Consolidate coplanar hits with improved thresholds
    const consolidateCoplanarHits = useCallback((
        allHits: Array<{ point: THREE.Vector3; normal: THREE.Vector3; buildingIndex: number }>,
        distanceThreshold: number = 2, // Tighter distance threshold
        normalThreshold: number = 0.98 // Stricter normal similarity
    ): PlaneMarker[] => {
        const clusters: Array<{
            hits: typeof allHits;
            center: THREE.Vector3;
            normal: THREE.Vector3;
            uniqueBuildings: Set<number>;
        }> = [];

        // Cluster hits by coplanar surfaces
        for (const hit of allHits) {
            let foundCluster = false;

            for (const cluster of clusters) {
                // Check if normal is similar (dot product close to 1)
                const normalSimilarity = hit.normal.dot(cluster.normal);

                // Check if point is close to cluster center
                const distanceToCenter = hit.point.distanceTo(cluster.center);

                if (normalSimilarity >= normalThreshold && distanceToCenter <= distanceThreshold) {
                    cluster.hits.push(hit);
                    cluster.uniqueBuildings.add(hit.buildingIndex);

                    // Update cluster center (average)
                    cluster.center.multiplyScalar(cluster.hits.length - 1);
                    cluster.center.add(hit.point);
                    cluster.center.divideScalar(cluster.hits.length);

                    // Update cluster normal (average)
                    cluster.normal.multiplyScalar(cluster.hits.length - 1);
                    cluster.normal.add(hit.normal);
                    cluster.normal.normalize();

                    foundCluster = true;
                    break;
                }
            }

            if (!foundCluster) {
                // Create new cluster
                clusters.push({
                    hits: [hit],
                    center: hit.point.clone(),
                    normal: hit.normal.clone(),
                    uniqueBuildings: new Set([hit.buildingIndex])
                });
            }
        }

        // Create plane markers from clusters
        return clusters.map(cluster => {
            // Calculate combined intensity based on hit density and building depth
            const hitDensity = cluster.hits.length / 10; // Normalize by 10
            const buildingDepth = cluster.uniqueBuildings.size / Math.max(1, allHits.length);
            const combinedIntensity = Math.min(1, hitDensity * 0.6 + buildingDepth * 0.4);

            // Color ramp: Yellow -> Orange -> Red
            const color = new THREE.Color();
            if (combinedIntensity < 0.3) {
                // Yellow
                color.setRGB(1, 1, 0);
            } else if (combinedIntensity < 0.6) {
                // Orange
                color.setRGB(1, 0.6, 0);
            } else {
                // Deep red
                color.setRGB(1, 0, 0);
            }

            // Adaptive plane size based on hit count
            const planeSize = Math.min(Math.max(cluster.hits.length * 0.5, 2), 8);

            const geometry = new THREE.PlaneGeometry(planeSize, planeSize);
            const material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            const plane = new THREE.Mesh(geometry, material);

            // Position plane at cluster center (in world space)
            plane.position.copy(cluster.center);

            // Orient plane using cluster normal
            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cluster.normal);
            plane.setRotationFromQuaternion(quaternion);

            plane.userData.isHumanEyePlane = true;
            plane.renderOrder = 995;

            return {
                plane,
                center: cluster.center,
                normal: cluster.normal,
                hitCount: cluster.hits.length,
                buildingDepth: cluster.uniqueBuildings.size
            };
        });
    }, []);

    // Perform human eye analysis with progressive rendering
    const analyzeHumanEye = useCallback(async () => {
        if (!point || !scene || !tileGroup) return;

        setIsAnalyzing(true);
        console.log('🔍 Starting progressive obstruction analysis');

        // Clear old plane markers
        planeMarkers.forEach(marker => {
            scene.remove(marker.plane);
            marker.plane.geometry.dispose();
            (marker.plane.material as THREE.Material).dispose();
        });

        // Restore building opacities before new analysis
        originalBuildingOpacities.forEach((opacity, object) => {
            if (object && (object as any).isMesh && (object as any).material) {
                const materials = Array.isArray((object as any).material) ? (object as any).material : [(object as any).material];
                materials.forEach((mat: any) => {
                    mat.opacity = opacity;
                    mat.transparent = opacity < 1;
                });
            }
        });
        setOriginalBuildingOpacities(new Map());

        // Cast more rays for better accuracy (144 horizontal × 8 vertical = 1,152 rays)
        const horizontalRays = 144;
        const verticalRays = 8;
        const batchSize = 10; // Smaller batches for better async behavior

        const obstructedObjects = new Map<string, ObstructedObject>();
        const buildingIndexMap = new Map<THREE.Object3D, number>();
        let currentBuildingIndex = 0;

        // Progressive raycasting
        for (let batch = 0; batch < Math.ceil((horizontalRays * verticalRays) / batchSize); batch++) {
            const startIndex = batch * batchSize;
            const endIndex = Math.min(startIndex + batchSize, horizontalRays * verticalRays);

            for (let i = startIndex; i < endIndex; i++) {
                const h = i % horizontalRays;
                const v = Math.floor(i / horizontalRays);

                const azimuth = (h / horizontalRays) * Math.PI * 2;
                const elevation = ((v / (verticalRays - 1)) - 0.5) * Math.PI / 3; // -30° to +30°

                const direction = new THREE.Vector3(
                    Math.cos(elevation) * Math.cos(azimuth),
                    Math.sin(elevation),
                    Math.cos(elevation) * Math.sin(azimuth)
                );

                const result = globalAnalysisRaycaster.castRay(point.position, direction, {
                    maxDistance: 1000,
                    excludeUserData: ['isHumanEyeMarker', 'isHumanEyePlane']
                });

                if (result.hit && result.object) {
                    // Find root building object
                    let buildingObj = result.object;
                    while (buildingObj.parent && !buildingObj.userData?.buildingName) {
                        buildingObj = buildingObj.parent as THREE.Object3D;
                    }

                    const buildingName = buildingObj.userData?.buildingName || buildingObj.uuid;

                    // Assign building index
                    if (!buildingIndexMap.has(buildingObj)) {
                        buildingIndexMap.set(buildingObj, currentBuildingIndex++);
                    }

                    if (!obstructedObjects.has(buildingName)) {
                        obstructedObjects.set(buildingName, {
                            object: buildingObj,
                            hitData: []
                        });
                    }

                    // Extract face normal if available
                    const raycaster = new THREE.Raycaster(point.position, direction.normalize());
                    raycaster.far = 1000;
                    const intersects = raycaster.intersectObject(result.object, false);

                    let faceNormal = direction.clone().negate(); // Default to reverse direction
                    if (intersects.length > 0 && intersects[0].face) {
                        faceNormal = intersects[0].face.normal.clone();
                        // Transform to world space
                        faceNormal.transformDirection(result.object.matrixWorld);
                    }

                    obstructedObjects.get(buildingName)!.hitData.push({
                        point: result.point!,
                        normal: faceNormal,
                        face: intersects[0]?.face || null
                    });
                }
            }

            // Yield to UI more frequently for smoother performance
            await new Promise(resolve => setTimeout(resolve, 16)); // ~60fps frame time
        }

        console.log(`👁️ Found ${obstructedObjects.size} obstructing buildings`);

        // Collect all hits with building indices
        const allHits: Array<{ point: THREE.Vector3; normal: THREE.Vector3; buildingIndex: number }> = [];
        obstructedObjects.forEach(obj => {
            const buildingIndex = buildingIndexMap.get(obj.object) || 0;
            obj.hitData.forEach(hit => {
                allHits.push({
                    point: hit.point,
                    normal: hit.normal,
                    buildingIndex
                });
            });
        });

        console.log(`📐 Consolidating ${allHits.length} hits into coplanar surfaces`);

        // Consolidate coplanar hits
        const consolidated = consolidateCoplanarHits(allHits);

        console.log(`🎨 Created ${consolidated.length} consolidated planes`);

        // Add planes to scene
        consolidated.forEach(marker => {
            scene.add(marker.plane);
        });

        setPlaneMarkers(consolidated);

        // Store obstructed objects for later transparency control in first-person mode
        const opacityMap = new Map<THREE.Object3D, number>();
        obstructedObjects.forEach(obj => {
            obj.object.traverse((child: any) => {
                if (child.isMesh && child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach((mat: any) => {
                        if (!opacityMap.has(child)) {
                            opacityMap.set(child, mat.opacity);
                        }
                    });
                }
            });
        });

        setOriginalBuildingOpacities(opacityMap);
        setIsAnalyzing(false);
    }, [point, scene, tileGroup, planeMarkers, consolidateCoplanarHits, originalBuildingOpacities]);

    // Toggle first-person mode
    const toggleFirstPersonMode = useCallback(() => {
        if (!point || !cameraManager) return;

        if (isFirstPersonMode) {
            // Exit first-person mode - return to orbit and restore opacity
            cameraManager.setMode('orbit');
            
            // Restore building opacities
            originalBuildingOpacities.forEach((opacity, object) => {
                if (object && (object as any).isMesh && (object as any).material) {
                    const materials = Array.isArray((object as any).material) ? (object as any).material : [(object as any).material];
                    materials.forEach((mat: any) => {
                        mat.opacity = opacity;
                        mat.transparent = opacity < 1;
                    });
                }
            });
            
            setIsFirstPersonMode(false);
            console.log('👁️ Exited first-person mode - buildings restored');
        } else {
            // Enter first-person mode at human eye height (1.7m above ground)
            const eyeHeight = 1.7;
            const firstPersonPosition = point.position.clone();
            firstPersonPosition.y += eyeHeight;
            
            cameraManager.setMode('firstPerson', firstPersonPosition);
            
            // Make buildings semi-transparent in first-person mode
            originalBuildingOpacities.forEach((opacity, object) => {
                if (object && (object as any).isMesh && (object as any).material) {
                    const materials = Array.isArray((object as any).material) ? (object as any).material : [(object as any).material];
                    materials.forEach((mat: any) => {
                        mat.transparent = true;
                        mat.opacity = 0.3;
                    });
                }
            });
            
            setIsFirstPersonMode(true);
            console.log('👁️ Entered first-person mode - buildings now semi-transparent');
        }
    }, [point, cameraManager, isFirstPersonMode, originalBuildingOpacities]);

    // Trigger analysis when point is placed
    useEffect(() => {
        if (point && !isAnalyzing) {
            analyzeHumanEye();
        }
    }, [point]);

    // Handle mouse events
    useEffect(() => {
        if (analysisMode !== 'humanEye' || !cameraManager || !scene) return;

        const handleClick = (event: MouseEvent) => {
            if (event.button !== 0) return; // Only left click

            const intersection = cameraManager.getIntersection(event);
            if (intersection) {
                // Don't place if clicking on existing marker
                if (intersection.object.userData.isHumanEyeMarker) return;

                placePoint(intersection.point);
            }
        };

        window.addEventListener('click', handleClick);

        return () => {
            window.removeEventListener('click', handleClick);
        };
    }, [analysisMode, cameraManager, scene, placePoint]);

    // Clear everything
    const clear = useCallback(() => {
        if (!tileGroup) return;

        // Exit first-person mode if active
        if (isFirstPersonMode && cameraManager) {
            cameraManager.setMode('orbit');
            setIsFirstPersonMode(false);
        }

        if (point) {
            globalAnalysisPool.returnMarker(point.marker, tileGroup);
        }

        // Remove plane markers
        planeMarkers.forEach(marker => {
            scene?.remove(marker.plane);
            marker.plane.geometry.dispose();
            (marker.plane.material as THREE.Material).dispose();
        });

        // Restore building opacities
        originalBuildingOpacities.forEach((opacity, object) => {
            if (object && (object as any).isMesh && (object as any).material) {
                const materials = Array.isArray((object as any).material) ? (object as any).material : [(object as any).material];
                materials.forEach((mat: any) => {
                    mat.opacity = opacity;
                    mat.transparent = opacity < 1;
                });
            }
        });

        setPoint(null);
        setPlaneMarkers([]);
        setOriginalBuildingOpacities(new Map());
    }, [tileGroup, point, planeMarkers, originalBuildingOpacities, scene, isFirstPersonMode, cameraManager]);

    // Restore orbit mode when exiting human eye analysis mode
    useEffect(() => {
        if (analysisMode !== 'humanEye' && isFirstPersonMode && cameraManager) {
            cameraManager.setMode('orbit');
            setIsFirstPersonMode(false);
        }
    }, [analysisMode, isFirstPersonMode, cameraManager]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clear();
        };
    }, []);

    return {
        point,
        isAnalyzing,
        isFirstPersonMode,
        placePoint,
        toggleFirstPersonMode,
        clear,
    };
};
