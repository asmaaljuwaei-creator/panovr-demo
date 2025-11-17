import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraMode = 'orbit' | 'firstPerson' | 'locked';

export interface CameraControlManager {
    setMode: (mode: CameraMode, position?: THREE.Vector3) => void;
    isFirstPerson: () => boolean;
    getMode: () => CameraMode;
    enforceCameraLock: () => void;
    executeZoom: (deltaY: number) => void;
    getIntersection: (event: MouseEvent) => { point: THREE.Vector3; object: THREE.Object3D } | null;
    dispose: () => void;
}

/**
 * Creates and manages camera controls and modes for the 3D map
 * Returns a manager object with all camera control methods
 */
export const createCameraControlManager = (
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer
): CameraControlManager => {
    // State variables (closure-based)
    let mode: CameraMode = 'orbit';
    let lockedPosition: THREE.Vector3 | null = null;
    let lockedTarget: THREE.Vector3 | null = null;

    // First-person mode state
    let isRightMouseDown = false;
    let previousMousePosition = { x: 0, y: 0 };
    let yaw = 0; // Horizontal rotation
    let pitch = 0; // Vertical rotation
    const MIN_PITCH = -Math.PI / 3; // -60 degrees
    const MAX_PITCH = Math.PI / 3; // +60 degrees

    // Event handlers
    const onMouseDown = (event: MouseEvent): void => {
        if (event.button === 2 && mode === 'firstPerson') {
            // Right mouse button
            isRightMouseDown = true;
            previousMousePosition = { x: event.clientX, y: event.clientY };
            event.preventDefault();
        }
    };

    const onMouseMove = (event: MouseEvent): void => {
        if (isRightMouseDown && mode === 'firstPerson') {
            const deltaX = event.clientX - previousMousePosition.x;
            const deltaY = event.clientY - previousMousePosition.y;

            const sensitivity = 0.002;
            yaw -= deltaX * sensitivity;
            pitch -= deltaY * sensitivity;

            // Clamp pitch
            pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));

            updateFirstPersonCamera();

            previousMousePosition = { x: event.clientX, y: event.clientY };
            event.preventDefault();
        }
    };

    const onMouseUp = (event: MouseEvent): void => {
        if (event.button === 2) {
            isRightMouseDown = false;
        }
    };

    const onWheel = (event: WheelEvent): void => {
        if (mode === 'firstPerson') {
            // Disable scroll/zoom in first-person mode
            event.preventDefault();
            event.stopPropagation();
        }
    };

    const updateFirstPersonCamera = (): void => {
        if (!lockedPosition) return;

        // Calculate look direction from yaw and pitch
        const direction = new THREE.Vector3(
            Math.cos(pitch) * Math.sin(yaw),
            Math.sin(pitch),
            Math.cos(pitch) * Math.cos(yaw)
        );

        // Update camera target
        const newTarget = lockedPosition.clone().add(direction.multiplyScalar(100));
        controls.target.copy(newTarget);
        camera.lookAt(newTarget);
    };

    const setupEventListeners = (): void => {
        const canvas = renderer.domElement;

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('wheel', onWheel);
    };

    // Setup event listeners immediately
    setupEventListeners();

    // Return manager object with all methods
    return {
        /**
         * Set camera mode
         */
        setMode: (newMode: CameraMode, position?: THREE.Vector3): void => {
            mode = newMode;

            switch (newMode) {
                case 'orbit':
                    controls.enabled = true;
                    controls.enableRotate = true;
                    controls.enableZoom = true;
                    lockedPosition = null;
                    lockedTarget = null;
                    break;

                case 'firstPerson':
                    if (position) {
                        lockedPosition = position.clone();
                        camera.position.copy(position);

                        // Calculate initial yaw and pitch from current camera direction
                        const direction = new THREE.Vector3();
                        camera.getWorldDirection(direction);
                        yaw = Math.atan2(direction.x, direction.z);
                        pitch = Math.asin(direction.y);

                        updateFirstPersonCamera();
                    }

                    // Disable orbit controls rotation and zoom
                    controls.enableRotate = false;
                    controls.enableZoom = false;
                    break;

                case 'locked':
                    if (position) {
                        lockedPosition = position.clone();
                        lockedTarget = controls.target.clone();
                    }
                    controls.enabled = false;
                    break;
            }
        },

        /**
         * Check if in first-person mode
         */
        isFirstPerson: (): boolean => {
            return mode === 'firstPerson';
        },

        /**
         * Get current mode
         */
        getMode: (): CameraMode => {
            return mode;
        },

        /**
         * Enforce camera lock (for locked mode)
         */
        enforceCameraLock: (): void => {
            if (mode === 'locked' && lockedPosition && lockedTarget) {
                camera.position.copy(lockedPosition);
                controls.target.copy(lockedTarget);
            } else if (mode === 'firstPerson' && lockedPosition) {
                camera.position.copy(lockedPosition);
            }
        },

        /**
         * Smooth zoom toward/away from target, matching existing app behavior
         */
        executeZoom: (deltaY: number): void => {
            const speed = 0.5 + Math.pow(camera.position.y / 1000000, 0.5);
            const dollyScale = Math.pow(0.95, -deltaY * 0.03 * speed);
            const target = controls.target;
            const newCameraPosition = new THREE.Vector3().subVectors(camera.position, target);
            newCameraPosition.multiplyScalar(dollyScale);
            newCameraPosition.add(target);
            const newClampedY = Math.max(225, Math.min(10000000, newCameraPosition.y));
            camera.position.set(newCameraPosition.x, newClampedY, newCameraPosition.z);
            controls.update();
        },

        /**
         * Get intersection point with map (for click detection)
         */
        getIntersection: (event: MouseEvent): { point: THREE.Vector3; object: THREE.Object3D } | null => {
            const rect = renderer.domElement.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);

            const intersects = raycaster.intersectObjects(scene.children, true);

            // Filter out all analysis visualizations and markers
            const validIntersects = intersects.filter((intersect) => {
                let obj = intersect.object;
                while (obj) {
                    if (
                        // Generic analysis flags
                        obj.userData?.isAnalysisMarker ||
                        obj.userData?.isAnalysisLine ||
                        obj.userData?.isAnalysisVisualization ||
                        // Viewshed specific
                        obj.userData?.isViewshedVisualization ||
                        obj.userData?.isViewshedMarker ||
                        // Line of Sight specific
                        obj.userData?.isLineOfSightMarker ||
                        obj.userData?.isLineOfSightPlane ||
                        obj.userData?.isLineOfSightHitSphere ||
                        // Visibility Dome specific
                        obj.userData?.isVisibilityVisualization ||
                        obj.userData?.isVisibilityMarker
                    ) {
                        return false;
                    }
                    obj = obj.parent as THREE.Object3D;
                }
                return true;
            });

            if (validIntersects.length > 0) {
                return {
                    point: validIntersects[0].point,
                    object: validIntersects[0].object,
                };
            }

            return null;
        },

        /**
         * Cleanup event listeners
         */
        dispose: (): void => {
            const canvas = renderer.domElement;
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('wheel', onWheel);
        }
    };
};
