'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { setSelectedLayer } from '@/store/slices/baseLayerSlice';
import { Tile } from 'ol';
import { MapControls } from '@/components/3DControls';
//import LayerSwitcher from '@/components/map/components/LayerSwitcher';
import { useLocale } from '@/components/useLocale';
import { useRouter } from 'next/navigation';
import { useThemeStore } from '@/components/useThemeStore';
//import clientApi from "@/axios/clientApi";
import { gsap } from "gsap";
//import { getContractConfig } from "@/utils/contractIdManager";
import { useMap3DRequired } from '../context/Map3DContext';
import { createCameraControlManager, type CameraControlManager } from '../managers/CameraControlManager';
import { createInputHandler, type InputHandlerConfig, type MouseInfo } from '../managers/InputHandlerManager';
import { loadModelsFromConfig, type ModelsManagerConfig } from '../managers/ModelsManager';
import type { TileManager as TileManagerAPI } from '../managers/tileManager';
import { createTileManager } from '../managers/tileManager';
import { createTilesCacheManager } from '../managers/tilesCacheManager';
import { createGLBTileManager } from '../managers/glbTileManager';
import { createLightingManager } from '../managers/lightingManager';
import { LineOfSightTool } from '../analysis/LineOfSight';
import { VisibilityDomeTool } from '../analysis/VisibilityDome';
import { ViewshedTool } from '../analysis/Viewshed';
import { HumanEyeTool } from '../analysis/HumanEye';
//new helper classes
import { latLonToMercator, mercatorToLatLon, MAP_SIZE_METERS } from '../utils/geoUtils';
// Animation utilities
import {
    collectMaterials,
    setMaterialsTransparent,
    animateFadeIn,
    animateFadeOut,
    animateRiseFromGround,
    animateSinkIntoGround,
    animateAppear,
    animateDisappear
} from '../utils/animations';
// Material utilities
import {
    updateMaterialProperties,
    getDistanceBetweenMercatorPoints
} from '../utils/materials';
// Visibility control utilities
import {
    control3DTilesVisibility as control3DTilesVisibilityUtil,
    collectBuildings,
    getHorizontalDistance,
    VISIBILITY_CONSTANTS
} from '../utils/visibilityControl';
// Scene setup utilities
import {
    createSky,
    createLights,
    createCamera,
    createRenderer,
    createControls,
    createTileGroups,
    createGroundPlane,
    setupEnvironment
} from '../utils/sceneSetup';
// Custom hooks
import { useMaterialUpdater } from '../hooks/useMaterialUpdater';
import { useLightingManager } from '../hooks/useLightingManager';
import { useTileLoader } from '../hooks/useTileLoader';
import { useCityTileLoader } from '../hooks/useCityTileLoader';
// Extracted components
import { ThreeDMapControls } from './ThreeDMapControls';
// Zoom utilities
import { zoomToCameraHeight, cameraHeightToZoom, calculateZoomFromDistance, ZOOM_CONSTANTS } from '../utils/zoomCalculations';
// Map state storage
import { getMapStateFromLocalStorage, updateMapStateInLocalStorage } from '../utils/mapStateStorage';
// City tile utilities
import { findNearestCity as findNearestCityUtil, loadCitiesFromJSON as loadCitiesFromJSONUtil, CITY_TILE_CONSTANTS, type CityConfig as CityConfigType } from '../utils/cityTileUtils';
// GLTF loader setup
import { createGLTFLoaderWithAuth } from '../utils/gltfLoaderSetup';


interface CityConfig {
    id: string;
    name: string;
    tilesetPath: string;
    anchorLatLon: { lat: number; lon: number };
    loadDistance: number;
    enabled: boolean;
}

interface CitiesConfigJSON {
    cities: CityConfig[];
}

const baseURL = process.env.NEXT_PUBLIC_BASE_URL;

interface ThreeRefs {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    tileGroup: THREE.Group;
    hiResTileGroup: THREE.Group;
    midResTileGroup: THREE.Group;
    lowResTileGroup: THREE.Group;
    debugBox: THREE.Mesh;
}

// ThreeDMapControls component moved to ./ThreeDMapControls.tsx


// Material and animation functions now imported from '../utils/materials' and '../utils/animations'

interface ThreeMapTilesProps {
    isVisible?: boolean;
    sidebarOpen?: boolean;
    panelOpen?: boolean;
    onSwitchTo2D?: () => void;
}

export default function ThreeMapTiles({ isVisible = true, sidebarOpen = false, panelOpen = false, onSwitchTo2D }: ThreeMapTilesProps) {
    const { isRTL } = useLocale();
    const { setScene, setCamera, setRenderer, setControls, setTileGroup, setCameraManager, analysisMode, cameraManager, setAnalysisMode } = useMap3DRequired();
    
    const containerRef = useRef<HTMLDivElement>(null);
    const debugRef = useRef<HTMLDivElement>(null);
    const threeRefs = useRef<ThreeRefs | null>(null);
    const referencePosition = useRef<THREE.Vector3>(new THREE.Vector3());
    const tileManagerRef = useRef(createTileManager());
    const tilesCacheManagerRef = useRef(createTilesCacheManager());
    const performZoomRef = useRef<((deltaY: number) => void) | null>(null);
    const [forceTileUpdate, setForceTileUpdate] = useState(0);
    const [isBasemapReady, setIsBasemapReady] = useState(false);
    const initialTilesLoadedRef = useRef(false);
    const isInitialAnimatingRef = useRef(true);
    const isVisibleRef = useRef(isVisible); 
    const zoomIn = useCallback(() => {
        performZoomRef.current?.(-900);
    }, []);
    const refreshTiles = useCallback(() => {
        if (tileManagerRef.current) {
            tileManagerRef.current.clearCache();
            setForceTileUpdate(Date.now());
        }
    }, []);
    const zoomOut = useCallback(() => {
        performZoomRef.current?.(900);
    }, []);
    
    const dispatch = useDispatch();
    const selectedLayer = useSelector((state: RootState) => (state as any).baseLayer?.selectedLayer || 'default');
    const selectedContractBasemapURL = useSelector((state: RootState) => (state as any).login?.selectedContractBasemapURL);

    const [visibleLOD, setVisibleLOD] = useState({ hi: true, mid: true, low: true });
    const [fps, setFps] = useState(0);
    const [performanceStats, setPerformanceStats] = useState({
        renderTime: 0,
        tileCount: 0,
        visibleTiles: 0,
        triangles: 0,
        drawCalls: 0,
        memoryMB: 0,
        textures: 0,
        geometries: 0
    });

    const [isRendering, setIsRendering] = useState(true);
    const [isRotating, setIsRotating] = useState(false);
    const lastCameraPosition = useRef(new THREE.Vector3());
    const lastCameraRotation = useRef(new THREE.Euler());
    const performanceMode = useRef(false);
    const frameSkipCounter = useRef(0);
    const cityTileManagersRef = useRef<Map<string, any>>(new Map());
    const activeCityRef = useRef<string | null>(null);
    const [availableCities, setAvailableCities] = useState<CityConfig[]>([]);
    const availableCitiesRef = useRef<CityConfig[]>([]);
    const citiesFetchedRef = useRef(false);
    const gltfLoaderRef = useRef<any>(null);
    const GLBTileManagerClassRef = useRef<any>(null);
    const rotationTimeout = useRef<NodeJS.Timeout | null>(null);
    const buildingVisibilityLastLog = useRef<number>(0);
    const buildingVisibilityLastCheck = useRef<number>(0);
    const lastCameraCheckPosition = useRef(new THREE.Vector3());
    const [mouseInfo, setMouseInfo] = useState({ building: '', mercatorX: 0, mercatorY: 0, latLon: { lat: 0, lon: 0 } });
    const [cameraDistance, setCameraDistance] = useState(0);
    const [lightingSettings, setLightingSettings] = useState({
        ambientIntensity: 0.6,
        directionalIntensity: 0.35,
        emissiveIntensity: 0.35,
        materialColor: '#f5fdff',
        emissiveColor: '#e2d9d5',
        turbidity: 10,
        rayleigh: 3,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.7,
        elevation: 2,
        azimuth: 180
    });

  // Zoom and map state functions now imported from utils
  const storedState = getMapStateFromLocalStorage();
  const initialLatLon = storedState ? { lat: storedState.center[1], lon: storedState.center[0] } : { lat: 24.7136, lon: 46.6753 };
  const storedZoom = storedState?.zoom ?? 2;
  const initialZoom = Math.max(7, storedZoom); // Minimum zoom level of 7
  const finalCameraHeight = zoomToCameraHeight(initialZoom);
  const initialMercator = latLonToMercator(initialLatLon.lat, initialLatLon.lon);
  const [zoom, setZoom] = useState(initialZoom);
  const initialCenterTile = tileManagerRef.current.latLonToTile(-initialLatLon.lat, initialLatLon.lon, Math.floor(initialZoom));
  const [centerTile, setCenterTile] = useState(initialCenterTile);
    // Lighting manager hook
    const { updateLighting } = useLightingManager({
        threeRefs,
        cityTileManagersRef,
        lightingSettings
    });

    // Material updater hook
    const { updateMaterialColors } = useMaterialUpdater({
        threeRefs,
        cityTileManagersRef,
        lightingSettings
    });

    // City tiles management - now using hooks!
    const loadCitiesFromJSON = useCallback(() => loadCitiesFromJSONUtil(), []);
    
    // City tile loader hook
    const { loadCityTiles } = useCityTileLoader({
        threeRefs,
        cityTileManagersRef,
        activeCityRef,
        GLBTileManagerClassRef,
        gltfLoaderRef,
        availableCitiesRef
    });

    // loadCityTiles now provided by useCityTileLoader hook above

/* FUTURE API VERSION (currently commented out):
const loadCitiesFromAPI = async (lat: number, lon: number, radiusMeters: number = 1000000): Promise<CityConfig[]> => {
    try {
        const response = await clientApi.get<CitiesConfigJSON>(
            `/api/v1/Map3D/GetNearbyCities`,
            getContractConfig({ params: { lat, lon, radius: radiusMeters } })
        );
        
        if (response.data?.cities && Array.isArray(response.data.cities)) {
            return response.data.cities.filter(city => city.enabled);
        }
        
        return loadCitiesFromJSON();
    } catch (error) {
        console.error('API call failed, falling back to JSON:', error);
        return loadCitiesFromJSON();
    }
};
*/

    useEffect(() => {
        isVisibleRef.current = isVisible;
    }, [isVisible]);

    useEffect(() => {
        updateMaterialColors();
    }, [lightingSettings.materialColor, lightingSettings.emissiveColor, lightingSettings.emissiveIntensity, updateMaterialColors]);

    useEffect(() => {
        updateLighting();
    }, [
        lightingSettings.ambientIntensity,
        lightingSettings.directionalIntensity,
        lightingSettings.turbidity,
        lightingSettings.rayleigh,
        lightingSettings.mieCoefficient,
        lightingSettings.mieDirectionalG,
        lightingSettings.elevation,
        lightingSettings.azimuth,
        updateLighting
    ]);
    
        useEffect(() => {
            const checkAndSetBasemap = () => {
                const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
                const contractId = typeof window !== 'undefined' ? localStorage.getItem('selected_contract_id') : null;
                
                if (!token || !contractId) {
                    setTimeout(checkAndSetBasemap, 300);
                    return;
                }
                
                if (tileManagerRef.current) {
                    const tileManager = tileManagerRef.current;
                    
                    tileManager.updateTokensAndReconfigure();
                    
                    if (selectedContractBasemapURL && tileManager.tileServer !== selectedContractBasemapURL) {
                        tileManager.tileServer = selectedContractBasemapURL;
                        tileManager.clearCache();
                    }
                    
                    setIsBasemapReady(true);
                }
            };
            
            checkAndSetBasemap();
        }, [selectedContractBasemapURL]);

    useEffect(() => {
        if (threeRefs.current) {
            const timer = setTimeout(() => {
                updateLighting();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [updateLighting, updateMaterialColors]);

        const control3DTilesVisibility = useCallback((camera: THREE.Camera, tileGroup: THREE.Group, controls: OrbitControls) => {
        const activeManager = activeCityRef.current ? cityTileManagersRef.current.get(activeCityRef.current) : null;
        control3DTilesVisibilityUtil(camera, tileGroup, controls, activeManager);
    }, []);

    const controlBuildingsVisibility = useCallback((camera: THREE.Camera, scene: THREE.Scene, tileGroup: THREE.Group, controls: OrbitControls) => {
        if (!threeRefs.current) return;
        
        const cameraMovement = camera.position.distanceTo(lastCameraCheckPosition.current);
        const now = Date.now();
        if (cameraMovement < 100 && now - buildingVisibilityLastCheck.current < 200) return;
        
        lastCameraCheckPosition.current.copy(camera.position);
        buildingVisibilityLastCheck.current = now;
        
        const cameraDistance = camera.position.distanceTo(controls.target);
        
        const processContainer = (container: THREE.Object3D) => {
            const buildings = collectBuildings(container);
            
            for (const building of buildings) {
                const worldPos = new THREE.Vector3();
                building.getWorldPosition(worldPos);
                const distanceToBuilding = getHorizontalDistance(worldPos, camera.position);
                const currentlyVisible = building.visible;
                
                const shouldBeVisible = currentlyVisible
                    ? distanceToBuilding <= VISIBILITY_CONSTANTS.BUILDING_HIDE_DISTANCE && cameraDistance <= VISIBILITY_CONSTANTS.CAMERA_HEIGHT_THRESHOLD
                    : distanceToBuilding <= VISIBILITY_CONSTANTS.BUILDING_SHOW_DISTANCE && cameraDistance <= VISIBILITY_CONSTANTS.CAMERA_HEIGHT_THRESHOLD;
                
                if (shouldBeVisible && !currentlyVisible) {
                    building.visible = true;
                    animateAppear(building, building.userData.originalY ?? building.position.y);
                } else if (!shouldBeVisible && currentlyVisible) {
                    animateDisappear(building, building.userData.originalY ?? building.position.y, 1.2, () => {
                        building.visible = false;
                    });
                }
            }
        };
        
        processContainer(scene);
        processContainer(tileGroup);
    }, []);

     
    

    const loading = useRef(false);
    const modelLoadedRef = useRef(false);
    const tilesetLoadedRef = useRef(false);
    const loadedTiles = useRef({
        hi: new Map(),
        mid: new Map(),
        low: new Map(),
    });
    
    const tilesBeingLoaded = useRef(new Set<string>());
    const tilesToRemove = useRef({
        hi: new Map(),
        mid: new Map(),
        low: new Map(),
    });
    const animationFrameId = useRef<number | null>(null);
                useEffect(() => {
                    if (tileManagerRef.current) {
                        tileManagerRef.current.setSelectedLayer(selectedLayer);
                        tileManagerRef.current.clearCache();
                        if (threeRefs.current) {
                            const { hiResTileGroup, midResTileGroup, lowResTileGroup } = threeRefs.current;
                            [hiResTileGroup, midResTileGroup, lowResTileGroup].forEach(group => {
                                while (group.children.length > 0) {
                                    const child = group.children[0];
                                    group.remove(child);
                                    if (child instanceof THREE.Mesh && child.geometry) {
                                        child.geometry.dispose();
                                        if (child.material) {
                                            if (Array.isArray(child.material)) {
                                                child.material.forEach(mat => mat.dispose());
                                            } else {
                                                child.material.dispose();
                                            }
                                        }
                                    }
                                }
                            });
                            
                            loadedTiles.current.hi.clear();
                            loadedTiles.current.mid.clear();
                            loadedTiles.current.low.clear();
                            tilesBeingLoaded.current.clear();
                        }
                        
                        setForceTileUpdate(prev => prev + 1);
                    }
                }, [selectedLayer]);

    const MIN_ZOOM = 0;
    const MAX_ZOOM = 19;
    const LOD_HEIGHTS = [0, -1, -2]; // Very tight spacing - minimal height difference
    const HI_RES_GRID = 5; // 5x5 = 25 tiles - balanced quality/performance
    const MID_RES_GRID = 7; // 7x7 = 49 tiles - increased for better coverage
    const LOW_RES_GRID = 6; // 6x6 = 36 tiles

    // Tile loader hook - handles all LOD tile loading (shares refs with initial tile loading)
    useTileLoader({
        threeRefs,
        tileManagerRef,
        zoom,
        centerTile,
        forceTileUpdate,
        isBasemapReady,
        MIN_ZOOM,
        MAX_ZOOM,
        HI_RES_GRID,
        MID_RES_GRID,
        LOW_RES_GRID,
        LOD_HEIGHTS,
        loadedTilesRef: loadedTiles,
        tilesBeingLoadedRef: tilesBeingLoaded
    });

    useEffect(() => {        
        if (!containerRef.current) {
            return;
        }
        if (threeRefs.current) {
            const { renderer: existingRenderer } = threeRefs.current as any;
            if (existingRenderer && existingRenderer.domElement && existingRenderer.domElement.parentNode) {
                existingRenderer.domElement.parentNode.removeChild(existingRenderer.domElement);
            }
            if (existingRenderer) {
                existingRenderer.dispose();
            }
            threeRefs.current = null;
        }

        const containerDiv = containerRef.current!;
        
        // Create scene and setup
        const scene = new THREE.Scene();
        createSky(scene);
        createLights(scene);
        
        // Create camera and renderer
        const camera = createCamera(containerDiv.clientWidth, containerDiv.clientHeight, finalCameraHeight);
        const renderer = createRenderer(containerDiv);
        const initializeCities = async () => {
            if (citiesFetchedRef.current) return;
            const cities = await loadCitiesFromJSON();
            availableCitiesRef.current = cities; 
            setAvailableCities(cities); 
            citiesFetchedRef.current = true;
            setTimeout(() => {
                if (threeRefs.current && cities.length > 0) {
                    const mapCenter = new THREE.Vector3().copy(threeRefs.current.tileGroup.position).negate();
                    loadCityTiles(-mapCenter.x, -mapCenter.z);
                }
            }, 500);
        };

        setTimeout(() => initializeCities(), 500);
        // Setup environment and ground
        createGroundPlane(scene);
        setupEnvironment(scene, renderer, () => updateLighting());
        
        // Create tile groups
        const { tileGroup, hiResTileGroup, midResTileGroup, lowResTileGroup } = createTileGroups(scene, initialMercator);
        
        // Create controls with change handler
        const onControlsChange = () => {
            const currentPos = camera.position.clone();
            const currentRot = camera.rotation.clone();
            if (!currentPos.equals(lastCameraPosition.current) || !currentRot.equals(lastCameraRotation.current)) {
                setIsRotating(true);
                performanceMode.current = true;
                if (rotationTimeout.current) clearTimeout(rotationTimeout.current);
                rotationTimeout.current = setTimeout(() => {
                    setIsRotating(false);
                    performanceMode.current = false;
                    frameSkipCounter.current = 0;
                }, 150);
            }
            lastCameraPosition.current.copy(currentPos);
            lastCameraRotation.current.copy(currentRot);
        };
        const controls = createControls(camera, renderer.domElement, onControlsChange);
        const debugBox = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
        );
        tileGroup.add(debugBox);
        threeRefs.current = {
            scene,
            camera,
            renderer,
            controls,
            tileGroup,
            hiResTileGroup,
            midResTileGroup,
            lowResTileGroup,
            debugBox,
        };

        // Initialize Map3D Context
        setScene(scene);
        setCamera(camera);
        setRenderer(renderer);
        setControls(controls);
        setTileGroup(tileGroup);
        
        // Initialize Camera Control Manager using factory function
        const cameraManager = createCameraControlManager(camera, controls, scene, renderer);
        setCameraManager(cameraManager);

        // Initialize Input Handler (runs alongside existing handlers)
        const disposeInputHandler = createInputHandler({
            containerDiv,
            threeRefs,
            cameraManager,
            isInitialAnimatingRef,
            onMouseInfoUpdate: (info: MouseInfo) => setMouseInfo(info)
        });

        // Setup GLBTileManager factory with proper context
      /*  GLBTileManagerClassRef.current = (
            tileGroupParam: THREE.Group,
            gltfLoaderParam: GLTFLoader,
            anchorMercator: { x: number; y: number },
            tilesetPath: string
        ) => createGLBTileManager(
            tileGroupParam,
            gltfLoaderParam,
            anchorMercator,
            tilesetPath,
           {
                baseURL: baseURL || '',
                getLightingSettings: () => lightingSettings,
                getMouseMercator: () => ({ x: mouseInfo.mercatorX, y: mouseInfo.mercatorY }),
                getMapCenterMercator: () => {
                    if (!threeRefs.current) return { x: 0, y: 0 };
                    const mapCenter = new THREE.Vector3().copy(threeRefs.current.tileGroup.position).negate();
                    return { x: -mapCenter.x, y: -mapCenter.z };
                },
                setMaterialsTransparent,
                animateRiseFromGround,
                animateFadeIn,
                getHeaders: () => ({ ...getContractConfig().headers })
            }
        );*/

        let frameCount = 0;
        let lastTime = performance.now();
        
        // Initialize GLTF Loader with authentication
        const gltfLoader = createGLTFLoaderWithAuth();
        gltfLoaderRef.current = gltfLoader;
        
        // Model loading (simple flag-based approach)
        const loadModel = () => {
            if (modelLoadedRef.current) return;
            modelLoadedRef.current = true;
        };

        // Load models from config using functional approach
      /*  loadModelsFromConfig({
            baseURL: baseURL || '',
            tileGroup,
            gltfLoader,
            getHeaders: () => getContractConfig().headers,
            modelLoadedRef
        });*/
             
        const animate = () => {
            animationFrameId.current = requestAnimationFrame(animate);
            // Only update orbit controls if not in first-person mode
            if (!cameraManager.isFirstPerson()) {
                controls.update();
            } else {
                // Enforce camera position lock in first-person mode
                cameraManager.enforceCameraLock();
            }
            const currentTime = performance.now();
            frameCount++;
            const deltaTime = currentTime - lastTime;
            if (deltaTime >= 1000) {
                setFps(Math.round(frameCount / (deltaTime / 1000)));
                frameCount = 0;
                lastTime = currentTime;
            }
            if (threeRefs.current) {
                const { debugBox, tileGroup, renderer, camera, hiResTileGroup, controls, scene } = threeRefs.current;
                frameSkipCounter.current++;
                const shouldRunExpensiveOps = frameSkipCounter.current % 3 === 0;

                if (shouldRunExpensiveOps) {
                    setCameraDistance(camera.position.distanceTo(controls.target));
                    const mapCenter = new THREE.Vector3().copy(tileGroup.position).negate();
                    loadCityTiles(-mapCenter.x, -mapCenter.z); 
                    control3DTilesVisibility(camera, tileGroup, controls);
                    controlBuildingsVisibility(camera, scene, tileGroup, controls);
                }

        const mapCenter = new THREE.Vector3().copy(tileGroup.position).negate();
        const distanceToTarget = camera.position.distanceTo(controls.target);
        const currentLatLon = mercatorToLatLon(mapCenter.x, -mapCenter.z);
        
        if (isInitialAnimatingRef.current) {
            return;
        }
        
        const actualCameraHeight = camera.position.y;
        const currentZoom = cameraHeightToZoom(actualCameraHeight);
        const clampedZoom = Math.max(0, Math.min(19, currentZoom));
        
        
        updateMapStateInLocalStorage(currentLatLon.lat, currentLatLon.lon, clampedZoom);
        
        let newZoom;
        const breakPoint = 280000;

        if (!modelLoadedRef.current && distanceToTarget < 7500) {
            loadModel();
        }

                if (distanceToTarget > breakPoint) {
                    const scaledDistance = Math.pow(distanceToTarget, 0.95);
                    newZoom = Math.log(MAP_SIZE_METERS / scaledDistance) / Math.log(2);
                } else {
                    const scaledDistance = Math.pow(distanceToTarget, 0.85);
                    newZoom = Math.log(MAP_SIZE_METERS / scaledDistance) / Math.log(2);
                }

                if (Math.abs(newZoom - zoom) > 0.1) {
                    setZoom(newZoom);
                }

                const { lat, lon } = mercatorToLatLon(mapCenter.x, mapCenter.z);
                const newCenterTile = tileManagerRef.current.latLonToTile(-lat, lon, Math.floor(newZoom));
                if (newCenterTile.x !== centerTile.x || newCenterTile.y !== centerTile.y) {
                    setCenterTile(newCenterTile);
                }

                const hiResTileSize = MAP_SIZE_METERS / Math.pow(2, Math.floor(zoom));
                const debugBoxSize = hiResTileSize * HI_RES_GRID;
                debugBox.scale.set(debugBoxSize, 1, debugBoxSize);
                debugBox.position.set(0, 0, 0);

                if (debugRef.current && shouldRunExpensiveOps && frameCount % 30 === 0) { 
                    debugRef.current.innerHTML = `
                    FPS: ${fps}<br/>
                    Camera Pos: x:${camera.position.x.toFixed(1)} y:${camera.position.y.toFixed(1)} z:${camera.position.z.toFixed(1)}<br/>
                    Distance to Target: ${distanceToTarget.toFixed(1)}<br/>
                    Zoom: ${zoom.toFixed(1)}<br/>
                    Model Loaded: ${modelLoadedRef.current}
                    `;
                }
            }
            if (isRendering && isVisibleRef.current) {
                const renderStart = performance.now();
                renderer.render(scene, camera);
                const renderTime = performance.now() - renderStart;
                
                // Update stats every 30 frames
                if (frameCount % 30 === 0) {
                    // Get memory info (Chrome only)
                    const memory = (performance as any).memory;
                    const memoryMB = memory ? Math.round(memory.usedJSHeapSize / 1048576) : 0;
                    
                    const stats = {
                        renderTime: Math.round(renderTime * 100) / 100,
                        tileCount: hiResTileGroup.children.length + midResTileGroup.children.length + lowResTileGroup.children.length,
                        visibleTiles: hiResTileGroup.children.filter((c: any) => c.visible).length,
                        triangles: renderer.info.render.triangles,
                        drawCalls: renderer.info.render.calls,
                        memoryMB,
                        textures: renderer.info.memory.textures,
                        geometries: renderer.info.memory.geometries
                    };
                    setPerformanceStats(stats);
                }
            }
        };
        animate();

        // Lazy load timer for models
        const lazyLoadTimer = setTimeout(() => {
            if (!modelLoadedRef.current && threeRefs.current) {
                const { camera, controls } = threeRefs.current;
                const distance = camera.position.distanceTo(controls.target);
                if (distance < 7500) {
                    loadModel();
                }
                refreshTiles();
            }
        }, 1500);

        // Setup programmatic zoom via CameraControlManager
        performZoomRef.current = (deltaY: number) => {
            if (!isInitialAnimatingRef.current) {
                cameraManager?.executeZoom(deltaY);
            }
        };
        const handleResize = () => {
            camera.aspect = containerDiv.clientWidth / containerDiv.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(containerDiv.clientWidth, containerDiv.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            clearTimeout(lazyLoadTimer);
            window.removeEventListener('resize', handleResize);
            disposeInputHandler(); // Cleanup input handler

            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            if (threeRefs.current?.renderer) {
                const { scene, renderer } = threeRefs.current;
                scene.traverse((obj) => {
                    if (obj instanceof THREE.Mesh) {
                        obj.geometry.dispose();
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach((material) => material.dispose());
                        } else {
                            obj.material.dispose();
                        }
                    }
                }); 
                renderer.dispose();
            }
            
            if (tileManagerRef.current) {
                tileManagerRef.current.clearCache();
            }
            if (tilesCacheManagerRef.current) {
                tilesCacheManagerRef.current.clear();
            }
        };
    }, []);

    useEffect(() => {
        if (!threeRefs.current) return;
        const { hiResTileGroup, midResTileGroup, lowResTileGroup } = threeRefs.current;
        hiResTileGroup.visible = visibleLOD.hi;
        midResTileGroup.visible = visibleLOD.mid;
        lowResTileGroup.visible = visibleLOD.low;
    }, [zoom, centerTile, visibleLOD]);

    // Tile loading now handled by useTileLoader hook above

   
    useEffect(() => {
        if (isBasemapReady && threeRefs.current && !initialTilesLoadedRef.current) {
            setTimeout(() => {
                if (threeRefs.current) {
                    const { camera, controls, scene, tileGroup, hiResTileGroup, midResTileGroup, lowResTileGroup } = threeRefs.current;
                    
                    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(zoom)));
                    const mapCenter = new THREE.Vector3().copy(tileGroup.position).negate();
                    const centerLatLon = mercatorToLatLon(mapCenter.x, mapCenter.z);
                  
                    const getTileBBoxInWorldSpace = (tileX: number, tileY: number, tileZoom: number) => {
                      const tileSize = MAP_SIZE_METERS / Math.pow(2, tileZoom);
                      const halfMapSize = MAP_SIZE_METERS / 2;
                      const xMin = (tileX * tileSize) - halfMapSize;
                      const zMin = (tileY * tileSize) - halfMapSize;
                      return {
                        centerX: xMin + tileSize / 2,
                        centerZ: zMin + tileSize / 2,
                      };
                    };
                  
                    isInitialAnimatingRef.current = false;
                    initialTilesLoadedRef.current = true;
                    
                    const hiCenter = tileManagerRef.current.latLonToTile(-centerLatLon.lat, centerLatLon.lon, clampedZoom);
                    const hiSize = MAP_SIZE_METERS / Math.pow(2, clampedZoom);
                    const hiResGridRadius = Math.floor(HI_RES_GRID / 2);
                    
                    for (let dx = -hiResGridRadius; dx <= hiResGridRadius; dx++) {
                      for (let dy = -hiResGridRadius; dy <= hiResGridRadius; dy++) {
                        const x = hiCenter.x + dx, y = hiCenter.y + dy;
                        const key = `${clampedZoom}/${x}/${y}`;
                        if (loadedTiles.current.hi.has(key) || tilesBeingLoaded.current.has(key)) continue;
                        tilesBeingLoaded.current.add(key);
                        tileManagerRef.current.getTileTexture(x, y, clampedZoom)
                          .then((texture) => {
                            texture.needsUpdate = true;
                            texture.colorSpace = THREE.SRGBColorSpace; // Match 2D map colors
                            const geom = new THREE.PlaneGeometry(hiSize * 1.001, hiSize * 1.001);
                            const mat = new THREE.MeshBasicMaterial({ 
                              map: texture,
                              side: THREE.FrontSide,
                              transparent: false,
                              depthWrite: true,
                              depthTest: true
                            });
                            const plane = new THREE.Mesh(geom, mat);
                            const pos = getTileBBoxInWorldSpace(x, y, clampedZoom);
                            plane.position.set(pos.centerX, LOD_HEIGHTS[0], pos.centerZ);
                            plane.rotation.x = -Math.PI / 2;
                            plane.renderOrder = 3; // Hi-res tiles on top
                            plane.frustumCulled = false;
                            hiResTileGroup.add(plane);
                            loadedTiles.current.hi.set(key, plane);
                          })
                          .catch((error) => {})
                          .finally(() => tilesBeingLoaded.current.delete(key));
                      }
                    }
                    
                    const midResZoom = clampedZoom - 1;
                    if (midResZoom >= MIN_ZOOM) {
                      const midCenter = tileManagerRef.current.latLonToTile(-centerLatLon.lat, centerLatLon.lon, midResZoom);
                      const midSize = MAP_SIZE_METERS / Math.pow(2, midResZoom);
                      const midResGridRadius = Math.floor(MID_RES_GRID / 2);
                      
                      for (let dx = -midResGridRadius; dx <= midResGridRadius; dx++) {
                        for (let dy = -midResGridRadius; dy <= midResGridRadius; dy++) {
                          const x = midCenter.x + dx, y = midCenter.y + dy;
                          const key = `${midResZoom}/${x}/${y}`;
                          if (loadedTiles.current.mid.has(key) || tilesBeingLoaded.current.has(key)) continue;
                          tilesBeingLoaded.current.add(key);
                          tileManagerRef.current.getTileTexture(x, y, midResZoom)
                            .then((texture) => {
                              texture.needsUpdate = true;
                              texture.colorSpace = THREE.SRGBColorSpace; // Match 2D map colors
                              const geom = new THREE.PlaneGeometry(midSize * 1.001, midSize * 1.001);
                              const mat = new THREE.MeshBasicMaterial({ 
                                map: texture,
                                side: THREE.FrontSide,
                                depthWrite: true,
                                depthTest: true
                              });
                              const plane = new THREE.Mesh(geom, mat);
                              const pos = getTileBBoxInWorldSpace(x, y, midResZoom);
                              plane.position.set(pos.centerX, LOD_HEIGHTS[1], pos.centerZ);
                              plane.rotation.x = -Math.PI / 2;
                              plane.renderOrder = 2; // Mid-res tiles
                              plane.frustumCulled = false;
                              midResTileGroup.add(plane);
                              loadedTiles.current.mid.set(key, plane);
                            })
                            .catch((error) => {})
                            .finally(() => tilesBeingLoaded.current.delete(key));
                        }
                      }
                    }
                    
                    const lowResZoom = Math.max(MIN_ZOOM, clampedZoom - 3);
                    if (lowResZoom >= MIN_ZOOM) {
                      const lowCenter = tileManagerRef.current.latLonToTile(-centerLatLon.lat, centerLatLon.lon, lowResZoom);
                      const lowSize = MAP_SIZE_METERS / Math.pow(2, lowResZoom);
                      const lowResGridRadius = Math.floor(LOW_RES_GRID / 2);
                      
                      for (let dx = -lowResGridRadius; dx <= lowResGridRadius; dx++) {
                        for (let dy = -lowResGridRadius; dy <= lowResGridRadius; dy++) {
                          const x = lowCenter.x + dx, y = lowCenter.y + dy;
                          const key = `${lowResZoom}/${x}/${y}`;
                          if (loadedTiles.current.low.has(key) || tilesBeingLoaded.current.has(key)) continue;
                          tilesBeingLoaded.current.add(key);
                          tileManagerRef.current.getTileTexture(x, y, lowResZoom)
                            .then((texture) => {
                              texture.needsUpdate = true;
                              const geom = new THREE.PlaneGeometry(lowSize * 1.001, lowSize * 1.001);
                              const mat = new THREE.MeshBasicMaterial({ 
                                map: texture,
                                side: THREE.DoubleSide
                              });
                              const plane = new THREE.Mesh(geom, mat);
                              const pos = getTileBBoxInWorldSpace(x, y, lowResZoom);
                              plane.position.set(pos.centerX, LOD_HEIGHTS[2], pos.centerZ);
                              plane.rotation.x = -Math.PI / 2;
                              plane.frustumCulled = false;
                              lowResTileGroup.add(plane);
                              loadedTiles.current.low.set(key, plane);
                            })
                            .catch((error) => {})
                            .finally(() => tilesBeingLoaded.current.delete(key));
                        }
                      }
                    }
                  
                    if (typeof control3DTilesVisibility === 'function') {
                        control3DTilesVisibility(camera, tileGroup, controls);
                    }
                    if (typeof controlBuildingsVisibility === 'function') {
                        controlBuildingsVisibility(camera, scene, tileGroup, controls);
                    }
                }
            }, 100);
        }
    }, [isBasemapReady]);
    
    return (
        <div 
            className="relative h-full transition-all duration-300"
            style={{
                    marginLeft: isRTL ? '0' : '80px',
                    marginRight: isRTL ? '80px' : '0',
                    width: 'calc(100% - 80px)'
                }}
            >
                <div ref={containerRef} className="w-full h-full" />
                
                {/* Enhanced Performance Monitor */}
                <div className="absolute top-16 left-16 z-[9999] bg-black/90 text-white px-4 py-3 rounded-lg font-mono text-xs space-y-1 shadow-lg min-w-[220px]">
                    <div className="flex items-center gap-2 mb-2 border-b border-gray-600 pb-2">
                        <span className={fps >= 50 ? "text-green-400" : fps >= 30 ? "text-yellow-400" : "text-red-400"}>●</span>
                        <span className="text-lg font-bold">{fps} FPS</span>
                </div>
                {analysisMode !== 'none' && (
                    <div className="mb-2 pb-2 border-b border-yellow-600/50">
                        <div className="flex items-center gap-2">
                            <span className="text-yellow-400">🔍</span>
                            <span className="text-yellow-300 font-semibold uppercase text-[10px]">
                                {analysisMode === 'viewshed' && 'Viewshed Analysis'}
                                {analysisMode === 'lineOfSight' && 'Line of Sight'}
                                {analysisMode === 'visibilityDome' && 'Visibility Dome'}
                                {analysisMode === 'humanEye' && 'Human Eye View'}
                            </span>
                        </div>
                    </div>
                )}
                <div className="space-y-0.5">
                    <div className="flex justify-between">
                        <span>Render:</span>
                        <span className="text-cyan-400">{performanceStats.renderTime}ms</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Memory:</span>
                        <span className={performanceStats.memoryMB > 400 ? "text-red-400" : performanceStats.memoryMB > 250 ? "text-yellow-400" : "text-green-400"}>
                            {performanceStats.memoryMB > 0 ? `${performanceStats.memoryMB} MB` : 'N/A'}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span>Triangles:</span>
                        <span className="text-purple-400">{performanceStats.triangles.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Draw Calls:</span>
                        <span className="text-orange-400">{performanceStats.drawCalls}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Textures:</span>
                        <span className="text-blue-400">{performanceStats.textures}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Geometries:</span>
                        <span className="text-pink-400">{performanceStats.geometries}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Tiles:</span>
                        <span><span className="text-green-400">{performanceStats.visibleTiles}</span>/<span className="text-gray-400">{performanceStats.tileCount}</span></span>
                    </div>
                    <div className="pt-1 border-t border-gray-700 text-gray-400 text-[10px]">
                        Z: {zoom.toFixed(1)} | H: {threeRefs.current?.camera.position.y.toFixed(0)}
                    </div>
                </div>
            </div>

            <div className={`absolute bottom-4 z-[9999] ${isRTL ? 'right-4' : 'left-4'}`}>
               {/* <LayerSwitcher />*/}
            </div>
            <div className={`absolute bottom-20 z-[9972] ${isRTL ? 'left-4' : 'right-4'}`}>
                <ThreeDMapControls onZoomIn={zoomIn} onZoomOut={zoomOut} onSwitchTo2D={onSwitchTo2D} />
            </div>
            
            {/* Analysis Tools */}
            <LineOfSightTool />
            <ViewshedTool />
            <VisibilityDomeTool />
            <HumanEyeTool />
        </div>
    );
}