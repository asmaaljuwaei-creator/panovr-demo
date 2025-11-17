import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mercatorToLatLon } from '../utils/geoUtils';

export interface MouseInfo {
    building: string;
    mercatorX: number;
    mercatorY: number;
    latLon: { lat: number; lon: number };
}

export interface InputHandlerConfig {
    containerDiv: HTMLDivElement;
    threeRefs: React.MutableRefObject<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        controls: OrbitControls;
        tileGroup: THREE.Group;
        hiResTileGroup: THREE.Group;
        midResTileGroup: THREE.Group;
        lowResTileGroup: THREE.Group;
        debugBox: THREE.Mesh;
    } | null>;
    cameraManager: any;
    isInitialAnimatingRef: React.MutableRefObject<boolean>;
    onMouseInfoUpdate: (info: MouseInfo) => void;
}

/**
 * Creates and manages all mouse and keyboard input handlers for the 3D map
 * Returns a dispose function to clean up event listeners
 */
export const createInputHandler = (config: InputHandlerConfig): (() => void) => {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    // Panning state
    let isPanning = false;
    let previousMousePosition = new THREE.Vector2();
    let currentTileGroupPosition = { x: 0, z: 0 };

    const onMouseDown = (event: MouseEvent): void => {
        if (event.button === 0 && config.threeRefs.current) {
            const { tileGroup } = config.threeRefs.current;
            isPanning = true;
            previousMousePosition = new THREE.Vector2(event.clientX, event.clientY);
            currentTileGroupPosition = { x: tileGroup.position.x, z: tileGroup.position.z };
            config.containerDiv.style.cursor = 'grabbing';
        }
    };

    const onMouseMove = (event: MouseEvent): void => {
        if (!config.threeRefs.current) return;
        
        const { camera, tileGroup, scene } = config.threeRefs.current;
        const rect = config.containerDiv.getBoundingClientRect();
        
        // Update mouse coordinates
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Raycast to get world position
        raycaster.setFromCamera(mouse, camera);
        const intersectPoint = new THREE.Vector3();
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        raycaster.ray.intersectPlane(plane, intersectPoint);
        
        const worldToMercator = { 
            x: intersectPoint.x + tileGroup.position.x, 
            z: intersectPoint.z - tileGroup.position.z 
        };
        const latLon = mercatorToLatLon(worldToMercator.x, worldToMercator.z);
        
        // Detect building under cursor
        const intersects = raycaster.intersectObjects(scene.children, true);
        let buildingName = '';
        for (const intersect of intersects) {
            let obj = intersect.object;
            while (obj.parent && !obj.userData?.buildingName) {
                obj = obj.parent;
            }
            if (obj.userData?.buildingName) {
                buildingName = obj.userData.buildingName;
                break;
            }
        }
        
        // Update mouse info
        config.onMouseInfoUpdate({
            building: buildingName || 'No building',
            mercatorX: worldToMercator.x,
            mercatorY: worldToMercator.z,
            latLon
        });
        
        // Handle panning
        if (!isPanning) return;
        
        const currentMousePosition = new THREE.Vector2(event.clientX, event.clientY);
        const deltaMousePosition = currentMousePosition.clone().sub(previousMousePosition);
        const panSpeed = camera.position.y * 2.5;
        
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        
        const rightVector = new THREE.Vector3();
        rightVector.crossVectors(cameraDirection, camera.up).normalize();
        
        const forwardVector = new THREE.Vector3(cameraDirection.x, 0, cameraDirection.z).normalize();
        
        const deltaX = (deltaMousePosition.x * panSpeed) / window.innerWidth;
        const deltaZ = (deltaMousePosition.y * panSpeed) / window.innerHeight;
        
        const movementX = rightVector.x * deltaX - forwardVector.x * deltaZ;
        const movementZ = rightVector.z * deltaX - forwardVector.z * deltaZ;
        
        const newPositionX = currentTileGroupPosition.x + movementX;
        const newPositionZ = currentTileGroupPosition.z + movementZ;
        
        tileGroup.position.set(newPositionX, tileGroup.position.y, newPositionZ);
        
        // Update current position for next frame
        currentTileGroupPosition.x = newPositionX;
        currentTileGroupPosition.z = newPositionZ;
        previousMousePosition = currentMousePosition;
    };

    const onMouseUp = (event: MouseEvent): void => {
        if (event.button === 0) {
            isPanning = false;
            config.containerDiv.style.cursor = 'grab';
        }
    };

    const onWheel = (event: WheelEvent): void => {
        if (config.isInitialAnimatingRef.current) return;
        config.cameraManager?.executeZoom(event.deltaY);
    };

    // Setup event listeners
    const setupEventListeners = (): void => {
        const { containerDiv } = config;
        
        containerDiv.addEventListener('mousedown', onMouseDown);
        containerDiv.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        containerDiv.addEventListener('wheel', onWheel);
    };

    // Setup listeners immediately
    setupEventListeners();

    // Return dispose function to clean up event listeners
    return (): void => {
        const { containerDiv } = config;
        containerDiv.removeEventListener('mousedown', onMouseDown);
        containerDiv.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        containerDiv.removeEventListener('wheel', onWheel);
    };
};
