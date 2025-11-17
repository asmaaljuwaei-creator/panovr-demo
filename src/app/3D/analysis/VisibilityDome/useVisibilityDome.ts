import { useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useMap3DRequired } from '../../context/Map3DContext';
import { globalAnalysisPool, globalAnalysisRaycaster } from '../shared';

export interface VisibilityPoint {
  id: string;
  position: THREE.Vector3;
  marker: THREE.Mesh;
}

export interface VisibilityData {
  azimuth: number;
  elevation: number;
  blocked: boolean;
  distance: number | null;
  hit?: THREE.Vector3;
}

export interface VisibilityStats {
  totalRays: number;
  visibleRays: number;
  blockedRays: number;
  visiblePercent: number;
  blockedPercent: number;
  maxVisibleDistance: number;
  minBlockedDistance: number;
}

export const useVisibilityDome = () => {
  const { scene, camera, cameraManager, analysisMode, tileGroup } = useMap3DRequired();
  const [point, setPoint] = useState<VisibilityPoint | null>(null);
  const [visibilityData, setVisibilityData] = useState<VisibilityData[]>([]);
  const [stats, setStats] = useState<VisibilityStats | null>(null);
  const [range, setRange] = useState<number>(500); // meters
  const [rayDensity, setRayDensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [heightOffset, setHeightOffset] = useState<number>(2); // meters above ground
  const [visualizationLines, setVisualizationLines] = useState<THREE.Line[]>([]);
  const [sphereMesh, setSphereMesh] = useState<THREE.Mesh | null>(null);

  // Initialize raycaster
  useEffect(() => {
    if (camera) globalAnalysisRaycaster.setCamera(camera);
    if (scene) globalAnalysisRaycaster.setScene(scene);
  }, [camera, scene]);

  // Get number of rays based on density (horizontal and vertical) - Higher resolution
  const getRayCounts = useCallback((): { horizontal: number; vertical: number } => {
    switch (rayDensity) {
      case 'low': return { horizontal: 32, vertical: 16 }; // 512 rays - smooth
      case 'medium': return { horizontal: 48, vertical: 24 }; // 1,152 rays - high quality
      case 'high': return { horizontal: 72, vertical: 36 }; // 2,592 rays - very detailed
      default: return { horizontal: 48, vertical: 24 };
    }
  }, [rayDensity]);

  // Place analysis point
  const placePoint = useCallback((position: THREE.Vector3) => {
    if (!tileGroup) return;

    // Clear existing point
    if (point) {
      globalAnalysisPool.returnMarker(point.marker, tileGroup);
    }

    const id = `visibility-point-${Date.now()}`;
    
    // Create marker with different color (blue for visibility analysis)
    const marker = globalAnalysisPool.getMarker({ 
      color: 0x0066ff, 
      radius: 10,
      opacity: 0.95 
    });
    marker.userData.isVisibilityMarker = true;
    
    // Apply height offset
    const offsetPosition = position.clone();
    offsetPosition.y += heightOffset;
    
    // Convert to tileGroup local space
    const localPosition = tileGroup.worldToLocal(offsetPosition.clone());
    marker.position.copy(localPosition);
    
    tileGroup.add(marker);
    
    console.log('📍 Visibility point placed at:', offsetPosition);

    const newPoint: VisibilityPoint = {
      id,
      position: offsetPosition.clone(),
      marker,
    };

    setPoint(newPoint);
  }, [tileGroup, point, heightOffset]);

  // Perform 360° spherical visibility analysis (true 3D dome)
  const analyzeVisibility = useCallback(() => {
    if (!point) return;

    const { horizontal, vertical } = getRayCounts();
    
    // Cast rays in a spherical pattern (360° horizontally + up/down)
    const results = globalAnalysisRaycaster.castSphericalRays(
      point.position, 
      horizontal, 
      vertical,
      {
        maxDistance: range,
        excludeUserData: ['isVisibilityMarker', 'isAnalysisMarker', 'isAnalysisLine']
      }
    );

    // Results are already in the correct format
    const visData: VisibilityData[] = results;

    // Calculate statistics
    const totalRays = results.length;
    const visibleRays = visData.filter(d => !d.blocked).length;
    const blockedRays = visData.filter(d => d.blocked).length;
    const visiblePercent = (visibleRays / totalRays) * 100;
    const blockedPercent = (blockedRays / totalRays) * 100;

    const visibleDistances = visData.filter(d => !d.blocked).map(d => d.distance || 0);
    const blockedDistances = visData.filter(d => d.blocked && d.distance).map(d => d.distance!);

    const maxVisibleDistance = visibleDistances.length > 0 ? range : 0;
    const minBlockedDistance = blockedDistances.length > 0 ? Math.min(...blockedDistances) : 0;

    const newStats: VisibilityStats = {
      totalRays,
      visibleRays,
      blockedRays,
      visiblePercent,
      blockedPercent,
      maxVisibleDistance,
      minBlockedDistance
    };

    setVisibilityData(visData);
    setStats(newStats);

    console.log('🔍 Visibility analysis complete:', newStats);
    console.log(`   📊 Rays: ${horizontal} horizontal × ${vertical} vertical = ${totalRays} total`);
  }, [point, range, getRayCounts]);

  // Create color-mapped sphere visualization
  useEffect(() => {
    if (!point || !tileGroup || visibilityData.length === 0) {
      // Remove existing sphere
      if (sphereMesh) {
        tileGroup?.remove(sphereMesh);
        sphereMesh.geometry.dispose();
        (sphereMesh.material as THREE.Material).dispose();
      }
      setSphereMesh(null);
      return;
    }

    // Remove old sphere
    if (sphereMesh) {
      tileGroup.remove(sphereMesh);
      sphereMesh.geometry.dispose();
      (sphereMesh.material as THREE.Material).dispose();
    }

    const { horizontal, vertical } = getRayCounts();
    const localOrigin = point.marker.position.clone();

    // Build custom geometry directly from visibility data for accurate color mapping
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    
    // Create a grid of vertices based on actual ray data
    const dataGrid: (VisibilityData | null)[][] = [];
    
    // Organize visibility data into a 2D grid (horizontal × vertical)
    for (let v = 0; v < vertical; v++) {
      dataGrid[v] = [];
      for (let h = 0; h < horizontal; h++) {
        const index = v * horizontal + h;
        dataGrid[v][h] = visibilityData[index] || null;
      }
    }
    
    // Create vertices from the grid
    let vertexIndex = 0;
    for (let v = 0; v <= vertical; v++) {
      for (let h = 0; h <= horizontal; h++) {
        // Get elevation and azimuth for this grid position
        const elevation = (v / vertical) * Math.PI - Math.PI / 2; // -90° to +90°
        const azimuth = (h / horizontal) * Math.PI * 2; // 0° to 360°
        
        // Convert to Cartesian coordinates
        const x = range * Math.cos(elevation) * Math.cos(azimuth);
        const y = range * Math.sin(elevation);
        const z = range * Math.cos(elevation) * Math.sin(azimuth);
        
        positions.push(x, y, z);
        
        // Find corresponding visibility data (use nearest grid cell)
        const vIndex = Math.min(v, vertical - 1);
        const hIndex = Math.min(h, horizontal - 1);
        const data = dataGrid[vIndex]?.[hIndex];
        
        // Gradient heatmap: Red (blocked) -> Yellow (moderate) -> Green (clear)
        let r = 0, g = 0, b = 0;
        
        if (!data || !data.blocked) {
          // No hit - maximum visibility (green)
          r = 0; g = 1; b = 0;
        } else {
          // Hit something - calculate color based on distance ratio
          const distanceRatio = (data.distance || 0) / range;
          
          if (distanceRatio < 0.5) {
            // Close obstacle (0-50%): Red to Yellow
            const t = distanceRatio / 0.5; // 0 to 1
            r = 1; // Keep red at 1
            g = t; // 0 to 1 (add green to make yellow)
            b = 0;
          } else {
            // Far obstacle (50-100%): Yellow to Green
            const t = (distanceRatio - 0.5) / 0.5; // 0 to 1
            r = 1 - t; // 1 to 0 (fade out red)
            g = 1; // Keep green at 1
            b = 0;
          }
        }
        
        colors.push(r, g, b);
        
        vertexIndex++;
      }
    }
    
    // Create faces (triangles) connecting the grid
    for (let v = 0; v < vertical; v++) {
      for (let h = 0; h < horizontal; h++) {
        const a = v * (horizontal + 1) + h;
        const b = a + 1;
        const c = (v + 1) * (horizontal + 1) + h;
        const d = c + 1;
        
        // Two triangles per quad
        indices.push(a, b, d);
        indices.push(a, d, c);
      }
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    // Create material with vertex colors and better quality
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5, // Increased from 0.3 for better visibility
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(localOrigin);
    mesh.userData.isVisibilityVisualization = true;
    mesh.renderOrder = 997;
    
    tileGroup.add(mesh);
    setSphereMesh(mesh);
    
    console.log('🎨 Sphere visualization created with', visibilityData.length, 'data points');
  }, [point, tileGroup, visibilityData, range, getRayCounts]);

  // Create lines showing ray hits (only for blocked rays)
  useEffect(() => {
    if (!point || !tileGroup || visibilityData.length === 0) {
      // Remove existing lines
      visualizationLines.forEach(line => {
        tileGroup?.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
      setVisualizationLines([]);
      return;
    }

    // Remove old lines
    visualizationLines.forEach(line => {
      tileGroup.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });

    // Create ray visualization lines (all rays, with two segments for blocked rays)
    const newLines: THREE.Line[] = [];
    const localOrigin = point.marker.position.clone();

    visibilityData.forEach(data => {
      // Calculate direction vector from spherical coordinates
      const direction = new THREE.Vector3(
        Math.cos(data.elevation) * Math.cos(data.azimuth),
        Math.sin(data.elevation),
        Math.cos(data.elevation) * Math.sin(data.azimuth)
      ).normalize();
      
      if (data.blocked && data.hit) {
        // BLOCKED RAY: Two-segment line like Line of Sight
        const hitDistance = data.distance || range * 0.5;
        
        // Convert world hit position to local space
        const hitPoint = tileGroup.worldToLocal(data.hit.clone());
        
        // Green segment (origin to hit point)
        const greenGeometry = new THREE.BufferGeometry().setFromPoints([
          localOrigin,
          hitPoint
        ]);
        const greenMaterial = new THREE.LineBasicMaterial({
          color: 0x00ff00,
          transparent: true,
          opacity: 0.6,
          depthTest: false
        });
        const greenLine = new THREE.Line(greenGeometry, greenMaterial);
        greenLine.userData.isVisibilityVisualization = true;
        greenLine.renderOrder = 998;
        tileGroup.add(greenLine);
        newLines.push(greenLine);
        
        // Red segment (hit point to max range)
        const endPoint = direction.clone().multiplyScalar(range).add(localOrigin);
        const redGeometry = new THREE.BufferGeometry().setFromPoints([
          hitPoint,
          endPoint
        ]);
        const redMaterial = new THREE.LineBasicMaterial({
          color: 0xff0000,
          transparent: true,
          opacity: 0.3,
          depthTest: false
        });
        const redLine = new THREE.Line(redGeometry, redMaterial);
        redLine.userData.isVisibilityVisualization = true;
        redLine.renderOrder = 997;
        tileGroup.add(redLine);
        newLines.push(redLine);
        
      } else {
        // CLEAR RAY: Single green line to max range
        const endPoint = direction.clone().multiplyScalar(range).add(localOrigin);
        const geometry = new THREE.BufferGeometry().setFromPoints([
          localOrigin,
          endPoint
        ]);
        const material = new THREE.LineBasicMaterial({
          color: 0x00ff00,
          transparent: true,
          opacity: 0.6,
          depthTest: false
        });
        const line = new THREE.Line(geometry, material);
        line.userData.isVisibilityVisualization = true;
        line.renderOrder = 998;
        tileGroup.add(line);
        newLines.push(line);
      }
    });

    setVisualizationLines(newLines);
    console.log('🎨 Created', newLines.length, 'ray visualization lines (green=clear, green+red=blocked)');
  }, [point, tileGroup, visibilityData, range]);

  // Trigger analysis when point is placed or settings change
  useEffect(() => {
    if (point) {
      analyzeVisibility();
    }
  }, [point, range, rayDensity, analyzeVisibility]);

  // Handle mouse events
  useEffect(() => {
    if (analysisMode !== 'visibilityDome' || !cameraManager || !scene) return;

    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0) return; // Only left click

      const intersection = cameraManager.getIntersection(event);
      if (intersection) {
        // Don't place if clicking on existing marker
        if (intersection.object.userData.isVisibilityMarker) return;
        
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

    if (point) {
      globalAnalysisPool.returnMarker(point.marker, tileGroup);
    }

    // Remove sphere visualization
    if (sphereMesh) {
      tileGroup.remove(sphereMesh);
      sphereMesh.geometry.dispose();
      (sphereMesh.material as THREE.Material).dispose();
    }

    // Remove all lines
    visualizationLines.forEach(line => {
      tileGroup.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });

    setPoint(null);
    setVisibilityData([]);
    setStats(null);
    setSphereMesh(null);
    setVisualizationLines([]);
  }, [tileGroup, point, sphereMesh, visualizationLines]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clear();
    };
  }, []);

  return {
    point,
    visibilityData,
    stats,
    range,
    setRange,
    rayDensity,
    setRayDensity,
    heightOffset,
    setHeightOffset,
    placePoint,
    clear,
  };
};
