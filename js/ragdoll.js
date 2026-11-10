import * as THREE from 'three';

// Lightweight position-based dynamics ragdoll (Verlet integration).
// Drives visual limb meshes by bone position without an external physics lib.

const GRAVITY = new THREE.Vector3(0, -28, 0);
const FRICTION = 0.998;
const GROUND_BOUNCE = 0.25;
const SOLVER_ITERS = 10;

export class BodyPart {
  constructor(type, pos, radius, mass, color) {
    this.type = type;
    this.pos = pos.clone();
    this.prevPos = pos.clone();
    this.radius = radius;
    this.invMass = mass > 0 ? 1 / mass : 0;
    this.color = color;
    this.mesh = null;
    this.impulse = new THREE.Vector3();
  }
  integrate(dt) {
    if (this.invMass === 0) return;
    const vel = new THREE.Vector3().subVectors(this.pos, this.prevPos).multiplyScalar(FRICTION);
    this.prevPos.copy(this.pos);
    this.pos.addScaledVector(vel, dt);
    this.pos.addScaledVector(GRAVITY, dt * dt);
    this.pos.addScaledVector(this.impulse, dt * dt * this.invMass);
    this.impulse.set(0, 0, 0);
  }
  applyImpulse(vec) {
    this.impulse.add(vec);
  }
}

export class Constraint {
  constructor(a, b, restLength, stiffness = 1.0) {
    this.a = a;
    this.b = b;
    this.restLength = restLength;
    this.stiffness = stiffness;
    this.broken = false;
  }
  solve() {
    if (this.broken || (!this.a.invMass && !this.b.invMass)) return;
    const delta = new THREE.Vector3().subVectors(this.b.pos, this.a.pos);
    const dist = delta.length();
    if (dist === 0) return;
    const diff = (dist - this.restLength) / dist;
    const totalInvMass = this.a.invMass + this.b.invMass;
    const offset = delta.clone().multiplyScalar(diff * this.stiffness / totalInvMass);
    if (this.a.invMass > 0) this.a.pos.sub(offset.multiplyScalar(this.a.invMass));
    if (this.b.invMass > 0) this.b.pos.add(offset.multiplyScalar(this.b.invMass));
  }
  break() { this.broken = true; }
}

export class Ragdoll {
  constructor() {
    this.parts = [];
    this.constraints = [];
    this.root = null;
  }
  addPart(part) { this.parts.push(part); return part; }
  addConstraint(a, b, restLength, stiffness) {
    const c = new Constraint(a, b, restLength, stiffness);
    this.constraints.push(c);
    return c;
  }
  integrate(dt) {
    this.parts.forEach(p => p.integrate(dt));
  }
  solveConstraints() {
    this.constraints.forEach(c => c.solve());
  }
  resolveGround(yLimit = 0.3) {
    this.parts.forEach(p => {
      if (p.pos.y < yLimit - p.radius) {
        p.pos.y = yLimit - p.radius;
        const vel = new THREE.Vector3().subVectors(p.pos, p.prevPos);
        vel.y = Math.abs(vel.y) * GROUND_BOUNCE;
        vel.x *= 0.5; vel.z *= 0.5;
        p.prevPos.copy(p.pos).sub(vel);
      }
    });
  }
  applyImpulseAt(point, dir, strength) {
    // nearest part gets most of the impulse; neighbors get falloff
    let nearest = null; let minDist = Infinity;
    this.parts.forEach(p => {
      const d = point.distanceTo(p.pos);
      if (d < minDist) { minDist = d; nearest = p; }
    });
    const falloff = 1.6;
    this.parts.forEach(p => {
      const d = point.distanceTo(p.pos);
      const w = Math.max(0, 1 - d / falloff);
      if (w > 0 && p.invMass > 0) {
        p.applyImpulse(dir.clone().multiplyScalar(strength * w * p.invMass));
      }
    });
  }
  getPartAt(point) {
    let nearest = null; let minDist = Infinity;
    this.parts.forEach(p => {
      const d = point.distanceTo(p.pos);
      if (d < minDist) { minDist = d; nearest = p; }
    });
    return nearest;
  }
  step(dt) {
    this.integrate(dt);
    for (let i = 0; i < SOLVER_ITERS; i++) this.solveConstraints();
    this.resolveGround();
  }
  getPart(type) { return this.parts.find(p => p.type === type); }
}
