import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Creates and configures the sky
 */
export const createSky = (scene: THREE.Scene): Sky => {
  const sky = new Sky();
  sky.scale.setScalar(15000000);
  sky.userData = { isSky: true };
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 10;
  skyUniforms['rayleigh'].value = 3;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.7;

  const sun = new THREE.Vector3();
  const elevation = 2;
  const azimuth = 180;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sun.setFromSphericalCoords(1, phi, theta);
  skyUniforms['sunPosition'].value.copy(sun);

  return sky;
};

/**
 * Creates and adds lights to the scene
 */
export const createLights = (scene: THREE.Scene): void => {
  if (!scene.getObjectByName('MainAmbientLight')) {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    ambientLight.name = 'MainAmbientLight';
    scene.add(ambientLight);
  }

  if (!scene.getObjectByName('MainDirectionalLight')) {
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.35);
    directionalLight.position.set(100000, 100000, 100000);
    directionalLight.name = 'MainDirectionalLight';
    directionalLight.castShadow = false;
    scene.add(directionalLight);
  }

  if (!scene.getObjectByName('FillLight')) {
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.15);
    fillLight.position.set(-1000, 500, -1000);
    fillLight.name = 'FillLight';
    fillLight.castShadow = false;
    scene.add(fillLight);
  }
};

/**
 * Creates the camera with specified parameters
 */
export const createCamera = (
  width: number,
  height: number,
  initialHeight: number
): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100000000);
  camera.position.set(0, initialHeight, 0);
  camera.lookAt(0, 0, 0);
  return camera;
};

/**
 * Creates and configures the renderer
 */
export const createRenderer = (container: HTMLDivElement): THREE.WebGLRenderer => {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    logarithmicDepthBuffer: true,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
    alpha: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.2));
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = 'srgb';
  renderer.sortObjects = false;
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  return renderer;
};

/**
 * Creates orbit controls with specified settings
 */
export const createControls = (
  camera: THREE.Camera,
  domElement: HTMLElement,
  onControlsChange: () => void
): OrbitControls => {
  const controls = new OrbitControls(camera, domElement);
  controls.minDistance = 250;
  controls.maxDistance = 10000000;
  controls.enableRotate = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = false;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.5;
  controls.mouseButtons = {
    LEFT: null,
    RIGHT: THREE.MOUSE.ROTATE,
    MIDDLE: null
  };
  controls.addEventListener('change', onControlsChange);

  return controls;
};

/**
 * Creates tile groups (hi, mid, low res)
 */
export const createTileGroups = (
  scene: THREE.Scene,
  initialMercator: { x: number; y: number }
): {
  tileGroup: THREE.Group;
  hiResTileGroup: THREE.Group;
  midResTileGroup: THREE.Group;
  lowResTileGroup: THREE.Group;
} => {
  const tileGroup = new THREE.Group();
  tileGroup.position.set(-initialMercator.x, 0, initialMercator.y);

  const hiResTileGroup = new THREE.Group();
  const midResTileGroup = new THREE.Group();
  const lowResTileGroup = new THREE.Group();

  tileGroup.add(hiResTileGroup, midResTileGroup, lowResTileGroup);
  scene.add(tileGroup);

  return { tileGroup, hiResTileGroup, midResTileGroup, lowResTileGroup };
};

/**
 * Creates the ground plane
 */
export const createGroundPlane = (scene: THREE.Scene): THREE.Mesh => {
  const planeSize = 5000000;
  const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0xf8f6f5,
    side: THREE.DoubleSide,
    transparent: false,
    fog: false
  });

  const groundPlane = new THREE.Mesh(planeGeometry, planeMaterial);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -100;
  groundPlane.name = 'WhiteGroundPlane';
  groundPlane.receiveShadow = false;
  groundPlane.castShadow = false;
  scene.add(groundPlane);

  return groundPlane;
};

/**
 * Sets up environment mapping
 */
export const setupEnvironment = async (
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  onComplete?: () => void
): Promise<void> => {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const skyRenderTarget = pmremGenerator.fromScene(scene, 0.04);
  scene.environment = skyRenderTarget.texture;

  // Try to load HDR environment
  try {
    const rgbeLoader = new RGBELoader();
    const RGBETexture = await new Promise<THREE.DataTexture>((resolve, reject) => {
      rgbeLoader.load('/qwantani_afternoon_puresky_1k.hdr', resolve, undefined, reject);
    });

    const pmremGen = new THREE.PMREMGenerator(renderer);
    const envMap = pmremGen.fromEquirectangular(RGBETexture);
    scene.environment = envMap.texture;

    RGBETexture.dispose();
    pmremGen.dispose();
  } catch (error) {
    // Fallback to sky-based environment
    scene.environment = skyRenderTarget.texture;
  }

  pmremGenerator.dispose();
  onComplete?.();
};
