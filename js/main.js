import * as THREE from 'three';
import { createWorld } from './world.js';
import { Dummy } from './dummy.js';
import { Weapon, castShots, spawnMuzzleFlash, spawnShellEject, WEAPONS } from './weapons.js';
import { VoxelWorld, VOXEL } from './voxel.js';
import { LiquidSystem } from './liquid.js';
import { TraumaSystem } from './trauma.js';
import { SpawnEngine, Prop } from './spawn.js';
import { JointManipulator, MachineBuilder } from './joints.js';

const canvas = document.getElementById('glcanvas');
const { scene, camera, renderer, voxelWorld } = createWorld();

const weapon = new Weapon(camera, canvas);
scene.add(weapon.mesh);
scene.add(weapon.muzzleLight);

const trauma = new TraumaSystem(scene);
const spawn = new SpawnEngine(scene, camera, voxelWorld);

const water = new LiquidSystem(scene, { color: 0x2a6a9a, opacity: 0.85, transmission: 0.9 });
const bloodLiquid = new LiquidSystem(scene, { color: 0x6a0a0a, opacity: 0.95 });

const dummies = [];
const props = [];
let pointerLocked = false;
let isXray = false;
let grabMode = false;
let buildWire = false;
let liquidType = 'water';
const wireAnchors = [];
const wires = [];

const keys = {};
const playerPos = new THREE.Vector3(0, 1.6, 3);

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
  if (e.code === 'KeyE') toggleGrab();
  if (e.code === 'KeyR' && !e.ctrlKey) resetRagdolls();
  if (e.code === 'Digit1') weapon.setType('pistol');
  if (e.code === 'Digit2') weapon.setType('shotgun');
  if (e.code === 'Digit3') weapon.setType('rifle');
  if (e.code === 'Digit4') weapon.setType('sniper');
  if (e.code === 'Digit5') weapon.setType('smg');
  if (e.code === 'KeyR' && e.ctrlKey) weapon.reload();
  if (e.code === 'KeyP') spawnProp('crate');
  if (e.code === 'KeyB') spawnProp('barrel');
  if (e.code === 'KeyV') spawnProp('concreteBlock');
  if (e.code === 'KeyG') spawnProp('glassPane');
  if (e.code === 'KeyM') spawnProp('metalBeam');
  if (e.code === 'KeyL') spawnLiquid();
  if (e.code === 'KeyJ') toggleWire();
  if (e.code === 'KeyK') clearWires();
  if (e.code === 'Key1' && e.ctrlKey) { liquidType = 'water'; updateHUD(); }
  if (e.code === 'Key2' && e.ctrlKey) { liquidType = 'blood'; updateHUD(); }
  updateHUD();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

window.addEventListener('mousedown', e => {
  if (!pointerLocked) return;
  if (e.button === 0) {
    if (grabMode) grabUnderCrosshair();
    else if (buildWire) placeWireAnchor();
    else fireWeapon();
  } else if (e.button === 2 && buildWire) {
    connectLastWire();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- entities ----------

function spawnDummy() {
  const angle = Math.random() * Math.PI * 2;
  const dist = 3 + Math.random() * 4;
  const x = playerPos.x + Math.sin(angle) * dist;
  const z = playerPos.z + Math.cos(angle) * dist;
  const d = new Dummy(scene, x, 0.6, z);
  trauma.registerDummy(d);
  dummies.push(d);
  updateHUD();
}

function clearDummies() {
  dummies.forEach(d => d.dispose());
  dummies.length = 0;
  updateHUD();
}

function spawnProp(type) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 4 + Math.random() * 3;
  const x = playerPos.x + Math.sin(angle) * dist;
  const z = playerPos.z + Math.cos(angle) * dist;
  const p = new Prop(scene, type, x, 1.2, z, voxelWorld);
  props.push(p);
  updateHUD();
}

function spawnLiquid() {
  const angle = Math.random() * Math.PI * 2;
  const dist = 3 + Math.random() * 2;
  const x = playerPos.x + Math.sin(angle) * dist;
  const z = playerPos.z + Math.cos(angle) * dist;
  const ls = liquidType === 'water' ? water : bloodLiquid;
  ls.spawn(x, 2.2, z, 40, new THREE.Vector3(0, 6, 0));
}

function toggleGrab() { grabMode = !grabMode; updateHUD(); }
function toggleWire() { buildWire = !buildWire; updateHUD(); }

function placeWireAnchor() {
  const raycaster = new THREE.Raycaster();
  raycaster.ray.origin.copy(camera.position);
  camera.getWorldDirection(raycaster.ray.direction);
  const target = new THREE.Vector3().copy(raycaster.ray.direction).multiplyScalar(10).add(camera.position);
  const geo = new THREE.SphereGeometry(0.07, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0x00d9ff });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(target);
  scene.add(mesh);
  wireAnchors.push({ mesh, pos: target.clone() });
  if (wireAnchors.length >= 2) connectLastWire();
}

function connectLastWire() {
  if (wireAnchors.length < 2) return;
  const a = wireAnchors[wireAnchors.length - 2];
  const b = wireAnchors[wireAnchors.length - 1];
  const wire = new WireClass(a.pos, b.pos, 6, 0.5);
  wires.push(wire);
}

function clearWires() {
  wires.forEach(w => w.dispose && w.dispose());
  wires.length = 0;
  wireAnchors.forEach(a => { scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose(); });
  wireAnchors.length = 0;
}

// Simple rope/wire used for machine building
class WireClass {
  constructor(start, end, segments, restSegLen) {
    this.parts = [];
    this.constraints = [];
    this.anchors = { start: start.clone(), end: end.clone() };
    this.build(start, end, segments, restSegLen);
  }
  build(start, end, segments, restSegLen) {
    const step = new THREE.Vector3().subVectors(end, start).divideScalar(segments);
    let cur = start.clone();
    for (let i = 0; i <= segments; i++) {
      const staticEnd = (i === 0 || i === segments);
      const part = {
        pos: cur.clone(), prevPos: cur.clone(),
        invMass: staticEnd ? 0 : 1,
        applyImpulse(v) { if (this.invMass === 0) return; this.pos.add(v); this.prevPos.add(v); },
      };
      this.parts.push(part);
      if (i > 0) {
        this.constraints.push({ a: this.parts[i-1], b: part, restLength: restSegLen, stiffness: 1.0, broken: false });
      }
      cur.add(step);
    }
  }
  update(dt) {
    this.parts.forEach((p, i) => {
      if (i === 0 || i === this.parts.length - 1) return;
      const vel = new THREE.Vector3().subVectors(p.pos, p.prevPos).multiplyScalar(0.99);
      p.prevPos.copy(p.pos);
      p.pos.addScaledVector(vel, dt);
      p.pos.addScaledVector(new THREE.Vector3(0, -28, 0), dt * dt);
    });
    for (let it = 0; it < 8; it++) {
      this.parts[0].pos.copy(this.anchors.start);
      this.parts[this.parts.length-1].pos.copy(this.anchors.end);
      this.constraints.forEach(c => {
        if (c.broken) return;
        const d = new THREE.Vector3().subVectors(c.b.pos, c.a.pos);
        const dist = d.length();
        if (dist === 0) return;
        const diff = (dist - c.restLength) / dist;
        const off = d.clone().multiplyScalar(diff * c.stiffness / (c.a.invMass + c.b.invMass));
        if (c.a.invMass > 0) c.a.pos.sub(off.clone().multiplyScalar(c.a.invMass));
        if (c.b.invMass > 0) c.b.pos.add(off.clone().multiplyScalar(c.b.invMass));
      });
    }
  }
  dispose() {}
}

function grabUnderCrosshair() {
  const raycaster = new THREE.Raycaster();
  raycaster.ray.origin.copy(camera.position);
  camera.getWorldDirection(raycaster.ray.direction);
  let best = null, md = 12;
  dummies.forEach(d => {
    d.ragdoll.parts.forEach(p => {
      const dist = raycaster.ray.distanceToPoint(p.pos);
      if (dist < 0.4 && dist < md) { md = dist; best = { kind: 'dummy', dummy: d, part: p, pos: p.pos.clone() }; }
    });
  });
  props.forEach(p => {
    const dist = raycaster.ray.distanceToPoint(p.pos);
    if (dist < 0.8 && dist < md) { md = dist; best = { kind: 'prop', prop: p, pos: p.pos.clone() }; }
  });
  if (best) {
    if (best.kind === 'dummy') best.dummy.grab(best.pos);
    else { best.prop._grabbing = true; best.prop._grabTarget = best.pos; }
  }
}

function releaseGrab() {
  dummies.forEach(d => d.release());
  props.forEach(p => { p._grabbing = false; p._grabTarget = null; });
}
window.addEventListener('mouseup', e => { if (e.button === 0) releaseGrab(); });

function fireWeapon() {
  const now = performance.now();
  const results = weapon.fire(now);
  if (!results) return;
  spawnMuzzleFlash(weapon, scene);
  spawnShellEject(weapon, scene);
  const targets = dummies.map(d => d).concat(props.map(p => p));
  castShots(results, targets, scene, (target, point, normal) => {
    if (target.applyDamage) target.applyDamage(point, normal, weapon.cfg.damage, weapon.type);
    voxelWorld.explode(point.x, point.y, point.z, 1.4, weapon.cfg.damage * 1.5);
  });
  updateHUD();
}

function toggleXray() {
  isXray = !isXray;
  dummies.forEach(d => d.setXray(isXray));
  UI.xrayMode.textContent = `X-RAY: ${isXray ? 'ON' : 'OFF'}`;
  UI.xrayMode.style.color = isXray ? '#00d9ff' : '#8a8aa0';
}

function resetRagdolls() {
  dummies.forEach(d => { d.health = 100; d.dead = false; });
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
let wireLine = null;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  weapon.update(dt);
  updatePlayer(dt);

  voxelWorld.update();
  water.step(dt);
  bloodLiquid.step(dt);

  dummies.forEach(d => d.step(dt));
  props.forEach(p => {
    p.step(dt);
    if (p._grabbing && p._grabTarget) {
      const dir = new THREE.Vector3().subVectors(p._grabTarget, p.pos);
      p.vel.addScaledVector(dir.normalize().multiplyScalar(Math.min(dir.length()*12, 30)), dt);
    }
  });
  wires.forEach(w => w.update(dt));

  updateWireLines();

  renderer.render(scene, camera);
  updateHUD();
}

function updateWireLines() {
  if (!wireLine) {
    wireLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x00d9ff }));
    scene.add(wireLine);
  }
  const pts = [];
  wires.forEach(w => {
    w.parts.forEach(p => pts.push(p.pos.x, p.pos.y, p.pos.z));
    pts.push(NaN, NaN, NaN);
  });
  wireLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}

function updateHUD() {
  UI.weaponName.textContent = weapon.type.toUpperCase();
  UI.ammo.textContent = weapon.getAmmoText();
  UI.xrayMode.textContent = `X-RAY: ${isXray ? 'ON' : 'OFF'}`;
  UI.dummyCount.textContent = `DUMMIES: ${dummies.length} | PROPS: ${props.length} | LIQUID: ${liquidType.toUpperCase()}`;
}

// ---------- start ----------

UI.startBtn.addEventListener('click', () => {
  UI.overlay.classList.add('hidden');
  canvas.requestPointerLock();
  animate();
});

updateHUD();
