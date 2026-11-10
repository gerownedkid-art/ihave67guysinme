import * as THREE from 'three';

// Constraint / joint system for ragdolls, props, and wire-based machines.
// Distance constraint (stick), hinge, spring, and "wire" (rope-like chain of distance constraints).

export class Constraint {
  constructor(a, b, restLength, stiffness = 1.0, type = 'distance') {
    this.a = a; // {pos, invMass} or BodyPart-like
    this.b = b;
    this.restLength = restLength;
    this.stiffness = stiffness;
    this.type = type; // 'distance' | 'hinge' | 'spring' | 'wire'
    this.broken = false;
    this.breakThreshold = Infinity; // max impulse before snapping
    this.active = true;
  }
  solve() {
    if (!this.active || this.broken) return;
    if (!this.a || !this.b) return;
    if (!this.a.invMass && !this.b.invMass) return;

    const delta = new THREE.Vector3().subVectors(this.b.pos, this.a.pos);
    const dist = delta.length();
    if (dist === 0) return;

    let diff;
    if (this.type === 'spring') {
      // spring: apply force proportional to extension, not hard constraint
      const extension = dist - this.restLength;
      const force = delta.clone().normalize().multiplyScalar(-extension * this.stiffness);
      if (this.a.invMass > 0) this.a.applyImpulse(force.clone().multiplyScalar(this.a.invMass));
      if (this.b.invMass > 0) this.b.applyImpulse(force.clone().negate().multiplyScalar(this.b.invMass));
      return;
    }

    diff = (dist - this.restLength) / dist;
    const totalInvMass = this.a.invMass + this.b.invMass;
    const offset = delta.clone().multiplyScalar(diff * this.stiffness / totalInvMass);
    if (this.a.invMass > 0) this.a.pos.sub(offset.multiplyScalar(this.a.invMass));
    if (this.b.invMass > 0) this.b.pos.add(offset.multiplyScalar(this.b.invMass));
  }
  break() { this.broken = true; }
}

// A wire: chain of small masses linked by distance constraints, anchored at both ends.
// Used for machine building (cables, tendons, pulleys).
export class Wire {
  constructor(world, start, end, segments = 8, restSegLen = 0.4) {
    this.world = world;
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
        pos: cur.clone(),
        prevPos: cur.clone(),
        invMass: staticEnd ? 0 : 1,
        applyImpulse(v) {
          if (this.invMass === 0) return;
          this.pos.add(v);
          this.prevPos.add(v);
        },
      };
      this.parts.push(part);
      if (i > 0) {
        const c = new Constraint(this.parts[i-1], part, restSegLen, 1.0, 'distance');
        this.constraints.push(c);
      }
      cur.add(step);
    }
    // register with world solver
    this.world.addWire(this);
  }
  update(dt) {
    // verlet integrate free nodes
    this.parts.forEach((p, i) => {
      if (i === 0 || i === this.parts.length - 1) return; // anchored
      const vel = new THREE.Vector3().subVectors(p.pos, p.prevPos).multiplyScalar(0.99);
      p.prevPos.copy(p.pos);
      p.pos.addScaledVector(vel, dt);
      p.pos.addScaledVector(new THREE.Vector3(0, -28, 0), dt * dt);
    });
    // solve constraints iters
    for (let it = 0; it < 8; it++) {
      // keep anchors fixed
      this.parts[0].pos.copy(this.anchors.start);
      this.parts[this.parts.length-1].pos.copy(this.anchors.end);
      this.constraints.forEach(c => c.solve());
    }
  }
  getMeshPoints() { return this.parts.map(p => p.pos); }
  dispose() {
    this.world.removeWire(this);
  }
}

// JointManipulator: allows grabbing and moving body parts / props with a spring constraint (complex joint manipulation)
export class JointManipulator {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.constraint = null;
    this.target = null; // world target point
    this.stiffness = 12;
    this.damping = 0.85;
    this.maxDist = 12;
    this._ray = new THREE.Raycaster();
    this._dir = new THREE.Vector3();
  }
  grab(point, part) {
    this.release();
    this.target = point.clone();
    this.constraint = { part, target: point.clone(), stiffness: this.stiffness };
  }
  updateGrab(targetPoint) {
    if (!this.constraint) return;
    this.target.copy(targetPoint);
    const p = this.constraint.part;
    const dir = new THREE.Vector3().subVectors(this.target, p.pos);
    const dist = dir.length();
    const pull = dir.normalize().multiplyScalar(Math.min(dist * this.constraint.stiffness, 50));
    // damping against current velocity approximated via prevPos
    p.applyImpulse(pull);
  }
  release() {
    this.constraint = null;
    this.target = null;
  }
  hasGrab() { return !!this.constraint; }
}

// MachineBuilder: place anchors and wires to build contraptions (pulleys, levers, triggers)
export class MachineBuilder {
  constructor(scene) {
    this.scene = scene;
    this.wires = [];
    this.anchors = []; // {mesh, pos}
    this._mat = new THREE.MeshBasicMaterial({ color: 0x00d9ff });
  }
  addAnchor(x, y, z) {
    const geo = new THREE.SphereGeometry(0.07, 12, 12);
    const mesh = new THREE.Mesh(geo, this._mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const anchor = { mesh, pos: new THREE.Vector3(x, y, z) };
    this.anchors.push(anchor);
    return anchor;
  }
  connect(aIdx, bIdx, world) {
    const a = this.anchors[aIdx];
    const b = this.anchors[bIdx];
    if (!a || !b) return null;
    const wire = new Wire(world, a.pos, b.pos, 6, 0.5);
    this.wires.push(wire);
    return wire;
  }
  update(dt) {
    this.wires.forEach(w => w.update(dt));
  }
  draw() {
    // debug lines for wires would go here; keeping lightweight (lines rendered by caller)
  }
  dispose() {
    this.wires.forEach(w => w.dispose());
    this.anchors.forEach(a => { this.scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose(); });
    this.anchors = [];
    this.wires = [];
  }
}
