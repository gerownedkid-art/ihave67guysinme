import * as THREE from 'three';
import { VoxelWorld, VOXEL } from './voxel.js';

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f);
  scene.fog = new THREE.FogExp2(0x0a0a0f, 0.012);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);

  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('glcanvas'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);

  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(12, 18, 8);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 2048;
  dir.shadow.mapSize.height = 2048;
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 60;
  dir.shadow.camera.left = -25;
  dir.shadow.camera.right = 25;
  dir.shadow.camera.top = 25;
  dir.shadow.camera.bottom = -25;
  scene.add(dir);

  const fill = new THREE.PointLight(0x4060ff, 0.35);
  fill.position.set(-10, 5, -10);
  scene.add(fill);

  const groundGeo = new THREE.PlaneGeometry(300, 300);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 0.85 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(300, 80, 0x1f1f33, 0x0e0e16);
  scene.add(grid);

  // voxel world
  const voxelWorld = new VoxelWorld(scene);
  // generate a destructible map: stone floor + dirt hill + structures
  const generateMap = () => {
    // stone slab base
    for (let z = -10; z <= 10; z++) {
      for (let x = -10; x <= 10; x++) {
        voxelWorld.setVoxel(x, 0, z, VOXEL.STONE);
      }
    }
    // dirt mound
    for (let y = 1; y <= 3; y++) {
      for (let z = -5; z <= 5; z++) {
        for (let x = -5; x <= 5; x++) {
          if (Math.abs(x) + Math.abs(z) + y <= 7) voxelWorld.setVoxel(x, y, z, VOXEL.DIRT);
        }
      }
    }
    // small concrete bunker
    for (let y = 1; y <= 3; y++) {
      for (let z = -3; z <= 3; z++) {
        for (let x = -3; x <= 3; x++) {
          if (x === -3 || x === 3 || z === -3 || z === 3 || y === 3) voxelWorld.setVoxel(x, y, z, VOXEL.CONCRETE);
        }
      }
    }
  };
  generateMap();

  return { scene, camera, renderer, voxelWorld };
}
