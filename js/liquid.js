import * as THREE from 'three';

// Simple 2D-ish particle liquid system with surface tension-ish behavior
// Renders as small spheres (could be instanced). Supports water and blood.

const GRAVITY = new THREE.Vector3(0, -24, 0);
const DRAG = 0.98;
const REST_DIST = 0.55;
const PRESSURE = 0.06;
const VISCOSITY = 0.15;
const SOLVER_ITERS = 6;
const PARTICLE_RADIUS = 0.18;
const MAX_PARTICLES = 3000;

export class LiquidSystem {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.color = options.color || 0x2a6a9a; // water blue
    this.emissive = options.emissive || 0x000000;
    this.maxParticles = options.maxParticles || MAX_PARTICLES;
    this.particles = [];
    this.meshes = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    this.geo = new THREE.SphereGeometry(PARTICLE_RADIUS, 8, 8);
    this.mat = new THREE.MeshStandardMaterial({
      color: this.color,
      emissive: this.emissive,
      roughness: 0.2,
      metalness: 0.1,
      transparent: options.transparent || false,
      opacity: options.opacity !== undefined ? options.opacity : 0.9,
      transmission: options.transmission || 0,
    });
  }

  spawn(x, y, z, count, vel = null) {
    for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
      const p = {
        pos: new THREE.Vector3(x + (Math.random()-0.5)*0.2, y + (Math.random()-0.5)*0.2, z + (Math.random()-0.5)*0.2),
        vel: vel ? vel.clone() : new THREE.Vector3((Math.random()-0.5)*2, 2 + Math.random()*3, (Math.random()-0.5)*2),
        life: 20 + Math.random()*10,
      };
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.position.copy(p.pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.particles.push(p);
      this.meshes.push(mesh);
    }
  }

  spawnBlood(x, y, z, count, dir) {
    const blood = new LiquidSystem(this.scene, { color: 0x6a0a0a, opacity: 0.95 });
    for (let i = 0; i < count; i++) {
      const spread = new THREE.Vector3((Math.random()-0.5)*0.8, (Math.random()-0.5)*0.8, (Math.random()-0.5)*0.8);
      const v = dir.clone().add(spread).normalize().multiplyScalar(6 + Math.random()*12);
      blood.particles.push({ pos: new THREE.Vector3(x,y,z), vel: v, life: 3 + Math.random()*3 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random()*0.04, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x6a0a0a }));
      mesh.position.copy(blood.particles[blood.particles.length-1].pos);
      this.group.add(mesh);
      blood.meshes.push(mesh);
    }
    return blood;
  }

  getNeighbors(index, grid, cellSize) {
    // simple spatial hash neighbor lookup
    const p = this.particles[index];
    const cell = Math.floor(cellSize);
    const cx = Math.floor(p.pos.x / cell), cy = Math.floor(p.pos.y / cell), cz = Math.floor(p.pos.z / cell);
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cx+dx},${cy+dy},${cz+dz}`;
          const bucket = grid.get(key);
          if (bucket) bucket.forEach(j => { if (j !== index) neighbors.push(j); });
        }
      }
    }
    return neighbors;
  }

  step(dt) {
    // build spatial grid
    const cellSize = REST_DIST * 2;
    const grid = new Map();
    this.particles.forEach((p, i) => {
      const key = `${Math.floor(p.pos.x/cellSize)},${Math.floor(p.pos.y/cellSize)},${Math.floor(p.pos.z/cellSize)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    });

    // integrate
    this.particles.forEach(p => {
      p.vel.addScaledVector(GRAVITY, dt);
      p.vel.multiplyScalar(DRAG);
      p.pos.addScaledVector(p.vel, dt);
      // floor collision
      if (p.pos.y < PARTICLE_RADIUS) {
        p.pos.y = PARTICLE_RADIUS;
        p.vel.y = Math.abs(p.vel.y) * 0.3;
        p.vel.x *= 0.5; p.vel.z *= 0.5;
      }
    });

    // pressure + density constraints (SPH lite)
    for (let it = 0; it < SOLVER_ITERS; it++) {
      for (let i = 0; i < this.particles.length; i++) {
        const pi = this.particles[i];
        let dx = 0, dy = 0, dz = 0;
        let count = 0;
        this.getNeighbors(i, grid, cellSize).forEach(j => {
          const pj = this.particles[j];
          const d = new THREE.Vector3().subVectors(pj.pos, pi.pos);
          const dist = d.length();
          if (dist > 0 && dist < REST_DIST) {
            const push = (REST_DIST - dist) / dist * PRESSURE;
            dx += d.x * push; dy += d.y * push; dz += d.z * push;
            count++;
          }
        });
        if (count > 0) {
          pi.vel.add(new THREE.Vector3(dx/count, dy/count, dz/count));
        }
        // viscosity
        this.getNeighbors(i, grid, cellSize).forEach(j => {
          const pj = this.particles[j];
          const dv = new THREE.Vector3().subVectors(pj.vel, pi.vel);
          pi.vel.addScaledVector(dv, VISCOSITY * dt);
        });
      }
      // apply positions after vel
      this.particles.forEach(p => p.pos.addScaledVector(p.vel, dt));
    }

    // update meshes + age out
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const m = this.meshes[i];
      m.position.copy(p.pos);
      p.life -= dt;
      m.scale.setScalar(Math.max(0, p.life / 20));
      if (p.life <= 0) {
        this.group.remove(m);
        m.geometry.dispose();
        m.material.dispose();
        this.particles.splice(i, 1);
        this.meshes.splice(i, 1);
      }
    }
  }

  dispose() {
    this.meshes.forEach(m => { this.group.remove(m); m.geometry.dispose(); m.material.dispose(); });
    this.meshes = [];
    this.particles = [];
    this.scene.remove(this.group);
  }
}

export { GRAVITY, PARTICLE_RADIUS, REST_DIST };
