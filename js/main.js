import * as THREE from 'three';
import { createWorld } from './world.js';
import { Dummy } from './dummy.js';
import { Weapon, castShots, spawnMuzzleFlash, spawnShellEject } from './weapons.js';

const canvas = document.getElementById('glcanvas');
const { scene, camera, renderer } = createWorld();

const weapon = new Weapon(camera, canvas);
scene.add(weapon.mesh);
scene.add(weapon.muzzleLight);

const dummies = [];
let pointerLocked = false;
let isXray = false;

const move = { forward: 0, right: 0 };
const keys = {};
const vel = new THREE.Vector3();
const TEMP_RAY = new THREE.Raycaster();
const playerPos = new THREE.Vector3(0, 1.6, 3);
const playerYaw = 0;

const UI = {
  weaponName: document.getElementById('weaponName'),
  ammo: document.getElementById('ammo'),
  xrayMode: document.getElementById('xrayMode'),
  dummyCount: document.getElementById('dummyCount'),
  overlay: document.getElementById('overlay'),
  startBtn: document.getElementById('startBtn'),
};

// ---------- input ----------

function onPointerLockChange() {
  pointerLocked = document.pointerLockElement === canvas;
  document.getElementById('lockHint')?.classList.toggle('hidden', pointerLocked);
}
document.addEventListener('pointerlockchange', onPointerLockChange);

canvas.addEventListener('click', () => {
  if (!pointerLocked) canvas.requestPointerLock();
});

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyN') spawnDummy();
  if (e.code === 'KeyC') clearDummies();
  if (e.code === 'KeyX') toggleXray();
  if (e.code === 'KeyE') grabWound();
  if (e.code === 'KeyR') resetRagdolls();
  if (e.code === 'Digit1') weapon.setType('pistol');
  if (e.code === 'Digit2') weapon.setType('shotgun');
  if (e.code === 'KeyR' && e.ctrlKey) weapon.reload();
  updateHUD();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

window.addEventListener('mousedown', e => {
  if (!pointerLocked || e.button !== 0) return;
  const now = performance.now();
  const results = weapon.fire(now);
  if (!results) return;
  spawnMuzzleFlash(weapon, scene);
  spawnShellEject(weapon, scene);
  castShots(results, dummies, scene, (dummy, point, normal) => {
    dummy.applyDamage(point, normal, weapon.type === 'shotgun' ? 34 : 22, weapon.type);
  });
  updateHUD();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- dummy spawning ----------

const MAX_DUMMIES = 6;

function spawnDummy() {
  if (dummies.length >= MAX_DUMMIES) return;
  const angle = Math.random() * Math.PI * 2;
  const dist = 3 + Math.random() * 4;
  const x = playerPos.x + Math.sin(angle) * dist;
  const z = playerPos.z + Math.cos(angle) * dist;
  const d = new Dummy(scene, x, 0.6, z);
  dummies.push(d);
  updateHUD();
  console.log('[dummy] spawned, vertices:', d.vertexCount);
}

function clearDummies() {
  dummies.forEach(d => d.dispose());
  dummies.length = 0;
  updateHUD();
}

function toggleXray() {
  isXray = !isXray;
  dummies.forEach(d => d.setXray(isXray));
  UI.xrayMode.textContent = `X-RAY: ${isXray ? 'ON' : 'OFF'}`;
  UI.xrayMode.style.color = isXray ? '#00d9ff' : '#8a8aa0';
}

function grabWound() {
  // grab nearest wound under crosshair
  TEMP_RAY.set(camera.position, new THREE.Vector3());
  camera.getWorldDirection(TEMP_RAY.ray.direction);
  let best = null; let md = 6;
  dummies.forEach(d => {
    d.wounds.forEach(w => {
      const d2 = TEMP_RAY.ray.distanceToPoint(w.pos);
      if (d2 < md && d2 < 0.35) { md = d2; best = { dummy: d, wound: w }; }
    });
  });
  if (best) {
    best.dummy.grab(best.wound.pos);
  }
}

function resetRagdolls() {
  dummies.forEach(d => {
    d.health = 100;
    d.dead = false;
    d.ragdoll.parts.forEach(p => {
      // reset positions roughly upright
    });
  });
}

// ---------- player movement ----------

const TEMP_DIR = new THREE.Vector3();
const TEMP_RIGHT = new THREE.Vector3();

function updatePlayer(dt) {
  const speed = 6.2;
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'] ? 1.6 : 1;
  const moveSpeed = speed * sprint * dt;
  camera.getWorldDirection(TEMP_DIR); TEMP_DIR.y = 0; TEMP_DIR.normalize();
  TEMP_RIGHT.crossVectors(TEMP_DIR, new THREE.Vector3(0, 1, 0)).normalize();

  let dx = 0, dz = 0;
  if (keys['KeyW']) { dz -= moveSpeed; }
  if (keys['KeyS']) { dz += moveSpeed; }
  if (keys['KeyA']) { dx -= moveSpeed; }
  if (keys['KeyD']) { dx += moveSpeed; }

  playerPos.addScaledVector(TEMP_DIR, dz);
  playerPos.addScaledVector(TEMP_RIGHT, dx);
  playerPos.y = 1.6;
  camera.position.copy(playerPos);
}

// ---------- loop ----------

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  weapon.update(dt);
  updatePlayer(dt);
  dummies.forEach(d => d.step(dt));
  renderer.render(scene, camera);
  updateHUD();
}

function updateHUD() {
  UI.weaponName.textContent = weapon.type.toUpperCase();
  UI.ammo.textContent = weapon.getAmmoText();
  UI.dummyCount.textContent = `DUMMIES: ${dummies.length}`;
}

// ---------- start ----------

UI.startBtn.addEventListener('click', () => {
  UI.overlay.classList.add('hidden');
  canvas.requestPointerLock();
  animate();
});

updateHUD();
