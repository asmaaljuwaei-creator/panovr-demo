import { useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useMap3DRequired } from '../../context/Map3DContext';
import { globalAnalysisPool, globalAnalysisRaycaster, globalAnalysisController } from '../shared';
import { analysisManager } from '../AnalysisManager';
// @ts-ignore
import piexif from 'piexifjs';

// Coordinate conversion utilities
const EARTH_RADIUS = 6378137;

function mercatorToLatLon(x: number, y: number): { lat: number; lon: number } {
    const lon = (x / EARTH_RADIUS) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI);
    return { lat, lon };
}

export interface ViewshedPoint {
    id: string;
    position: THREE.Vector3;
    marker: THREE.Mesh;
}

export interface ViewshedLayer {
    id: string;
    name: string;
    point: ViewshedPoint;
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

export const useViewshed = () => {
    const { scene, camera, cameraManager, analysisMode, tileGroup } = useMap3DRequired();
    const [point, setPoint] = useState<ViewshedPoint | null>(null);
    const [mesh, setMesh] = useState<THREE.Mesh | null>(null);
    const [range, setRange] = useState<number>(500); // meters
    const [resolution, setResolution] = useState<number>(48); // number of horizontal rays (reduced for performance)
    const [heightOffset, setHeightOffset] = useState<number>(2); // meters above ground
    const [verticalResolution, setVerticalResolution] = useState<number>(2); // number of vertical angle steps (0-90°) - reduced for performance
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [visibilityPercentage, setVisibilityPercentage] = useState<number>(0);
    const [groundVisibility, setGroundVisibility] = useState<number>(0);
    const [skyVisibility, setSkyVisibility] = useState<number>(0);
    
    // Layer management - restore from manager if data exists (panel reopen)
    // Don't use ref because React Strict Mode causes double mounting
    const [layers, setLayers] = useState<ViewshedLayer[]>(() => {
        const persistedLayers = analysisManager.getViewshedLayers();
        // If manager has layers, this is a panel reopen, otherwise first mount
        return persistedLayers.length > 0 ? persistedLayers : [];
    });
    const [activeLayerId, setActiveLayerId] = useState<string | null>(() => {
        const persistedLayers = analysisManager.getViewshedLayers();
        return persistedLayers.length > 0 ? analysisManager.getActiveViewshedLayerId() : null;
    });

    // Group to contain all viewshed visuals (markers + meshes) - managed by AnalysisController
    const [viewshedGroup, setViewshedGroup] = useState<THREE.Group | null>(null);
    // Cancellation token for async analyses
    const runIdRef = useRef(0);

    // Attach group via AnalysisController and restore if panel reopen
    useEffect(() => {
        if (tileGroup && !viewshedGroup) {
            console.log('[Viewshed] Attaching to tileGroup:', tileGroup);
            globalAnalysisController.ensureAttached(tileGroup);
            const g = globalAnalysisController.getToolGroup('Viewshed');
            console.log('[Viewshed] Got viewshed group:', g, 'parent:', g.parent);
            setViewshedGroup(g);
            
            // Check if we need to restore layers (panel reopen)
            const persistedLayers = analysisManager.getViewshedLayers();
            if (persistedLayers.length > 0) {
                console.log('[Viewshed] Panel reopen - restoring', persistedLayers.length, 'layers');
                // Re-add meshes and markers to the group
                persistedLayers.forEach(layer => {
                    layer.mesh.visible = true;
                    layer.point.marker.visible = true;
                    g.add(layer.mesh);
                    g.add(layer.point.marker);
                });
                setLayers(persistedLayers);
                setActiveLayerId(analysisManager.getActiveViewshedLayerId());
            } else {
                console.log('[Viewshed] First mount - no layers to restore');
            }
        }
        return () => {
            // No cleanup - MapInteractionManager handles clearing on 2D switch
        };
    }, [tileGroup, viewshedGroup]);

    // Initialize raycaster
    useEffect(() => {
        if (camera) globalAnalysisRaycaster.setCamera(camera);
        if (scene) globalAnalysisRaycaster.setScene(scene);
    }, [camera, scene]);

    // Update layer opacity based on active selection
    useEffect(() => {
        layers.forEach(layer => {
            const meshMaterial = layer.mesh.material;
            const markerMaterial = layer.point.marker.material;
            
            if (layer.id === activeLayerId) {
                // Active layer: full opacity
                if (Array.isArray(meshMaterial)) {
                    meshMaterial.forEach(m => { m.opacity = 0.7; m.needsUpdate = true; });
                } else {
                    meshMaterial.opacity = 0.7;
                    meshMaterial.needsUpdate = true;
                }
                if (Array.isArray(markerMaterial)) {
                    markerMaterial.forEach(m => { m.opacity = 0.95; m.needsUpdate = true; });
                } else {
                    markerMaterial.opacity = 0.95;
                    markerMaterial.needsUpdate = true;
                }
            } else {
                // Inactive layers: more transparent but still visible
                if (Array.isArray(meshMaterial)) {
                    meshMaterial.forEach(m => { m.opacity = 0.35; m.needsUpdate = true; });
                } else {
                    meshMaterial.opacity = 0.35;
                    meshMaterial.needsUpdate = true;
                }
                if (Array.isArray(markerMaterial)) {
                    markerMaterial.forEach(m => { m.opacity = 0.5; m.needsUpdate = true; });
                } else {
                    markerMaterial.opacity = 0.5;
                    markerMaterial.needsUpdate = true;
                }
            }
        });
    }, [activeLayerId, layers]);

    // Place viewshed point
    const placePoint = useCallback((position: THREE.Vector3) => {
        console.log('[Viewshed] placePoint called with position:', position);
        console.log('[Viewshed] tileGroup:', tileGroup, 'viewshedGroup:', viewshedGroup);
        
        if (!tileGroup) {
            console.warn('[Viewshed] No tileGroup, cannot place point');
            return;
        }
        
        // Prevent placing point while analysis is running
        if (isAnalyzing) {
            console.log('[Viewshed] Analysis already in progress, ignoring click');
            return;
        }

        // Ensure group exists before placing points
        let currentGroup = viewshedGroup;
        if (!currentGroup) {
            globalAnalysisController.ensureAttached(tileGroup);
            currentGroup = globalAnalysisController.getToolGroup('Viewshed');
            setViewshedGroup(currentGroup);
        }

        // New map click should create a NEW layer: clear any active layer selection
        setActiveLayerId(null);
        analysisManager.setActiveViewshedLayerId(null);

        // Don't clear anything - all viewsheds should persist
        // The current point and mesh will be saved as a layer automatically
        // New point/mesh will be created separately

        const id = `viewshed-point-${Date.now()}`;

        // Purple marker for viewshed
        const marker = globalAnalysisPool.getMarker({
            color: 0x9b59b6,
            radius: 10,
            opacity: 0.95
        });
        marker.userData.isViewshedMarker = true;
        console.log('[Viewshed] Created marker:', marker);

        // Convert to tileGroup local space
        const localPosition = tileGroup.worldToLocal(position.clone());
        marker.position.copy(localPosition);
        console.log('[Viewshed] Marker position (local):', localPosition);

        currentGroup.add(marker);
        console.log('[Viewshed] Added marker to group. Group children count:', currentGroup.children.length);
        console.log('[Viewshed] Marker visible:', marker.visible, 'Group visible:', currentGroup.visible);


        const newPoint: ViewshedPoint = {
            id,
            position: position.clone(),
            marker,
        };

        setPoint(newPoint);
    }, [tileGroup, point, viewshedGroup, isAnalyzing]);

    // Perform viewshed analysis with progressive rendering
    const analyzeViewshed = useCallback(async () => {
        if (!point || !tileGroup) return;
        
        // Prevent multiple analyses from running
        if (isAnalyzing) {
            console.log('Analysis already running, skipping');
            return;
        }

        // Start a new run and capture token
        const thisRun = ++runIdRef.current;

        setIsAnalyzing(true);
        setProgress(0);

        const numRays = resolution;
        const numRings = 25; // Reduced for performance (was 40)
        const updateInterval = 20; // Larger chunks for fewer updates (2 total updates)

        // Remove old mesh from state if it exists
        if (mesh && viewshedGroup) {
            viewshedGroup.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
            setMesh(null);
        }

        // Apply height offset to viewpoint
        const viewpointPosition = point.position.clone();
        viewpointPosition.y += heightOffset;
        
        const localOrigin = point.marker.position.clone();
        localOrigin.y += heightOffset;

        // Cast rays in 3D spherical pattern (azimuth + elevation)
        // Make this async by chunking the work
        interface RayResult {
            azimuth: number;
            elevation: number;
            blocked: boolean;
            distance: number;
            hitPoint: THREE.Vector3 | null;
        }
        const rayResults: RayResult[] = [];

        const numHorizontalRays = numRays;
        const numVerticalAngles = verticalResolution;
        const totalRaysCount = (numVerticalAngles + 1) * numHorizontalRays;
        
        
        // Process rays in larger chunks for better performance
        const RAYS_PER_CHUNK = 20; // Increased chunk size
        let raysProcessed = 0;

        for (let v = 0; v <= numVerticalAngles; v++) {
            // Elevation angle from 0° (horizontal) to 90° (straight up)
            const elevationAngle = (v / numVerticalAngles) * (Math.PI / 2);

            for (let h = 0; h < numHorizontalRays; h++) {
                const azimuthAngle = (h / numHorizontalRays) * Math.PI * 2;

                // Convert spherical to Cartesian (y-up coordinate system)
                const direction = new THREE.Vector3(
                    Math.cos(elevationAngle) * Math.cos(azimuthAngle),
                    Math.sin(elevationAngle),
                    Math.cos(elevationAngle) * Math.sin(azimuthAngle)
                );

                const result = globalAnalysisRaycaster.castRay(viewpointPosition, direction, {
                    maxDistance: range,
                    excludeUserData: [
                        'isViewshedMarker', 
                        'isAnalysisMarker',
                        'isViewshedVisualization',
                        'isLineOfSightMarker',
                        'isLineOfSightLine',
                        'isVisibilityMarker',
                        'isVisibilityLine',
                        'isHumanEyeMarker'
                    ]
                });

                rayResults.push({
                    azimuth: azimuthAngle,
                    elevation: elevationAngle,
                    blocked: result.hit,
                    distance: result.hit ? result.distance : range,
                    hitPoint: result.hit && result.point ? result.point : null
                });
                
                raysProcessed++;
                
                // Yield to UI periodically
                if (raysProcessed % RAYS_PER_CHUNK === 0) {
                    setProgress((raysProcessed / totalRaysCount) * 50); // First 50% is raycasting
                    await new Promise(resolve => setTimeout(resolve, 8)); // Shorter yield for better responsiveness
                    // Cancelled during yield
                    if (runIdRef.current !== thisRun) {
                        setIsAnalyzing(false);
                        return;
                    }
                }
            }
        }
        
        
        setProgress(60); // 60% complete after raycasting

        // Disable interpolation for maximum performance
        const meshHorizontalRays = numHorizontalRays; // No interpolation multiplier
        

        // Create single final mesh (no progressive rendering)
        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];

        // Track visibility for accurate percentage calculation
        let groundVisibleVertices = 0;
        let groundBlockedVertices = 0;
        let skyVisibleVertices = 0;
        let skyBlockedVertices = 0;

        // Center vertex
        positions.push(0, 0, 0);
        colors.push(0, 1, 0); // Green for center

        let vertexIndex = 1;

        // Create rings - simplified with fewer rings for performance
        const simplifiedNumRings = numRings; // Use numRings directly
        
        // Pre-compute weights for performance
        const precomputedWeights = [5]; // Ground weight
        for (let v = 1; v <= numVerticalAngles; v++) {
            precomputedWeights.push(v === 1 ? 4 : (v === 2 ? 2 : 1));
        }
        const totalWeightPrecomputed = precomputedWeights.reduce((a, b) => a + b, 0);
        
        for (let r = 1; r <= simplifiedNumRings; r++) {
            const ringDistance = (r / simplifiedNumRings) * range;
            
            // Yield more frequently for smoother FPS
            if (r % 3 === 0) {
                setProgress(60 + (r / simplifiedNumRings) * 30); // 60-90% for mesh generation
                await new Promise(resolve => setTimeout(resolve, 0)); // Minimal yield
                if (runIdRef.current !== thisRun) {
                    setIsAnalyzing(false);
                    return;
                }
            }

            for (let i = 0; i < meshHorizontalRays; i++) {
                const angle = (i / meshHorizontalRays) * Math.PI * 2;
                const x = ringDistance * Math.cos(angle);
                const z = ringDistance * Math.sin(angle);

                positions.push(x, 0.5, z);

                // Check ALL rays (ground + upper angles) for obstruction at this ring distance
                let blockedCount = 0;
                let weightedBlockedCount = 0;
                
                // Check ground ray (highest weight - most important)
                const groundRayIndex = 0 * numHorizontalRays + i;
                const groundRay = rayResults[groundRayIndex];
                const isGroundBlocked = groundRay.blocked && ringDistance >= groundRay.distance;
                
                if (isGroundBlocked) {
                    blockedCount++;
                    weightedBlockedCount += precomputedWeights[0];
                    groundBlockedVertices++;
                } else {
                    groundVisibleVertices++;
                }
                
                // Check all upper elevation angles (use precomputed weights)
                for (let v = 1; v <= numVerticalAngles; v++) {
                    const rayIndex = v * numHorizontalRays + i;
                    const rayData = rayResults[rayIndex];
                    const isBlocked = rayData.blocked && ringDistance >= rayData.distance;
                    
                    if (isBlocked) {
                        blockedCount++;
                        weightedBlockedCount += precomputedWeights[v];
                        skyBlockedVertices++;
                    } else {
                        skyVisibleVertices++;
                    }
                }
                
                // Determine if this area is blocked using weighted average (use precomputed total)
                const weightedObstructionRatio = weightedBlockedCount / totalWeightPrecomputed;
                const isAreaBlocked = weightedObstructionRatio > 0.25; // More sensitive threshold (25%)
                
                // Separate ground and sky obstruction for darkness calculation
                const totalCount = numVerticalAngles + 1; // ground ray + all vertical angles
                const skyBlockedCount = blockedCount - (isGroundBlocked ? 1 : 0);
                const skyTotalCount = numVerticalAngles; // Just the upper angles
                const skyObstructionRatio = skyTotalCount > 0 ? skyBlockedCount / skyTotalCount : 0;
                
                // Use sky obstruction for darkness in BOTH red and green areas
                // This makes areas behind tall buildings darker (more obstructed sky = darker)
                const brightness = 1.0 - (skyObstructionRatio * 0.7); // 1.0 (bright) to 0.3 (dark)
                
                // Sharp red/green boundaries, but with darkness based on sky visibility
                if (isAreaBlocked) {
                    // Area is obstructed - RED with darkness from sky obstruction
                    colors.push(brightness, 0, 0);
                } else {
                    // Area is visible - GREEN with darkness from sky obstruction
                    colors.push(0, brightness, 0);
                }

                vertexIndex++;
            }
        }

        // Create indices (triangles)
        // Connect center to first ring
        for (let i = 0; i < meshHorizontalRays; i++) {
            const next = (i + 1) % meshHorizontalRays;
            indices.push(0, i + 1, next + 1);
        }

        // Connect rings
        for (let r = 1; r < simplifiedNumRings; r++) {
            const ringStartIndex = 1 + (r - 1) * meshHorizontalRays;
            const nextRingStartIndex = 1 + r * meshHorizontalRays;

            for (let i = 0; i < meshHorizontalRays; i++) {
                const next = (i + 1) % meshHorizontalRays;

                const a = ringStartIndex + i;
                const b = ringStartIndex + next;
                const c = nextRingStartIndex + i;
                const d = nextRingStartIndex + next;

                // Two triangles per quad
                indices.push(a, c, d);
                indices.push(a, d, b);
            }
        }
        
        // Calculate visibility percentages based on visible area (vertices)
        const totalGroundVertices = groundVisibleVertices + groundBlockedVertices;
        const totalSkyVertices = skyVisibleVertices + skyBlockedVertices;
        
        const groundVisPct = totalGroundVertices > 0 
            ? Math.round((groundVisibleVertices / totalGroundVertices) * 100) 
            : 0;
        const skyVisPct = totalSkyVertices > 0 
            ? Math.round((skyVisibleVertices / totalSkyVertices) * 100) 
            : 0;
        const overallVisPct = Math.round(((groundVisibleVertices + skyVisibleVertices) / (totalGroundVertices + totalSkyVertices)) * 100);
        
        setGroundVisibility(groundVisPct);
        setSkyVisibility(skyVisPct);
        setVisibilityPercentage(overallVisPct);
        
        
        setProgress(90); // 90% complete - creating final mesh

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true,
            blending: THREE.NormalBlending,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });

        // If cancelled before creating mesh, dispose and exit
        if (runIdRef.current !== thisRun) {
            geometry.dispose();
            (material as THREE.Material).dispose();
            setIsAnalyzing(false);
            return;
        }

        const newMesh = new THREE.Mesh(geometry, material);
        newMesh.position.copy(localOrigin);
        newMesh.userData.isViewshedVisualization = true;
        newMesh.userData.isAnalysisVisualization = true; // Exclude from raycasting
        newMesh.renderOrder = 996;

        if (viewshedGroup) {
            viewshedGroup.add(newMesh);
        }
        setMesh(newMesh);

        setIsAnalyzing(false);
        setProgress(100);

        // Calculate bounding box
        const bbox = {
            minX: viewpointPosition.x - range,
            minZ: viewpointPosition.z - range,
            maxX: viewpointPosition.x + range,
            maxZ: viewpointPosition.z + range
        };

        // Save as layer - reuse the current point's marker to avoid duplicates
        if (newMesh && point && viewshedGroup) {
            // Check if we're updating an existing layer (rerun) or creating new
            const existingLayer = activeLayerId ? layers.find(l => l.id === activeLayerId) : null;
            
            if (existingLayer) {
                // UPDATE existing layer
                const updates = {
                    mesh: newMesh,
                    range,
                    resolution,
                    heightOffset,
                    verticalResolution,
                    bbox,
                    timestamp: new Date(),
                    groundVisibility: groundVisPct,
                    skyVisibility: skyVisPct
                };
                
                // Update in persistent manager
                analysisManager.updateViewshedLayer(existingLayer.id, updates);
                // Update local state
                setLayers(analysisManager.getViewshedLayers());
            } else {
                // CREATE new layer
                const layerId = `viewshed-${Date.now()}`;
                const layerName = `Viewshed ${layers.length + 1}`;
                
                // Reuse the current point's marker for this layer (no duplicate)
                const layerPoint: ViewshedPoint = {
                    id: `${layerId}-point`,
                    position: point.position.clone(),
                    marker: point.marker // Reuse existing marker
                };
                
                const newLayer: ViewshedLayer = {
                    id: layerId,
                    name: layerName,
                    point: layerPoint,
                    mesh: newMesh,
                    range,
                    resolution,
                    heightOffset,
                    verticalResolution,
                    bbox,
                    timestamp: new Date(),
                    visible: true,
                    groundVisibility: groundVisPct,
                    skyVisibility: skyVisPct
                };

                // Add to persistent manager
                analysisManager.addViewshedLayer(newLayer);
                // Update local state
                setLayers(analysisManager.getViewshedLayers());
                setActiveLayerId(layerId);
            }
            
            // Clear the working mesh/point since they're now saved in the layer
            // This prevents them from being reused or cleaned up
            setMesh(null);
            setPoint(null);
        }

    }, [point, tileGroup, range, resolution, heightOffset, verticalResolution, mesh, layers, viewshedGroup, isAnalyzing]);

    // Trigger analysis when point is placed or settings change
    useEffect(() => {
        if (point && !isAnalyzing) {
            analyzeViewshed();
        }
    }, [point, range, resolution, heightOffset, verticalResolution]);

    // Handle mouse events
    useEffect(() => {
        if (analysisMode !== 'viewshed' || !cameraManager || !scene) return;

        const handleClick = (event: MouseEvent) => {
            if (event.button !== 0) return; // Only left click

            // Check if click is on canvas element (not on UI panels)
            const target = event.target as HTMLElement;
            if (!target || target.tagName !== 'CANVAS') {
                return; // Ignore clicks on UI elements
            }

            // Check if the analysis mode is still active
            if (analysisMode !== 'viewshed') return;

            const intersection = cameraManager.getIntersection(event);
            if (intersection) {
                // Don't place if clicking on existing marker
                if (intersection.object.userData.isViewshedMarker) return;

                placePoint(intersection.point);
            }
        };

        window.addEventListener('click', handleClick);

        return () => {
            window.removeEventListener('click', handleClick);
        };
    }, [analysisMode, cameraManager, scene, placePoint]);

    // Clear everything including all saved layers
    const clear = useCallback(() => {
        if (!tileGroup) return;

        // Invalidate any running analysis
        runIdRef.current++;

        // Remove tool group entirely via controller (disposes contents)
        globalAnalysisController.ensureAttached(tileGroup);
        globalAnalysisController.removeToolGroup('Viewshed', true);

        // Clear from persistent manager
        analysisManager.clearAllViewshedLayers();

        // Reset state
        setLayers([]);
        setPoint(null);
        setMesh(null);
        setActiveLayerId(null);
        setProgress(0);
        setViewshedGroup(null);

    }, [tileGroup]);

    // Toggle layer visibility
    const toggleLayerVisibility = useCallback((layerId: string) => {
        setLayers(prev => prev.map(layer => {
            if (layer.id === layerId) {
                layer.mesh.visible = !layer.visible;
                return { ...layer, visible: !layer.visible };
            }
            return layer;
        }));
    }, []);

    // Delete layer
    const deleteLayer = useCallback((layerId: string) => {
        const layer = analysisManager.getViewshedLayers().find(l => l.id === layerId);
        if (layer) {
            // Remove from group and dispose
            if (viewshedGroup) {
                viewshedGroup.remove(layer.mesh);
                // Also remove marker
                viewshedGroup.remove(layer.point.marker);
            }
            
            // Dispose geometry and material
            if (layer.mesh.geometry) {
                layer.mesh.geometry.dispose();
            }
            if (layer.mesh.material) {
                const mat = layer.mesh.material as THREE.Material | THREE.Material[];
                if (Array.isArray(mat)) {
                    mat.forEach(m => m.dispose());
                } else {
                    mat.dispose();
                }
            }
            
            // Return marker to pool
            if (tileGroup) {
                globalAnalysisPool.returnMarker(layer.point.marker, tileGroup);
            }
            
            // Clear references
            layer.mesh.parent = null;
            layer.point.marker.parent = null;
            
            // Remove from persistent manager
            analysisManager.removeViewshedLayer(layerId);
            // Update local state
            setLayers(analysisManager.getViewshedLayers());
        }
        if (layerId === activeLayerId) {
            setActiveLayerId(null);
            analysisManager.setActiveViewshedLayerId(null);
        }
    }, [tileGroup, activeLayerId, viewshedGroup]);

    // Load layer parameters (for editing and re-running)
    const loadLayerParameters = useCallback((layerId: string) => {
        const layer = layers.find(l => l.id === layerId);
        if (layer) {
            setRange(layer.range);
            setResolution(layer.resolution);
            setHeightOffset(layer.heightOffset);
            setVerticalResolution(layer.verticalResolution);
            // Restore visibility stats
            setGroundVisibility(layer.groundVisibility);
            setSkyVisibility(layer.skyVisibility);
            setVisibilityPercentage(Math.round((layer.groundVisibility + layer.skyVisibility) / 2));
            // Don't set point - this would trigger a new analysis
            // Just set as active for editing
            setActiveLayerId(layerId);
            analysisManager.setActiveViewshedLayerId(layerId);
        }
    }, [layers]);

    // Rename layer
    const renameLayer = useCallback((layerId: string, newName: string) => {
        setLayers(prev => prev.map(layer => 
            layer.id === layerId ? { ...layer, name: newName } : layer
        ));
    }, []);

    // Rerun analysis for existing layer
    const rerunLayer = useCallback(async (layerId: string) => {
        const layer = layers.find(l => l.id === layerId);
        if (!layer) return;

        // Remove old mesh visuals
        if (viewshedGroup) {
            viewshedGroup.remove(layer.mesh);
            layer.mesh.traverse((child) => {
                if (child instanceof THREE.Line) {
                    child.geometry.dispose();
                    (child.material as THREE.Material).dispose();
                }
            });
            // Dispose the mesh itself
            layer.mesh.geometry.dispose();
            if (Array.isArray(layer.mesh.material)) {
                layer.mesh.material.forEach(m => m.dispose());
            } else {
                layer.mesh.material.dispose();
            }
        }

        // Keep the layer in the list but mark it for update
        // Use current settings (already set in state), restore the point and marker
        setPoint(layer.point);
        setMesh(null);
        
        // DON'T remove from layers - we'll update it in place
        // Mark the layer as being updated by setting activeLayerId
        setActiveLayerId(layerId);
        
        // Trigger re-analysis with current settings
        // The analyzeViewshed will create a new mesh and update the existing layer
        await analyzeViewshed();
    }, [layers, viewshedGroup, analyzeViewshed]);

    // Export viewshed as image
    const exportAsImage = useCallback((layerId?: string) => {
        if (!tileGroup) {
            console.warn('TileGroup not available');
            return;
        }
        
        const layer = layerId ? layers.find(l => l.id === layerId) : (mesh && point ? { mesh, point, range, bbox: {
            minX: point.position.x - range,
            minZ: point.position.z - range,
            maxX: point.position.x + range,
            maxZ: point.position.z + range
        }} : null);
        
        if (!layer) {
            console.warn('No viewshed to export');
            return;
        }

        // Create a canvas to render the viewshed
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 2048;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Transparent background
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Get mesh geometry data
        const geometry = layer.mesh.geometry;
        const positions = geometry.attributes.position.array;
        const colors = geometry.attributes.color.array;
        const indices = geometry.index?.array || [];

        // Draw triangles
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const layerRange = 'range' in layer ? layer.range : range;
        const scale = Math.min(canvas.width, canvas.height) / (layerRange * 2.2);

        for (let i = 0; i < indices.length; i += 3) {
            const i1 = indices[i] * 3;
            const i2 = indices[i + 1] * 3;
            const i3 = indices[i + 2] * 3;

            ctx.beginPath();
            ctx.moveTo(centerX + positions[i1] * scale, centerY + positions[i1 + 2] * scale);
            ctx.lineTo(centerX + positions[i2] * scale, centerY + positions[i2 + 2] * scale);
            ctx.lineTo(centerX + positions[i3] * scale, centerY + positions[i3 + 2] * scale);
            ctx.closePath();

            // Use average color of triangle vertices
            const r = Math.floor((colors[i1] + colors[i2] + colors[i3]) / 3 * 255);
            const g = Math.floor((colors[i1 + 1] + colors[i2 + 1] + colors[i3 + 1]) / 3 * 255);
            const b = Math.floor((colors[i1 + 2] + colors[i2 + 2] + colors[i3 + 2]) / 3 * 255);
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fill();
        }

        // Add GPS EXIF metadata and download
        canvas.toBlob((blob) => {
            if (!blob) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const dataUrl = e.target?.result as string;
                    
                    // Convert local position to world position (add tileGroup offset)
                    const localX = layer.point.position.x;
                    const localZ = layer.point.position.z;
                    const y = layer.point.position.y;
                    
                    // Convert to world mercator coordinates (same as 3D.tsx)
                    const worldX = localX + tileGroup.position.x;
                    const worldZ = localZ - tileGroup.position.z; // Note the minus sign
                    
                    // Convert to lat/lon and fix sign for EXIF GPS
                    const coords = mercatorToLatLon(worldX, worldZ);
                    const lat = -coords.lat; // Multiply by -1 for correct EXIF position
                    const lon = -coords.lon; // Multiply by -1 for correct EXIF position
                    const altitude = y; // meters
                    
                    // Convert to DMS (Degrees, Minutes, Seconds) format for EXIF
                    const toDegreesMinutesSeconds = (decimal: number) => {
                        const absolute = Math.abs(decimal);
                        const degrees = Math.floor(absolute);
                        const minutesNotTruncated = (absolute - degrees) * 60;
                        const minutes = Math.floor(minutesNotTruncated);
                        const seconds = (minutesNotTruncated - minutes) * 60;
                        return [[degrees, 1], [minutes, 1], [Math.round(seconds * 100), 100]];
                    };
                    
                    // Create EXIF GPS data
                    const zeroth: any = {};
                    const exif: any = {};
                    const gps: any = {};
                    
                    gps[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S';
                    gps[piexif.GPSIFD.GPSLatitude] = toDegreesMinutesSeconds(lat);
                    gps[piexif.GPSIFD.GPSLongitudeRef] = lon >= 0 ? 'E' : 'W';
                    gps[piexif.GPSIFD.GPSLongitude] = toDegreesMinutesSeconds(lon);
                    gps[piexif.GPSIFD.GPSAltitude] = [Math.round(altitude * 100), 100];
                    gps[piexif.GPSIFD.GPSAltitudeRef] = altitude >= 0 ? 0 : 1;
                    
                    // Add metadata
                    const layerRange = 'range' in layer ? layer.range : range;
                    const layerHeightOffset = 'heightOffset' in layer ? layer.heightOffset : heightOffset;
                    
                    zeroth[piexif.ImageIFD.Make] = 'NeoMaps 3D Viewshed Analysis';
                    zeroth[piexif.ImageIFD.Software] = 'NeoMaps';
                    exif[piexif.ExifIFD.UserComment] = `Viewshed Analysis - Range:${layerRange}m Height:${layerHeightOffset}m`;
                    
                    const exifObj = { '0th': zeroth, 'Exif': exif, 'GPS': gps };
                    const exifBytes = piexif.dump(exifObj);
                    const newDataUrl = piexif.insert(exifBytes, dataUrl);
                    
                    // Download with bbox in filename
                    const bbox = layer.bbox;
                    const bboxStr = `bbox_${bbox.minX.toFixed(0)}_${bbox.minZ.toFixed(0)}_${bbox.maxX.toFixed(0)}_${bbox.maxZ.toFixed(0)}`;
                    const a = document.createElement('a');
                    a.href = newDataUrl;
                    a.download = `viewshed_${bboxStr}_${Date.now()}.jpg`;
                    a.click();
                    
                } catch (error) {
                    console.error('Error adding EXIF data:', error);
                    // Fallback to regular download
                    const bbox = layer.bbox;
                    const bboxStr = `bbox_${bbox.minX.toFixed(0)}_${bbox.minZ.toFixed(0)}_${bbox.maxX.toFixed(0)}_${bbox.maxZ.toFixed(0)}`;
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `viewshed_${bboxStr}_${Date.now()}.png`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
            };
            reader.readAsDataURL(blob);
        }, 'image/jpeg'); // Use JPEG for EXIF support

    }, [layers, mesh, point, range, heightOffset, tileGroup]);

    // Export viewshed as GeoJSON layer
    const exportAsLayer = useCallback((layerId?: string) => {
        if (!tileGroup) {
            console.warn('TileGroup not available');
            return;
        }
        
        const layer = layerId ? layers.find(l => l.id === layerId) : (mesh && point ? { 
            mesh, 
            point, 
            range, 
            resolution,
            heightOffset,
            verticalResolution,
            bbox: {
                minX: point.position.x - range,
                minZ: point.position.z - range,
                maxX: point.position.x + range,
                maxZ: point.position.z + range
            }
        } : null);
        
        if (!layer) {
            console.warn('No viewshed to export');
            return;
        }

        const geometry = layer.mesh.geometry;
        const positions = geometry.attributes.position.array;
        const colors = geometry.attributes.color.array;
        const indices = geometry.index?.array || [];
        const layerRange = 'range' in layer ? layer.range : range;
        const layerResolution = 'resolution' in layer ? layer.resolution : resolution;
        const layerHeightOffset = 'heightOffset' in layer ? layer.heightOffset : heightOffset;
        const layerVerticalResolution = 'verticalResolution' in layer ? layer.verticalResolution : verticalResolution;

        // Helper to convert local 3D position to lat/lon with sign fix
        const toLatLon = (localX: number, localZ: number) => {
            const worldX = localX + tileGroup.position.x;
            const worldZ = localZ - tileGroup.position.z;
            const { lat, lon } = mercatorToLatLon(worldX, worldZ);
            // Multiply by -1 to fix inverted coordinates for GeoJSON
            return [-lon, -lat]; // GeoJSON uses [lon, lat] order
        };

        // Create clear, simplified GeoJSON export
        const features: any[] = [];
        
        // Create sectors with actual mesh colors - use fewer sectors for clarity
        const numSectors = 72; // One sector per 5 degrees
        
        
        for (let i = 0; i < numSectors; i++) {
            const angle1 = (i / numSectors) * Math.PI * 2;
            const angle2 = ((i + 1) / numSectors) * Math.PI * 2;
            const midAngle = (angle1 + angle2) / 2;
            
            // Sample color at this angle from the mesh (at 70% of range)
            const sampleDist = layerRange * 0.7;
            const sampleX = sampleDist * Math.cos(midAngle);
            const sampleZ = sampleDist * Math.sin(midAngle);
            
            // Find closest vertex
            let closestIdx = 0;
            let minDist = Infinity;
            for (let v = 0; v < positions.length; v += 3) {
                const dx = positions[v] - sampleX;
                const dz = positions[v + 2] - sampleZ;
                const dist = dx * dx + dz * dz;
                if (dist < minDist) {
                    minDist = dist;
                    closestIdx = v;
                }
            }
            
            // Get color at this vertex
            const r = colors[closestIdx];
            const g = colors[closestIdx + 1];
            const b = colors[closestIdx + 2];
            
            // Simplified color scheme: Green=visible, Red=blocked, darkness=sky obstruction
            let category = 'blocked';
            let fillColor = '#FF0000';
            let fillOpacity = 0.6;
            
            if (g > 0) {
                // Green channel = ground visible
                const intensity = Math.round(g * 255);
                fillColor = `#00${intensity.toString(16).padStart(2, '0')}00`;
                
                if (g > 0.8) {
                    category = 'visible_clear_sky';
                } else if (g > 0.5) {
                    category = 'visible_partial_sky';
                } else {
                    category = 'visible_obstructed_sky';
                }
            } else {
                // Red channel = ground blocked
                const intensity = Math.round(r * 255);
                fillColor = `#${intensity.toString(16).padStart(2, '0')}0000`;
                
                if (r > 0.8) {
                    category = 'blocked_clear_sky';
                } else if (r > 0.5) {
                    category = 'blocked_partial_sky';
                } else {
                    category = 'blocked_obstructed_sky';
                }
            }
            
            // Create sector polygon
            const centerPos = toLatLon(layer.point.position.x, layer.point.position.z);
            const p1 = toLatLon(
                layer.point.position.x + layerRange * Math.cos(angle1),
                layer.point.position.z + layerRange * Math.sin(angle1)
            );
            const p2 = toLatLon(
                layer.point.position.x + layerRange * Math.cos(angle2),
                layer.point.position.z + layerRange * Math.sin(angle2)
            );
            
            features.push({
                type: 'Feature',
                properties: {
                    category,
                    fill: fillColor,
                    'fill-opacity': fillOpacity,
                    stroke: fillColor,
                    'stroke-width': 1,
                    'stroke-opacity': 0.8,
                    azimuth: Math.round(midAngle * 180 / Math.PI),
                    heightOffset: layerHeightOffset,
                    range: layerRange
                },
                geometry: {
                    type: 'Polygon',
                    coordinates: [[centerPos, p1, p2, centerPos]]
                }
            });
        }

        // Convert viewpoint to lat/lon for metadata (local to world first)
        const worldX = layer.point.position.x + tileGroup.position.x;
        const worldZ = layer.point.position.z - tileGroup.position.z;
        const { lat: viewpointLat, lon: viewpointLon } = mercatorToLatLon(worldX, worldZ);
        
        const geoJSON = {
            type: 'FeatureCollection',
            features,
            metadata: {
                viewpoint: {
                    latitude: viewpointLat,
                    longitude: viewpointLon,
                    altitude: layer.point.position.y,
                    x: layer.point.position.x,
                    y: layer.point.position.y,
                    z: layer.point.position.z
                },
                bbox: layer.bbox,
                range: layerRange,
                resolution: layerResolution,
                heightOffset: layerHeightOffset,
                verticalResolution: layerVerticalResolution,
                timestamp: new Date().toISOString()
            }
        };

        // Download GeoJSON with bbox in filename
        const bbox = layer.bbox;
        const bboxStr = `bbox_${bbox.minX.toFixed(0)}_${bbox.minZ.toFixed(0)}_${bbox.maxX.toFixed(0)}_${bbox.maxZ.toFixed(0)}`;
        const blob = new Blob([JSON.stringify(geoJSON, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `viewshed_layer_${bboxStr}_${Date.now()}.geojson`;
        a.click();
        URL.revokeObjectURL(url);

    }, [layers, mesh, point, range, resolution, heightOffset, verticalResolution, tileGroup]);

    // Show/hide layers when entering/exiting viewshed mode (DON'T clear on mode change)
    useEffect(() => {
        if (!viewshedGroup) return;
        const makeVisible = analysisMode === 'viewshed';
        viewshedGroup.visible = makeVisible;
    }, [analysisMode, viewshedGroup]);

    // Cleanup only when switching to 2D (map view mode changes)
    // Layers should persist when closing panel or switching between analysis tools
    useEffect(() => {
        // Listen for cleanup event when switching to 2D
        const handleCleanup = () => {
            if (viewshedGroup && tileGroup) {
                // Clean up all layers
                layers.forEach(layer => {
                    viewshedGroup.remove(layer.mesh);
                    layer.mesh.geometry.dispose();
                    (layer.mesh.material as THREE.Material).dispose();
                    globalAnalysisPool.returnMarker(layer.point.marker, tileGroup);
                });
                
                // Clean up current viewshed
                if (point) {
                    globalAnalysisPool.returnMarker(point.marker, tileGroup);
                }
                if (mesh) {
                    viewshedGroup.remove(mesh);
                    mesh.geometry.dispose();
                    (mesh.material as THREE.Material).dispose();
                }
                
                // Clear state
                setLayers([]);
                setPoint(null);
                setMesh(null);
            }
        };

        window.addEventListener('cleanup-3d-analysis', handleCleanup);
        
        return () => {
            window.removeEventListener('cleanup-3d-analysis', handleCleanup);
        };
    }, [viewshedGroup, tileGroup, layers, point, mesh]);

    return {
        point,
        range,
        setRange,
        resolution,
        setResolution,
        heightOffset,
        setHeightOffset,
        verticalResolution,
        setVerticalResolution,
        isAnalyzing,
        progress,
        visibilityPercentage,
        groundVisibility,
        skyVisibility,
        placePoint,
        clear,
        exportAsImage,
        exportAsLayer,
        // Layer management
        layers,
        activeLayerId,
        setActiveLayerId,
        toggleLayerVisibility,
        deleteLayer,
        loadLayerParameters,
        renameLayer,
        rerunLayer,
    };
};
