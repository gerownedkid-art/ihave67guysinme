import * as THREE from 'three';

export const PROPS = {
  crate: { size: [1,1,1], color: 0x8b5a2b, hardness: 25, mass: 8 },
  barrel: { size: [0.7,1.1,0.7], color: 0x5a2a00, hardness: 20, mass: 6 },
  concreteBlock: { size: [1.2,1.2,1.2], color: 0x88888e, hardness: 45, mass: 20 },
  glassPane: { size: [1,1,0.15], color: 0xadd8e6, hardness: 5, mass: 2, transparent: true },
  metalBeam: { size: [2,0.3,0.3], color: 0x6e6e7a, hardness: 100, mass: 14 },
};

// A prop: a rigid body (single part) with physics, health, and destructibility.
export class Prop {
  constructor(scene, type, x, y, z, voxelWorld) {
    this.scene = scene;
    this.voxelWorld = voxelWorld;
    this.type = type;
    const def = PROPS[type] || PROPS.crate;
    this.def = def;
    this.health = 100;
    this.hardness = def.hardness;
    this.mass = def.mass;
    this.dead = false;

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    scene.add(this.group);

    this.parts = [];
    this.buildMesh();

    // physics state (verlet single body approximated as point + orientation)
    this.pos = new THREE.Vector3(x, y, z);
    this.prevPos = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.invMass = 1 / this.mass;
    this.radius = Math.max(...def.size) * 0.6;

    this.constraints = []; // joints to other props/wires
  }

  buildMesh() {
    const def = this.def;
    const [sx, sy, sz] = def.size;
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: 0.8,
      metalness: def.transparent ? 0 : 0.4,
      transparent: !!def.transparent,
      opacity: def.transparent ? 0.55 : 1,
      transmission: def.transparent ? 0.85 : 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.mesh = mesh;
    this.parts.push(mesh);

    // break into chunks when destroyed
    this.chunkGeos = [];
    const cx = Math.ceil(sx / 0.4), cy = Math.ceil(sy / 0.4), cz = Math.ceil(sz / 0.4);
    for (let iy = 0; iy < cy; iy++) {
      for (let ix = 0; ix < cx; ix++) {
        for (let iz = 0; iz < cz; iz++) {
          const cg = new THREE.BoxGeometry(0.38, 0.38, 0.38);
          const cm = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.8, metalness: 0.4 });
          const cmesh = new THREE.Mesh(cg, cm);
          cmesh.position.set((ix - cx/2)*0.4 + 0.2, (iy - cy/2)*0.4 + 0.2, (iz - cz/2)*0.4 + 0.2);
          this.chunkGeos.push({ mesh: cmesh, geo: cg, mat: cm });
        }
      }
    }
  }

  applyDamage(damage, hitPoint, hitNormal) {
    if (this.dead) return;
    this.health -= damage;
    const dir = hitNormal.clone().negate();
    this.vel.addScaledVector(dir, damage * 0.6);
    // blood-like sparks for metal/wood
    if (this.health <= 0) this.destroy(hitPoint);
  }

  destroy(hitPoint) {
    if (this.dead) return;
    this.dead = true;
    // hide main mesh, spawn chunks
    this.mesh.visible = false;
    const center = this.group.position.clone();
    this.chunkGeos.forEach(c => {
      const m = c.mesh.clone();
      m.material = c.mat.clone();
      m.position.copy(this.group.position).add(c.mesh.position);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      const dir = new THREE.Vector3().subVectors(m.position, hitPoint || center).normalize();
      const vel = dir.multiplyScalar(6 + Math.random() * 8);
      const angular = new THREE.Vector3(Math.random()*4, Math.random()*4, Math.random()*4);
      this.voxelWorld.debris.push({ mesh: m, geo: c.geo, mat: c.mat, vel, angular, life: 6 + Math.random()*4, isPropChunk: true, disposeAssets: false });
    });
  }

  step(dt) {
    if (this.dead) return;
    const gravity = new THREE.Vector3(0, -28, 0);
    this.vel.addScaledVector(gravity, dt);
    this.vel.multiplyScalar(0.97);
    this.pos.addScaledVector(this.vel, dt);
    this.group.position.copy(this.pos);
    // ground
    if (this.pos.y < 0.4 + this.radius) {
      this.pos.y = 0.4 + this.radius;
      this.vel.y = Math.abs(this.vel.y) * 0.35;
      this.vel.x *= 0.5; this.vel.z *= 0.5;
    }
    // solve joints
    this.constraints.forEach(c => c.solve());
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(c => { if (c.isMesh) { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); } });
  }
}

// Spawn engine: registry of spawnable entities (dummies, props, weapons, liquids)
export class SpawnEngine {
  constructor(scene, camera, voxelWorld) {
    this.scene = scene;
    this.camera = camera;
    this.voxelWorld = voxelWorld;
    this.dummies = [];
    this.props = [];
    this.weapons = [];
    this.liquids = [];
  }

  spawnDummy(x, y, z, DummyClass) {
    const d = new DummyClass(this.scene, x, y, z);
    this.dummies.push(d);
    return d;
  }

  spawnProp(type, x, y, z) {
    const p = new Prop(this.scene, type, x, y, z, this.voxelWorld);
    this.props.push(p);
    return p;
  }

  spawnLiquid(x, y, z, count, color, vel, liquidSystem) {
    liquidSystem.spawn(x, y, z, count, vel);
  }

  step(dt) {
    this.dummies.forEach(d => d.step(dt));
    this.props.forEach(p => p.step(dt));
    this.liquids.forEach(l => l.step(dt));
  }

  dispose() {
    this.dummies.forEach(d => d.dispose && d.dispose());
    this.props.forEach(p => p.dispose());
    this.liquids.forEach(l => l.dispose());
    this.dummies = [];
    this.props = [];
    this.liquids = [];
  }
}
