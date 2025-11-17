import { useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useMap3DRequired } from '../../context/Map3DContext';
import { globalAnalysisPool, globalAnalysisRaycaster, globalAnalysisController } from '../shared';

export interface LineOfSightPoint {
    id: string;
    position: THREE.Vector3; // Base position in LOCAL coordinates (relative to tileGroup)
    offsetPosition: THREE.Vector3; // Position with offset applied in LOCAL coordinates
    marker: THREE.Mesh;
    // Individual point offsets
    pointOffset?: {
        x: number;
        y: number;
        z: number;
    };
    // Analysis results for this specific point
    analysisResult?: {
        isBlocked: boolean;
        distance: number;
        visibleDistance: number;
        hitPoint: THREE.Vector3 | null;
    };
}

export interface BeamVisualization {
    clearPlane: THREE.Mesh;
    clearEdges: THREE.LineSegments;
    blockedPlane?: THREE.Mesh;
    blockedEdges?: THREE.LineSegments;
    hitSphere?: THREE.Mesh;
    isBlocked: boolean | null;
}

export const useLineOfSight = () => {
    const { scene, camera, cameraManager, analysisMode, tileGroup } = useMap3DRequired();
    const [startPoint, setStartPoint] = useState<LineOfSightPoint | null>(null);
    const [endPoints, setEndPoints] = useState<LineOfSightPoint[]>([]);
    const [beams, setBeams] = useState<Map<string, BeamVisualization>>(new Map());
    const [offset, setOffset] = useState<number>(1.0); // Offset amount in meters
    const [losGroup, setLosGroup] = useState<THREE.Group | null>(null); // Managed by AnalysisController
    const [detectionThreshold, setDetectionThreshold] = useState<number>(2.0); // Min distance to detect obstacles
    const [startOffset, setStartOffset] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
    const lastDetectionThresholdRef = useRef<number>(detectionThreshold);

    // Initialize raycaster
    useEffect(() => {
        if (camera) globalAnalysisRaycaster.setCamera(camera);
        if (scene) globalAnalysisRaycaster.setScene(scene);
    }, [camera, scene]);

    // Attach AnalysisController group
    useEffect(() => {
        if (tileGroup && !losGroup) {
            globalAnalysisController.ensureAttached(tileGroup);
            const g = globalAnalysisController.getToolGroup('LineOfSight');
            setLosGroup(g);
        }
    }, [tileGroup, losGroup]);

    // Cleanup on unmount - but don't clear persistent data (MapInteractionManager handles that)
    useEffect(() => {
        return () => {
            // Just remove the group from scene, don't clear persistent data
            // MapInteractionManager clears persistent data on 2D switch
            if (tileGroup) {
                globalAnalysisController.ensureAttached(tileGroup);
                globalAnalysisController.removeToolGroup('LineOfSight', true);
            }
        };
    }, [tileGroup]);

    // Place start or end point
    const placePoint = useCallback((position: THREE.Vector3) => {
        if (!tileGroup) return;

        // Ensure group exists before placing points
        let currentGroup = losGroup;
        if (!currentGroup) {
            globalAnalysisController.ensureAttached(tileGroup);
            currentGroup = globalAnalysisController.getToolGroup('LineOfSight');
            setLosGroup(currentGroup);
        }

        // Calculate offset for marker position
        const calculateOffsetPosition = (basePos: THREE.Vector3): THREE.Vector3 => {
            const upVector = new THREE.Vector3(0, 1, 0);
            const offsetPos = basePos.clone();
            offsetPos.addScaledVector(upVector, offset * 0.7); // 70% upward
            return offsetPos;
        };

        if (!startPoint) {
            // First click: Place start point (bright blue)
            const id = `los-start-${Date.now()}`;
            const marker = globalAnalysisPool.getMarker({ color: 0x00bfff, radius: 12 }); // Deep Sky Blue
            marker.userData.isLineOfSightMarker = true;

            // Convert world position to local coordinates
            const localBasePosition = tileGroup.worldToLocal(position.clone());
            
            // Apply offset to marker position in local space
            const offsetPosition = calculateOffsetPosition(localBasePosition);
            marker.position.copy(offsetPosition);

            currentGroup.add(marker);

    
            setStartPoint({
                id,
                position: localBasePosition, // Store base position in LOCAL coordinates
                offsetPosition: offsetPosition, // Store offset position in LOCAL coordinates
                marker,
            });
        } else {
            // Subsequent clicks: Add end points (darker blue)
            const id = `los-end-${Date.now()}`;
            const marker = globalAnalysisPool.getMarker({ color: 0x1e90ff, radius: 8 }); // Dodger Blue
            marker.userData.isLineOfSightMarker = true;

            // Convert world position to local coordinates
            const localBasePosition = tileGroup.worldToLocal(position.clone());
            
            // Apply offset to marker position in local space
            const offsetPosition = calculateOffsetPosition(localBasePosition);
            marker.position.copy(offsetPosition);

            currentGroup.add(marker);

            const newEndPoint: LineOfSightPoint = {
                id,
                position: localBasePosition, // Store base position in LOCAL coordinates
                offsetPosition: offsetPosition, // Store offset position in LOCAL coordinates
                marker,
            };

            setEndPoints(prev => [...prev, newEndPoint]);
        }
    }, [startPoint, endPoints, tileGroup, losGroup, offset]);

    // Update marker positions when offset changes
    useEffect(() => {
        if (!tileGroup) return;

        const upVector = new THREE.Vector3(0, 1, 0);
        
        // Update start marker if exists
        if (startPoint) {
            // Position is already in local coordinates, just apply offset
            const newStartOffset = startPoint.position.clone().addScaledVector(upVector, offset * 0.7);
            startPoint.marker.position.copy(newStartOffset);
            startPoint.offsetPosition.copy(newStartOffset);
        }
        
        // Update all end markers
        endPoints.forEach(endPoint => {
            // Position is already in local coordinates, just apply offset
            const newEndOffset = endPoint.position.clone().addScaledVector(upVector, offset * 0.7);
            endPoint.marker.position.copy(newEndOffset);
            endPoint.offsetPosition.copy(newEndOffset);
        });
        
    }, [offset, startPoint, endPoints, tileGroup, losGroup]);

    // Analyze and visualize all beams
    useEffect(() => {
        if (!startPoint || endPoints.length === 0 || !tileGroup) {
            return;
        }
        
        // Ensure group exists
        let currentGroup = losGroup;
        if (!currentGroup) {
            globalAnalysisController.ensureAttached(tileGroup);
            currentGroup = globalAnalysisController.getToolGroup('LineOfSight');
            setLosGroup(currentGroup);
        }
        
        if (!currentGroup) {
            // Clean up all beams - use functional update to get current beams state
            setBeams(currentBeams => {
                currentBeams.forEach(beam => {
                    if (losGroup) {
                        losGroup.remove(beam.clearPlane);
                        losGroup.remove(beam.clearEdges);
                    }
                    beam.clearPlane.geometry.dispose();
                    (beam.clearPlane.material as THREE.Material).dispose();
                    beam.clearEdges.geometry.dispose();
                    (beam.clearEdges.material as THREE.Material).dispose();
                    
                    if (beam.blockedPlane) {
                        if (losGroup) losGroup.remove(beam.blockedPlane);
                        beam.blockedPlane.geometry.dispose();
                        (beam.blockedPlane.material as THREE.Material).dispose();
                    }
                    if (beam.blockedEdges) {
                        if (losGroup) losGroup.remove(beam.blockedEdges);
                        beam.blockedEdges.geometry.dispose();
                        (beam.blockedEdges.material as THREE.Material).dispose();
                    }
                    if (beam.hitSphere) {
                        if (losGroup) losGroup.remove(beam.hitSphere);
                        beam.hitSphere.geometry.dispose();
                        (beam.hitSphere.material as THREE.Material).dispose();
                    }
                });
                return new Map();
            });
            return;
        }

        // Remove old beams that no longer have endpoints
        const currentEndpointIds = new Set(endPoints.map(ep => ep.id));
        const thresholdChanged = lastDetectionThresholdRef.current !== detectionThreshold;
        // Use functional update to work with current beams state
        setBeams(currentBeams => {
            // If detection threshold changed, dispose all existing beams to force rebuild
            if (thresholdChanged) {
                currentBeams.forEach(beam => {
                    if (losGroup) {
                        losGroup.remove(beam.clearPlane);
                        losGroup.remove(beam.clearEdges);
                        if (beam.blockedPlane) losGroup.remove(beam.blockedPlane);
                        if (beam.blockedEdges) losGroup.remove(beam.blockedEdges);
                        if (beam.hitSphere) losGroup.remove(beam.hitSphere);
                    }
                    beam.clearPlane.geometry.dispose();
                    (beam.clearPlane.material as THREE.Material).dispose();
                    beam.clearEdges.geometry.dispose();
                    (beam.clearEdges.material as THREE.Material).dispose();
                    if (beam.blockedPlane) {
                        beam.blockedPlane.geometry.dispose();
                        (beam.blockedPlane.material as THREE.Material).dispose();
                    }
                    if (beam.blockedEdges) {
                        beam.blockedEdges.geometry.dispose();
                        (beam.blockedEdges.material as THREE.Material).dispose();
                    }
                    if (beam.hitSphere) {
                        beam.hitSphere.geometry.dispose();
                        (beam.hitSphere.material as THREE.Material).dispose();
                    }
                });
            } else {
                // Check if we need to do anything - if all endpoints already have beams, skip
                const allBeamsExist = endPoints.every(ep => currentBeams.has(ep.id));
                if (allBeamsExist && currentBeams.size === endPoints.length) {
                    return currentBeams; // No changes needed
                }
            }
            
            const newBeamsMap = new Map<string, BeamVisualization>();
            
            currentBeams.forEach((beam, endpointId) => {
                if (!currentEndpointIds.has(endpointId)) {
                    // Clean up removed beam
                    if (losGroup) {
                        losGroup.remove(beam.clearPlane);
                        losGroup.remove(beam.clearEdges);
                    }
                    beam.clearPlane.geometry.dispose();
                    (beam.clearPlane.material as THREE.Material).dispose();
                    beam.clearEdges.geometry.dispose();
                    (beam.clearEdges.material as THREE.Material).dispose();
                    
                    if (beam.blockedPlane) {
                        if (losGroup) losGroup.remove(beam.blockedPlane);
                        beam.blockedPlane.geometry.dispose();
                        (beam.blockedPlane.material as THREE.Material).dispose();
                    }
                    if (beam.blockedEdges) {
                        if (losGroup) losGroup.remove(beam.blockedEdges);
                        beam.blockedEdges.geometry.dispose();
                        (beam.blockedEdges.material as THREE.Material).dispose();
                    }
                    if (beam.hitSphere) {
                        if (losGroup) losGroup.remove(beam.hitSphere);
                        beam.hitSphere.geometry.dispose();
                        (beam.hitSphere.material as THREE.Material).dispose();
                    }
                } else {
                    newBeamsMap.set(endpointId, beam);
                }
            });

            // Create or update beam for each endpoint
            const boxWidth = 0.5;
            const boxDepth = 0.5;
            
            // Collect analysis results to update all at once at the end
            const analysisResults = new Map<string, {
                isBlocked: boolean;
                distance: number;
                visibleDistance: number;
                hitPoint: THREE.Vector3 | null;
            }>();
            
            endPoints.forEach(endPoint => {
                // Skip if beam already exists (colors already handled above)
                if (newBeamsMap.has(endPoint.id)) {
                    return;
                }

                // Convert local coordinates to world coordinates for raycasting
                const startPos = tileGroup.localToWorld(startPoint.offsetPosition.clone());
                const endPos = tileGroup.localToWorld(endPoint.offsetPosition.clone());
                const segment = new THREE.Vector3().subVectors(endPos, startPos);
                const totalDistance = segment.length();
                const dir = segment.clone().normalize();

                const NEAR_START_EPS = Math.max(0.1, detectionThreshold);
                const NEAR_END_EPS = 0.5;
                const SAMPLE_RADIUS = 0.5; // meters, beam thickness

                // Build orthonormal basis for sampling offsets
                const up = new THREE.Vector3(0, 1, 0);
                let side = new THREE.Vector3().crossVectors(dir, up);
                if (side.lengthSq() < 1e-6) {
                    // If ray is vertical, pick a different side
                    side = new THREE.Vector3(1, 0, 0);
                } else {
                    side.normalize();
                }
                const upSide = new THREE.Vector3().crossVectors(side, dir).normalize();

                const sampleOffsets = [
                    new THREE.Vector3(0, 0, 0),
                    side.clone().multiplyScalar(SAMPLE_RADIUS),
                    side.clone().multiplyScalar(-SAMPLE_RADIUS),
                    upSide.clone().multiplyScalar(SAMPLE_RADIUS * 0.5),
                    upSide.clone().multiplyScalar(-SAMPLE_RADIUS * 0.5),
                ];

                const castFrom = (
                    origin: THREE.Vector3,
                    direction: THREE.Vector3,
                    maxDist: number
                ) => {
                    let bestHitDist = Infinity;
                    let bestPoint: THREE.Vector3 | null = null;
                    for (const off of sampleOffsets) {
                        const o = origin.clone().add(off);
                        const r = globalAnalysisRaycaster.castRay(o, direction, {
                            maxDistance: maxDist,
                            excludeUserData: ['isLineOfSightMarker', 'isLineOfSightPlane', 'isLineOfSightHitSphere'],
                        });
                        if (r.hit && r.distance < bestHitDist) {
                            bestHitDist = r.distance;
                            bestPoint = r.point ?? null;
                        }
                    }
                    return { hit: bestHitDist !== Infinity, distance: bestHitDist, point: bestPoint } as {
                        hit: boolean; distance: number; point: THREE.Vector3 | null;
                    };
                };

                // Forward pass (start -> end) with start epsilon and end epsilon
                const forward = castFrom(startPos.clone().add(dir.clone().multiplyScalar(NEAR_START_EPS)), dir, Math.max(0, totalDistance - NEAR_START_EPS - NEAR_END_EPS));
                // Reverse pass (end -> start) with swapped epsilons
                const reverseDir = dir.clone().multiplyScalar(-1);
                const reverse = castFrom(endPos.clone().add(reverseDir.clone().multiplyScalar(NEAR_END_EPS)), reverseDir, Math.max(0, totalDistance - NEAR_START_EPS - NEAR_END_EPS));

                // Choose the closer obstruction if any
                let blocked = false;
                let blockPoint: THREE.Vector3 | null = null;
                let visibleDistance = totalDistance;

                if (forward.hit || reverse.hit) {
                    blocked = true;
                    const fDist = forward.hit ? forward.distance + NEAR_START_EPS : Infinity;
                    const rDistFromStart = reverse.hit ? (totalDistance - (reverse.distance + NEAR_END_EPS)) : Infinity;
                    if (fDist <= rDistFromStart) {
                        visibleDistance = fDist;
                        blockPoint = forward.point;
                    } else {
                        visibleDistance = rDistFromStart;
                        blockPoint = reverse.point;
                    }
                }

                // Store analysis result to be applied later
                const analysisResult = {
                    isBlocked: blocked,
                    distance: totalDistance,
                    visibleDistance: visibleDistance,
                    hitPoint: blockPoint
                };
                analysisResults.set(endPoint.id, analysisResult);
                
                
                // Quaternion for rotation
                const quaternion = new THREE.Quaternion();
                quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                
                if (blocked && blockPoint) {
                    // Convert blockPoint from world to local coordinates
                    const localBlockPoint = tileGroup.worldToLocal(blockPoint.clone());
                    
                    // BLOCKED: Create TWO boxes - clear section + semi-transparent section
                    const hitDistance = startPoint.offsetPosition.distanceTo(localBlockPoint);
                    const remainingDistance = totalDistance - hitDistance;
                    
                    // === CLEAR SECTION (start to hit point) ===
                    const clearGeometry = new THREE.BoxGeometry(boxWidth, hitDistance, boxDepth);
                    const clearMaterial = new THREE.MeshBasicMaterial({
                        color: 0x00ff00,
                        transparent: true,
                        opacity: 0.5,
                        depthWrite: false,
                        depthTest: true,
                    });
                    const clearBox = new THREE.Mesh(clearGeometry, clearMaterial);
                    clearBox.userData.isLineOfSightPlane = true;
                    clearBox.renderOrder = 997;
                    
                    const clearEdgesGeometry = new THREE.EdgesGeometry(clearGeometry);
                    const clearEdgesMaterial = new THREE.LineBasicMaterial({
                        color: 0x00ff00,
                        linewidth: 2,
                        transparent: true,
                        opacity: 0.9,
                        depthTest: true,
                    });
                    const clearEdgesLine = new THREE.LineSegments(clearEdgesGeometry, clearEdgesMaterial);
                    clearEdgesLine.userData.isLineOfSightPlane = true;
                    clearEdgesLine.renderOrder = 998;
                    
                    // Position clear box in local coordinates
                    const clearMidpoint = new THREE.Vector3()
                        .addVectors(startPoint.offsetPosition, localBlockPoint)
                        .multiplyScalar(0.5);
                    clearBox.position.copy(clearMidpoint);
                    clearEdgesLine.position.copy(clearMidpoint);
                    clearBox.setRotationFromQuaternion(quaternion);
                    clearEdgesLine.setRotationFromQuaternion(quaternion);
                    
                    // === BLOCKED SECTION (hit point to end) ===
                    const blockedGeometry = new THREE.BoxGeometry(boxWidth, remainingDistance, boxDepth);
                    const blockedMaterial = new THREE.MeshBasicMaterial({
                        color: 0xff0000,
                        transparent: true,
                        opacity: 0.2,
                        depthWrite: false,
                        depthTest: true,
                    });
                    const blockedBox = new THREE.Mesh(blockedGeometry, blockedMaterial);
                    blockedBox.userData.isLineOfSightPlane = true;
                    blockedBox.renderOrder = 996;
                    
                    const blockedEdgesGeometry = new THREE.EdgesGeometry(blockedGeometry);
                    const blockedEdgesMaterial = new THREE.LineBasicMaterial({
                        color: 0xff0000,
                        linewidth: 1,
                        transparent: true,
                        opacity: 0.4,
                        depthTest: true,
                    });
                    const blockedEdgesLine = new THREE.LineSegments(blockedEdgesGeometry, blockedEdgesMaterial);
                    blockedEdgesLine.userData.isLineOfSightPlane = true;
                    blockedEdgesLine.renderOrder = 996;
                    
                    // Position blocked box in local coordinates
                    const blockedMidpoint = new THREE.Vector3()
                        .addVectors(localBlockPoint, endPoint.offsetPosition)
                        .multiplyScalar(0.5);
                    blockedBox.position.copy(blockedMidpoint);
                    blockedEdgesLine.position.copy(blockedMidpoint);
                    blockedBox.setRotationFromQuaternion(quaternion);
                    blockedEdgesLine.setRotationFromQuaternion(quaternion);
                    
                    // === HIT SPHERE at impact point ===
                    const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
                    const sphereMaterial = new THREE.MeshBasicMaterial({
                        color: 0xffaa00,
                        transparent: true,
                        opacity: 0.6,
                        depthWrite: false,
                        depthTest: true,
                    });
                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                    sphere.userData.isLineOfSightHitSphere = true;
                    sphere.renderOrder = 999;
                    
                    const hitPosWithOffset = blockPoint.clone(); // No additional offset needed
                    const localHitPos = tileGroup.worldToLocal(hitPosWithOffset);
                    sphere.position.copy(localHitPos);
                    
                    // Add all to currentGroup
                    currentGroup.add(clearBox);
                    currentGroup.add(clearEdgesLine);
                    currentGroup.add(blockedBox);
                    currentGroup.add(blockedEdgesLine);
                    currentGroup.add(sphere);
                    
                    // Store beam visualization (color will be set when storing result)
                    newBeamsMap.set(endPoint.id, {
                        clearPlane: clearBox,
                        clearEdges: clearEdgesLine,
                        blockedPlane: blockedBox,
                        blockedEdges: blockedEdgesLine,
                        hitSphere: sphere,
                        isBlocked: true,
                    });
                
                } else {
                    // CLEAR: Single full-length box
                    const boxGeometry = new THREE.BoxGeometry(boxWidth, totalDistance, boxDepth);
                    
                    const color = 0x00ff00; // Green - clear
                    const edgeColor = 0x00ff00;
                    const opacity = 0.5;
                    
                    const boxMaterial = new THREE.MeshBasicMaterial({
                        color,
                        transparent: true,
                        opacity,
                        depthWrite: false,
                        depthTest: true,
                    });
                    const box = new THREE.Mesh(boxGeometry, boxMaterial);
                    box.userData.isLineOfSightPlane = true;
                    box.renderOrder = 997;
                    
                    const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
                    const edgesMaterial = new THREE.LineBasicMaterial({
                        color: edgeColor,
                        linewidth: 2,
                        transparent: true,
                        opacity: 0.9,
                        depthTest: true,
                    });
                    const edgesLine = new THREE.LineSegments(edgesGeometry, edgesMaterial);
                    edgesLine.userData.isLineOfSightPlane = true;
                    edgesLine.renderOrder = 998;
                    
                    // Position at midpoint in local coordinates
                    const midpoint = new THREE.Vector3()
                        .addVectors(startPoint.offsetPosition, endPoint.offsetPosition)
                        .multiplyScalar(0.5);
                    box.position.copy(midpoint);
                    edgesLine.position.copy(midpoint);
                    box.setRotationFromQuaternion(quaternion);
                    edgesLine.setRotationFromQuaternion(quaternion);
                    
                    currentGroup.add(box);
                    currentGroup.add(edgesLine);
                    
                    // Store beam visualization (color will be set when storing result)
                    newBeamsMap.set(endPoint.id, {
                        clearPlane: box,
                        clearEdges: edgesLine,
                        isBlocked: false,
                    });
                }
            });
            
            // Update ONLY the specific endpoints that were just analyzed
            if (analysisResults.size > 0) {
                setEndPoints(prev => {
                    // Create new array with only the changed endpoints
                    const updated = prev.map(ep => {
                        const result = analysisResults.get(ep.id);
                        if (result && ep.analysisResult !== result) {
                            return { ...ep, analysisResult: result };
                        }
                        return ep; // Return same object reference if no change
                    });
                    
                    // Only return new array if something actually changed
                    const hasChanges = updated.some((ep, i) => ep !== prev[i]);
                    return hasChanges ? updated : prev;
                });
            }
            
            // Return updated beams map
            return newBeamsMap;
        });
        // Update last threshold reference
        lastDetectionThresholdRef.current = detectionThreshold;
        
    }, [startPoint, endPoints, tileGroup, losGroup, detectionThreshold]);

    // Static color scheme:
    // - Start point: 0x00bfff (Deep Sky Blue) - bright blue
    // - End points: 0x1e90ff (Dodger Blue) - darker blue
    // Colors are set once when markers are created and never changed

    // Handle mouse events
    useEffect(() => {
        if (analysisMode !== 'lineOfSight' || !cameraManager || !scene) return;

        const handleClick = (event: MouseEvent) => {
            if (event.button !== 0) return; // Only left click
            const target = event.target as HTMLElement;
            if (!target || target.tagName !== 'CANVAS') return; // Ignore clicks on UI

            const intersection = cameraManager.getIntersection(event);
            if (intersection) {
                // Don't place if clicking on existing marker
                if (intersection.object.userData.isLineOfSightMarker) return;

                placePoint(intersection.point);
            }
        };

        window.addEventListener('click', handleClick);

        return () => {
            window.removeEventListener('click', handleClick);
        };
    }, [analysisMode, cameraManager, scene, placePoint]);

    // Clear everything - remove markers, beams, and any legacy objects
    const clear = useCallback(() => {
        
        // Remove tool group entirely via controller (disposes contents)
        if (tileGroup) {
            globalAnalysisController.ensureAttached(tileGroup);
            globalAnalysisController.removeToolGroup('LineOfSight', true);
        }

        // Reset state
        setBeams(new Map());
        setEndPoints([]);
        setStartPoint(null);
        setLosGroup(null);
        
    }, [tileGroup]);

    const clearRef = useRef(clear);
    useEffect(() => { clearRef.current = clear; }, [clear]);

    // Update individual point settings
    const updatePointSettings = useCallback((pointId: string, settings: { offsetX?: number; offsetY?: number; offsetZ?: number }) => {
        setEndPoints(prev => prev.map(ep => {
            if (ep.id === pointId) {
                const currentOffset = ep.pointOffset || { x: 0, y: 0, z: 0 };
                const newOffset = {
                    x: settings.offsetX !== undefined && !Number.isNaN(settings.offsetX) ? settings.offsetX : currentOffset.x,
                    y: settings.offsetY !== undefined && !Number.isNaN(settings.offsetY) ? settings.offsetY : currentOffset.y,
                    z: settings.offsetZ !== undefined && !Number.isNaN(settings.offsetZ) ? settings.offsetZ : currentOffset.z,
                };
                
                // Update marker position with new offset
                const newOffsetPosition = ep.position.clone().add(new THREE.Vector3(newOffset.x, newOffset.y, newOffset.z));
                if (tileGroup) {
                    const localPos = tileGroup.worldToLocal(newOffsetPosition.clone());
                    ep.marker.position.copy(localPos);
                }
                
                
                // Clear existing beam for this point to trigger recalculation
                setBeams(prevBeams => {
                    const newBeams = new Map(prevBeams);
                    const beam = newBeams.get(pointId);
                    if (beam && losGroup) {
                        // Clean up old beam
                        losGroup.remove(beam.clearPlane);
                        losGroup.remove(beam.clearEdges);
                        beam.clearPlane.geometry.dispose();
                        (beam.clearPlane.material as THREE.Material).dispose();
                        beam.clearEdges.geometry.dispose();
                        (beam.clearEdges.material as THREE.Material).dispose();
                        
                        if (beam.blockedPlane && losGroup) {
                            losGroup.remove(beam.blockedPlane);
                            beam.blockedPlane.geometry.dispose();
                            (beam.blockedPlane.material as THREE.Material).dispose();
                        }
                        if (beam.blockedEdges && losGroup) {
                            losGroup.remove(beam.blockedEdges);
                            beam.blockedEdges.geometry.dispose();
                            (beam.blockedEdges.material as THREE.Material).dispose();
                        }
                        if (beam.hitSphere && losGroup) {
                            losGroup.remove(beam.hitSphere);
                            beam.hitSphere.geometry.dispose();
                            (beam.hitSphere.material as THREE.Material).dispose();
                        }
                        
                        newBeams.delete(pointId);
                    }
                    return newBeams;
                });
                
                return {
                    ...ep,
                    pointOffset: newOffset,
                    offsetPosition: newOffsetPosition,
                    analysisResult: undefined // Clear analysis to trigger recalculation
                };
            }
            return ep;
        }));
    }, [tileGroup, losGroup]);

    // Update start point offsets (X/Y/Z) and trigger re-analysis
    const updateStartSettings = useCallback((settings: { offsetX?: number; offsetY?: number; offsetZ?: number }) => {
        setStartOffset(prev => {
            const newOffset = {
                x: settings.offsetX !== undefined && !Number.isNaN(settings.offsetX) ? settings.offsetX : prev.x,
                y: settings.offsetY !== undefined && !Number.isNaN(settings.offsetY) ? settings.offsetY : prev.y,
                z: settings.offsetZ !== undefined && !Number.isNaN(settings.offsetZ) ? settings.offsetZ : prev.z,
            };

            // Move marker and update startPoint offsetPosition
            if (startPoint && tileGroup) {
                const base = startPoint.position.clone();
                const newOffsetPos = base.add(new THREE.Vector3(newOffset.x, newOffset.y, newOffset.z));
                const localPos = tileGroup.worldToLocal(newOffsetPos.clone());
                startPoint.marker.position.copy(localPos);

                setStartPoint({ ...startPoint, offsetPosition: newOffsetPos });

                // Clear beams to force recalculation and clear per-endpoint cached results
                setBeams(prevBeams => {
                    prevBeams.forEach(beam => {
                        if (losGroup) {
                            losGroup.remove(beam.clearPlane);
                            losGroup.remove(beam.clearEdges);
                        }
                        beam.clearPlane.geometry.dispose();
                        (beam.clearPlane.material as THREE.Material).dispose();
                        beam.clearEdges.geometry.dispose();
                        (beam.clearEdges.material as THREE.Material).dispose();
                        if (beam.blockedPlane && losGroup) {
                            losGroup.remove(beam.blockedPlane);
                            beam.blockedPlane.geometry.dispose();
                            (beam.blockedPlane.material as THREE.Material).dispose();
                        }
                        if (beam.blockedEdges && losGroup) {
                            losGroup.remove(beam.blockedEdges);
                            beam.blockedEdges.geometry.dispose();
                            (beam.blockedEdges.material as THREE.Material).dispose();
                        }
                        if (beam.hitSphere && losGroup) {
                            losGroup.remove(beam.hitSphere);
                            beam.hitSphere.geometry.dispose();
                            (beam.hitSphere.material as THREE.Material).dispose();
                        }
                    });
                    return new Map();
                });
                setEndPoints(prev => prev.map(ep => ({ ...ep, analysisResult: undefined })));
            }

            return newOffset;
        });
    }, [startPoint, tileGroup, losGroup]);

    // Hide when switching away from line of sight mode
    useEffect(() => {
        if (analysisMode !== 'lineOfSight' && losGroup) {
            losGroup.visible = false;
        } else if (analysisMode === 'lineOfSight' && losGroup) {
            losGroup.visible = true;
        }
    }, [analysisMode, losGroup]);

    // Cleanup only when switching to 2D
    useEffect(() => {
        const handleCleanup = () => {
            clearRef.current();
        };

        window.addEventListener('cleanup-3d-analysis', handleCleanup);
        
        return () => {
            window.removeEventListener('cleanup-3d-analysis', handleCleanup);
        };
    }, []);

    return {
        startPoint,
        endPoints,
        beams,
        offset,
        setOffset,
        startOffset,
        updateStartSettings,
        detectionThreshold,
        setDetectionThreshold,
        placePoint,
        clear,
        updatePointSettings,
    };
};
