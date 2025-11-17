import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { latLonToMercator } from '../utils/geoUtils';

interface ModelConfig {
    name: string;
    path: string;
    coordinates: {
        lat: number;
        lon: number;
    };
    position?: {
        offsetX?: number;
        offsetY?: number;
        offsetZ?: number;
    };
    rotation: {
        y: number;
    };
    scale: {
        x: number;
        y: number;
        z: number;
    };
    material: {
        metalness: number;
        roughness: number;
        envMapIntensity: number;
        clearcoat?: number;
        clearcoatRoughness?: number;
        emissive?: {
            useMap: boolean;
            intensity: number;
        };
    };
}

interface ModelsConfig {
    models: ModelConfig[];
}

export interface ModelsManagerConfig {
    baseURL: string;
    tileGroup: THREE.Group;
    gltfLoader: GLTFLoader;
    getHeaders: () => Record<string, string>;
    modelLoadedRef: React.MutableRefObject<boolean>;
}

/**
 * Apply material properties to a mesh material
 */
const applyMaterialProperties = (material: any, materialConfig: ModelConfig['material']): void => {
        if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) return;
        
        material.metalness = materialConfig.metalness;
        material.roughness = materialConfig.roughness;
        material.envMapIntensity = materialConfig.envMapIntensity;
        
        if (material.isMeshPhysicalMaterial) {
            if (materialConfig.clearcoat !== null && materialConfig.clearcoat !== undefined) {
                material.clearcoat = materialConfig.clearcoat;
            }
            if (materialConfig.clearcoatRoughness !== null && materialConfig.clearcoatRoughness !== undefined) {
                material.clearcoatRoughness = materialConfig.clearcoatRoughness;
            }
        }
        
        if (materialConfig.emissive) {
            if (material.color) {
                material.emissive = material.color.clone();
            }
            if (materialConfig.emissive.useMap) {
                material.emissiveMap = material.map;
            }
            material.emissiveIntensity = materialConfig.emissive.intensity;
        }
        
    material.needsUpdate = true;
};

/**
 * Load all models from the 3d-models-config.json file
 */
export const loadModelsFromConfig = async (config: ModelsManagerConfig): Promise<void> => {
    try {
        const response = await fetch('/3d-models-config.json');
        const modelsConfig: ModelsConfig = await response.json();
        
        modelsConfig.models.forEach((modelConfig: ModelConfig) => {
            const encodedPath = encodeURIComponent(modelConfig.path);
            const glbUrl = `${config.baseURL}/api/v1/ThreeD/GetB3dmTiles?tilesetPath=${encodedPath}`;
            const mercator = latLonToMercator(modelConfig.coordinates.lat, -modelConfig.coordinates.lon);
            
            config.gltfLoader.load(
                glbUrl,
                (gltf: any) => {
                    gltf.scene.traverse((child: any) => {
                        if (child.isMesh && child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach((mat: any) => {
                                    applyMaterialProperties(mat, modelConfig.material);
                                });
                            } else {
                                applyMaterialProperties(child.material, modelConfig.material);
                            }
                        }
                    });

                    // Apply position with offsets from config
                    gltf.scene.position.set(
                        -mercator.x + (modelConfig.position?.offsetX || 0),
                        modelConfig.position?.offsetY || 0,
                        -mercator.y + (modelConfig.position?.offsetZ || 0)
                    );
                    gltf.scene.rotation.y = modelConfig.rotation.y * (Math.PI / 180);
                    gltf.scene.scale.set(
                        modelConfig.scale.x,
                        modelConfig.scale.y,
                        modelConfig.scale.z
                    );
                    
                    // Store the Y position with offset for animations
                    const configuredY = modelConfig.position?.offsetY || 0;
                    gltf.scene.userData = { 
                        buildingName: modelConfig.name,
                        originalY: configuredY  // Store the configured offset Y
                    };
                    
                    gltf.scene.visible = false;
                    config.tileGroup.add(gltf.scene);
                },
                undefined,
                (error: any) => {
                    console.error(`Error loading model ${modelConfig.name}:`, error);
                    config.modelLoadedRef.current = false;
                }
            );
        });
    } catch (error) {
        console.error('Error loading 3D models configuration:', error);
    }
};
