import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
//import { getContractConfig } from '@/utils/contractIdManager';

/**
 * Creates and configures a GLTF loader with authentication headers
 */
export const createGLTFLoaderWithAuth = (): GLTFLoader => {
  const accessToken = localStorage.getItem('access_token');
  const requestHeaders: Record<string, string> = {
    'X-Client-Type': 'Web',
    'Accept': '*/*'
  };

  if (accessToken) {
    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  //const contractConfig = getContractConfig();
  //const finalHeaders = {
    //...contractConfig.headers,
    //...requestHeaders
  //};

  // Create file loader with headers
  const fileLoader = new THREE.FileLoader();
//  fileLoader.setRequestHeader(finalHeaders);
  fileLoader.setResponseType('arraybuffer');

  // Create GLTF loader
  const gltfLoader = new GLTFLoader();
  gltfLoader.manager = new THREE.LoadingManager();
  gltfLoader.manager.setURLModifier((url: string) => url);

  // Override load method to use custom file loader with headers
  gltfLoader.load = function (
    url: string,
    onLoad?: (gltf: any) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: any) => void
  ) {
    fileLoader.load(
      url,
      (data) => {
        this.parse(
          data,
          '',
          (gltf: any) => {
            onLoad?.(gltf);
          },
          onError
        );
      },
      onProgress,
      onError
    );
  };

  return gltfLoader;
};
