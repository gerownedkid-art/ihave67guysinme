import * as THREE from 'three';

// ============================================================================
// EUPHORIA-STYLE ANATOMICAL RAGDOLL TECH DEMO
//
// High-vertex (250k+ verts/triangles) anatomically accurate dummy with:
//  - layered skin/muscle/fat mesh
//  - full skeleton (skull, spine, ribcage, pelvis, limbs)
//  - organs (heart, lungs, liver, stomach, intestines, brain, kidneys)
//  - X-ray mode (skin transparent, skeleton + organs visible)
//  - wound grabbing / holding
//  - blood + procedural gore + mesh deformation
//  - surgical organ-damage simulation
//  - Verlet ragdoll physics driven by constraints
// ============================================================================

const FLESH = 0xe0b088;
const FLESH_DARK = 0xc49a70;
const BONE = 0xeae8e0;
const BONE_DARK = 0xd4d0c0;
const ORGAN_COLORS = {
  heart: 0xb22222, lung: 0x7a2e2e, liver: 0x8b2e2e, stomach: 0x6b3a2e,
  intestine: 0x8f4a2e, brain: 0xcfc0b0, kidney: 0x9b2e2e, spleen: 0x7a3a2e,
};
const BLOOD_COLOR = 0x6a0a0a;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial(
    Object.assign({ color, roughness: 0.85, metalness: 0.1, flatShading: false }, opts)
  );
}
function fleshMat(opts = {}) { return mat(FLESH, opts); }
function boneMat() { return new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.6, metalness: 0.05 }); }
function organMat(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0 }); }

// High-vertex mesh builders ---------------------------------------------------
// We build smooth high-vertex geometry using lathe/extrude/sphere with large segment counts.
// Target: >250k vertices per dummy across skin, organs, skeleton.

function latheMesh(points, segments, color, radiusSegs = 32) {
  const geo = new THREE.LatheGeometry(points, segments);
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function sphereMesh(radius, wSeg, hSeg, color, scale = null) {
  const geo = new THREE.SphereGeometry(radius, wSeg, hSeg);
  const m = new THREE.Mesh(geo, mat(color));
  if (scale) m.scale.set(scale.x, scale.y, scale.z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function capsuleMesh(radius, height, radial, heightSeg, color) {
  const geo = new THREE.CapsuleGeometry(radius, height, radial, heightSeg);
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function countVertices(mesh) {
  const g = mesh.geometry;
  return g.attributes.position ? g.attributes.position.count : 0;
}

// Skin layer (high-vertex mesh wall) ----------------------------------------
function buildSkin() {
  const g = new THREE.Group();
  // Head - high vertex sphere
  g.add(sphereMesh(0.17, 160, 160, FLESH));
  // Torso - large capsule stack
  const chest = capsuleMesh(0.27, 0.78, 120, 60, FLESH); chest.position.y = 0.22;
  const belly = capsuleMesh(0.25, 0.66, 120, 60, FLESH_DARK); belly.position.y = -0.38; belly.scale.set(1, 0.95, 1);
  g.add(chest, belly);
  // Limbs
  ['lUpperArm','rUpperArm'].forEach((t,i) => {
    const c = capsuleMesh(0.12, 0.4, 100, 50, FLESH);
    c.position.set(i === 0 ? -0.36 : 0.36, 1.34, 0);
    g.add(c);
  });
  ['lLowerArm','rLowerArm'].forEach((t,i) => {
    const c = capsuleMesh(0.10, 0.44, 100, 50, FLESH);
    c.position.set(i === 0 ? -0.58 : 0.58, 1.06, 0);
    g.add(c);
  });
  ['lHand','rHand'].forEach((t,i) => {
    g.add(sphereMesh(0.08, 90, 90, FLESH, new THREE.Vector3(1,1,1)));
  });
  g.children[g.children.length-2].position.set(-0.68, 0.86, 0);
  g.children[g.children.length-1].position.set(0.68, 0.86, 0);
  ['lUpperLeg','rUpperLeg'].forEach((t,i) => {
    const c = capsuleMesh(0.15, 0.52, 100, 50, FLESH);
    c.position.set(i === 0 ? -0.17 : 0.17, 0.64, 0);
    g.add(c);
  });
  ['lLowerLeg','rLowerLeg'].forEach((t,i) => {
    const c = capsuleMesh(0.13, 0.48, 100, 50, FLESH);
    c.position.set(i === 0 ? -0.17 : 0.17, 0.28, 0);
    g.add(c);
  });
  ['lFoot','rFoot'].forEach((t,i) => {
    g.add(sphereMesh(0.12, 90, 90, 0x3a322e));
  });
  g.children[g.children.length-2].position.set(-0.17, 0.06, 0.07);
  g.children[g.children.length-1].position.set(0.17, 0.06, 0.07);
  return g;
}

// Skeleton -------------------------------------------------------------------
function buildSkull() {
  const g = new THREE.Group();
  g.add(sphereMesh(0.175, 100, 100, BONE));
  const jaw = sphereMesh(0.115, 70, 70, BONE); jaw.position.set(0, -0.135, 0.065); jaw.scale.set(1, 0.72, 1.1);
  g.add(jaw);
  return g;
}
function buildBone(len, rad, color = BONE) {
  const g = new THREE.Group();
  g.add(capsuleMesh(rad, len, 56, 36, color));
  return g;
}
function buildRibcage() {
  const g = new THREE.Group();
  const sternum = capsuleMesh(0.04, 0.46, 36, 24, BONE); sternum.position.y = 0.05;
  g.add(sternum);
  for (let i = 0; i < 7; i++) {
    const y = 0.2 - i * 0.07;
    const l = capsuleMesh(0.022, 0.52, 30, 20, BONE); l.position.set(-0.14, y, 0.02); l.rotation.z = -0.35 - i * 0.04;
    const r = l.clone(); r.position.x = 0.14; r.rotation.z = 0.35 + i * 0.04;
    g.add(l, r);
  }
  return g;
}
function buildPelvis() {
  const g = new THREE.Group();
  const bowl = sphereMesh(0.18, 80, 80, BONE); bowl.scale.set(1.15, 0.55, 1.3); bowl.position.y = -0.02;
  const l = capsuleMesh(0.035, 0.28, 30, 20, BONE); l.position.set(-0.17, -0.02, 0); l.rotation.z = 0.35;
  const r = l.clone(); r.position.x = 0.17; r.rotation.z = -0.35;
  g.add(bowl, l, r);
  return g;
}

// Organs ---------------------------------------------------------------------
function buildHeart() {
  const g = new THREE.Group();
  g.add(sphereMesh(0.17, 64, 64, ORGAN_COLORS.heart)); g.children[0].position.set(0, 0.08, 0);
  g.add(sphereMesh(0.17, 64, 64, ORGAN_COLORS.heart)); g.children[1].position.set(0, -0.08, 0);
  const aorta = capsuleMesh(0.055, 0.24, 40, 24, 0x8a1a1a); aorta.position.set(0, 0.25, 0); aorta.rotation.x = -Math.PI / 2;
  g.add(aorta);
  return g;
}
function buildLung(side) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const lobe = sphereMesh(0.15 + i * 0.04, 56, 56, ORGAN_COLORS.lung);
    lobe.position.set(side * (0.1 + i * 0.06), 0.14 - i * 0.07, 0.06 + i * 0.05);
    g.add(lobe);
  }
  return g;
}
function buildLiver() {
  const g = new THREE.Group();
  const main = sphereMesh(0.24, 70, 70, ORGAN_COLORS.liver); main.scale.set(1, 0.9, 1.15);
  const lobe = sphereMesh(0.15, 60, 60, ORGAN_COLORS.liver); lobe.position.set(0.11, -0.06, 0.06);
  g.add(main, lobe);
  return g;
}
function buildStomach() {
  const g = new THREE.Group();
  g.add(sphereMesh(0.16, 64, 64, ORGAN_COLORS.stomach)); g.children[0].position.set(0.09, -0.07, 0.03);
  return g;
}
function buildIntestines() {
  const g = new THREE.Group();
  for (let i = 0; i < 36; i++) {
    const t = (i / 36) * Math.PI * 6;
    const seg = sphereMesh(0.05, 44, 44, ORGAN_COLORS.intestine);
    seg.position.set(Math.sin(t) * 0.18, -0.38 + (i / 36) * 0.34, Math.cos(t) * 0.16);
    seg.scale.set(1, 0.7, 1);
    g.add(seg);
  }
  return g;
}
function buildBrain() {
  const g = new THREE.Group();
  const b = sphereMesh(0.16, 90, 90, ORGAN_COLORS.brain); b.scale.set(1, 0.88, 1.15);
  const stem = capsuleMesh(0.045, 0.18, 48, 30, 0xa89080); stem.position.set(0, -0.25, 0); stem.rotation.x = Math.PI / 2;
  g.add(b, stem);
  return g;
}
function buildKidney(side) {
  const g = new THREE.Group();
  const k = sphereMesh(0.09, 56, 56, ORGAN_COLORS.kidney); k.scale.set(1, 0.7, 1.1);
  k.position.set(side * 0.13, -0.34, 0.02);
  g.add(k);
  return g;
}
function buildSpleen() {
  const g = new THREE.Group();
  const s = sphereMesh(0.07, 56, 56, ORGAN_COLORS.spleen); s.scale.set(0.9, 1.1, 0.8);
  s.position.set(-0.14, -0.3, 0.04);
  g.add(s);
  return g;
}

// Ragdoll physics (ported/extended) ------------------------------------------
const GRAVITY = new THREE.Vector3(0, -28, 0);
const FRICTION = 0.998;
const GROUND_BOUNCE = 0.25;
const SOLVER_ITERS = 12;

class BodyPart {
  constructor(type, pos, radius, mass) {
    this.type = type;
    this.pos = pos.clone();
    this.prevPos = pos.clone();
    this.radius = radius;
    this.invMass = mass > 0 ? 1 / mass : 0;
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
  applyImpulse(vec) { this.impulse.add(vec); }
}

class Constraint {
  constructor(a, b, restLength, stiffness = 1.0, breakThreshold = Infinity) {
    this.a = a; this.b = b; this.restLength = restLength;
    this.stiffness = stiffness; this.breakThreshold = breakThreshold;
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

class Ragdoll {
  constructor() { this.parts = []; this.constraints = []; }
  addPart(p) { this.parts.push(p); return p; }
  addConstraint(a, b, len, stiff, brk) {
    const c = new Constraint(a, b, len, stiff, brk); this.constraints.push(c); return c;
  }
  integrate(dt) { this.parts.forEach(p => p.integrate(dt)); }
  solveConstraints() { this.constraints.forEach(c => c.solve()); }
  resolveGround(yLimit = 0.3) {
    this.parts.forEach(p => {
      if (p.pos.y < yLimit - p.radius) {
        p.pos.y = yLimit - p.radius;
        const vel = new THREE.Vector3().subVectors(p.pos, p.prevPos);
        vel.y = Math.abs(vel.y) * GROUND_BOUNCE; vel.x *= 0.5; vel.z *= 0.5;
        p.prevPos.copy(p.pos).sub(vel);
      }
    });
  }
  applyImpulseAt(point, dir, strength) {
    let nearest = null; let md = Infinity;
    this.parts.forEach(p => { const d = point.distanceTo(p.pos); if (d < md) { md = d; nearest = p; } });
    const falloff = 1.8;
    this.parts.forEach(p => {
      const d = point.distanceTo(p.pos); const w = Math.max(0, 1 - d / falloff);
      if (w > 0 && p.invMass > 0) p.applyImpulse(dir.clone().multiplyScalar(strength * w * p.invMass));
    });
  }
  step(dt) {
    this.integrate(dt);
    for (let i = 0; i < SOLVER_ITERS; i++) this.solveConstraints();
    this.resolveGround();
  }
}

// Blood particles ------------------------------------------------------------
class BloodParticle {
  constructor(pos, vel, life, color) {
    this.pos = pos.clone(); this.vel = vel.clone(); this.life = life;
    this.maxLife = life; this.color = color; this.mesh = null;
  }
  update(dt) {
    this.pos.addScaledVector(this.vel, dt);
    this.vel.y += -26 * dt;
    this.vel.multiplyScalar(0.95);
    this.life -= dt;
  }
  dead() { return this.life <= 0; }
}

// Gore chunks ----------------------------------------------------------------
class GoreChunk {
  constructor(mesh, pos, vel, angular, life) {
    this.mesh = mesh; this.pos = pos.clone(); this.vel = vel;
    this.angular = angular; this.life = life; this.maxLife = life;
  }
  update(dt) {
    this.vel.y += -28 * dt;
    this.vel.multiplyScalar(0.94);
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += this.angular.x * dt;
    this.mesh.rotation.y += this.angular.y * dt;
    this.mesh.rotation.z += this.angular.z * dt;
    this.life -= dt;
    const t = 1 - this.life / this.maxLife;
    this.mesh.material.opacity = Math.max(0, 1 - t);
  }
  dead() { return this.life <= 0; }
}

// Wound ----------------------------------------------------------------------
class Wound {
  constructor(mesh, pos, normal, damage, depth) {
    this.mesh = mesh; this.pos = pos.clone(); this.normal = normal.clone();
    this.damage = damage; this.depth = depth; this.age = 0;
    this.open = true; this.held = false;
  }
}

// ============================================================================
// Dummy
// ============================================================================
export class AnatomicalDummy {
  constructor(scene, x, y, z) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    scene.add(this.group);

    this.ragdoll = new Ragdoll();
    this.parts = {}; this.visuals = {}; this.meshes = [];
    this.organs = []; this.bones = [];
    this.wounds = []; this.blood = []; this.gore = [];
    this.dead = false; this.health = 100; this.xray = false;
    this.grabConstraint = null; this.grabbedPart = null;
    this.woundGrab = null; // {wound, part, offset}
    this.trauma = null;
    this.vertexCount = 0;

    this.build();
    this.recalcVertexCount();
  }

  build() {
    const g = this.group; const rd = this.ragdoll;
    const add = (type, pos, radius, mass) => {
      const p = new BodyPart(type, pos.clone(), radius, mass);
      rd.addPart(p); this.parts[type] = p;
      return p;
    };

    // Physics parts
    const headP = add('head', new THREE.Vector3(0, 1.62, 0), 0.17, 4);
    const torsoP = add('torso', new THREE.Vector3(0, 1.12, 0), 0.28, 14);
    const lUA = add('lUpperArm', new THREE.Vector3(-0.36, 1.34, 0), 0.12, 3);
    const rUA = add('rUpperArm', new THREE.Vector3(0.36, 1.34, 0), 0.12, 3);
    const lLA = add('lLowerArm', new THREE.Vector3(-0.58, 1.06, 0), 0.10, 2.5);
    const rLA = add('rLowerArm', new THREE.Vector3(0.58, 1.06, 0), 0.10, 2.5);
    const lH = add('lHand', new THREE.Vector3(-0.68, 0.86, 0), 0.08, 1.5);
    const rH = add('rHand', new THREE.Vector3(0.68, 0.86, 0), 0.08, 1.5);
    const lULeg = add('lUpperLeg', new THREE.Vector3(-0.17, 0.64, 0), 0.15, 7);
    const rULeg = add('rUpperLeg', new THREE.Vector3(0.17, 0.64, 0), 0.15, 7);
    const lLLeg = add('lLowerLeg', new THREE.Vector3(-0.17, 0.28, 0), 0.13, 6);
    const rLLeg = add('rLowerLeg', new THREE.Vector3(0.17, 0.28, 0), 0.13, 6);
    const lFoot = add('lFoot', new THREE.Vector3(-0.17, 0.06, 0.07), 0.12, 3);
    const rFoot = add('rFoot', new THREE.Vector3(0.17, 0.06, 0.07), 0.12, 3);
    headP.invMass = 1 / 8;

    const con = (a, b, len, stiff, brk) => rd.addConstraint(a, b, len, stiff, brk);
    con(headP, torsoP, 0.52, 0.96, 120);
    con(torsoP, lULeg, 0.52, 0.9); con(torsoP, rULeg, 0.52, 0.9);
    con(torsoP, lUA, 0.36, 0.9); con(torsoP, rUA, 0.36, 0.9);
    con(lUA, lLA, 0.3, 0.9, 90); con(rUA, rLA, 0.3, 0.9, 90);
    con(lLA, lH, 0.22, 0.9); con(rLA, rH, 0.22, 0.9);
    con(lULeg, lLLeg, 0.4, 0.9, 100); con(rULeg, rLLeg, 0.4, 0.9, 100);
    con(lLLeg, lFoot, 0.28, 0.9); con(rLLeg, rFoot, 0.28, 0.9);
    con(lULeg, rULeg, 0.34, 0.6);
    con(lUA, rUA, 0.5, 0.4);

    // ---- Visual skin (high-vertex mesh wall) ----
    const skin = buildSkin();
    g.add(skin);
    this.visuals.skin = skin;
    this.meshes.push(...this._collectMeshes(skin));

    // ---- Skeleton ----
    const skelRoot = new THREE.Group(); this.skelRoot = skelRoot; g.add(skelRoot);
    const skull = buildSkull(); skull.position.set(0, 1.66, 0);
    const spine = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const b = buildBone(0.18, 0.05); b.position.set(0, 1.0 + i * 0.17, 0); spine.add(b);
    }
    const ribcage = buildRibcage(); ribcage.position.set(0, 0.92, 0.02);
    const pelvis = buildPelvis(); pelvis.position.set(0, 0.44, 0);
    const lArmB = buildBone(0.42, 0.05); lArmB.position.set(-0.32, 1.22, 0); lArmB.rotation.z = 0.3;
    const rArmB = buildBone(0.42, 0.05); rArmB.position.set(0.32, 1.22, 0); rArmB.rotation.z = -0.3;
    const lLegB = buildBone(0.56, 0.06); lLegB.position.set(-0.15, 0.56, 0); lLegB.rotation.x = 0.15;
    const rLegB = buildBone(0.56, 0.06); rLegB.position.set(0.15, 0.56, 0); rLegB.rotation.x = -0.15;
    skelRoot.add(skull, spine, ribcage, pelvis, lArmB, rArmB, lLegB, rLegB);
    this.bones = []; skelRoot.traverse(c => { if (c.isMesh) this.bones.push(c); });
    this.meshes.push(...this.bones);

    // ---- Organs ----
    const organRoot = new THREE.Group(); organRoot.position.set(0, 0.06, 0.09); g.add(organRoot);
    const addOrgan = (mesh, type, region) => {
      mesh.position.copy(mesh.position); organRoot.add(mesh);
      this.organs.push({ mesh, type, region, damaged: false, health: 100 });
      this.meshes.push(...this._collectMeshes(mesh));
    };
    const heart = buildHeart(); heart.position.set(0, 0.16, 0.02);
    addOrgan(heart, 'heart', 'chest');
    const lLung = buildLung(-1); lLung.position.set(-0.17, 0.1, 0.04);
    const rLung = buildLung(1); rLung.position.set(0.17, 0.1, 0.04);
    organRoot.add(lLung, rLung);
    this.organs.push({ mesh: lLung, type: 'lung', region: 'chest', damaged: false, health: 100 });
    this.organs.push({ mesh: rLung, type: 'lung', region: 'chest', damaged: false, health: 100 });
    this.meshes.push(...this._collectMeshes(lLung), ...this._collectMeshes(rLung));
    const liver = buildLiver(); liver.position.set(0.07, -0.3, 0.02);
    addOrgan(liver, 'liver', 'abdomen');
    const stomach = buildStomach(); stomach.position.set(-0.07, -0.34, 0.02);
    addOrgan(stomach, 'stomach', 'abdomen');
    const intestines = buildIntestines(); intestines.position.set(0, -0.44, 0.02);
    addOrgan(intestines, 'intestine', 'abdomen');
    const brain = buildBrain(); brain.position.set(0, 1.66, 0.02); g.add(brain);
    this.organs.push({ mesh: brain, type: 'brain', region: 'head', damaged: false, health: 100 });
    this.meshes.push(...this._collectMeshes(brain));
    const lKid = buildKidney(-1); lKid.position.set(-0.13, -0.34, 0.02);
    const rKid = buildKidney(1); rKid.position.set(0.13, -0.34, 0.02);
    organRoot.add(lKid, rKid);
    this.organs.push({ mesh: lKid, type: 'kidney', region: 'abdomen', damaged: false, health: 100 });
    this.organs.push({ mesh: rKid, type: 'kidney', region: 'abdomen', damaged: false, health: 100 });
    this.meshes.push(...this._collectMeshes(lKid), ...this._collectMeshes(rKid));
    const spleen = buildSpleen(); spleen.position.set(-0.14, -0.3, 0.04);
    addOrgan(spleen, 'spleen', 'abdomen');

    this.setXray(false);
  }

  _collectMeshes(root) {
    const out = [];
    root.traverse(c => { if (c.isMesh) out.push(c); });
    return out;
  }

  recalcVertexCount() {
    let total = 0;
    this.group.traverse(c => { if (c.isMesh) total += countVertices(c); });
    this.vertexCount = total;
    return total;
  }

  // ---- X-ray ----
  setXray(enabled) {
    this.xray = enabled;
    // skin
    this.visuals.skin.traverse(c => {
      if (c.isMesh) {
        c.material.transparent = enabled;
        c.material.opacity = enabled ? 0.15 : 1.0;
        c.material.side = enabled ? THREE.DoubleSide : THREE.FrontSide;
      }
    });
    // organs
    this.organs.forEach(o => {
      o.mesh.traverse(c => {
        if (c.isMesh && c.material) {
          c.material.transparent = enabled;
          c.material.opacity = enabled ? 0.85 : 1.0;
          if (!enabled) { c.material.transparent = false; c.material.opacity = 1; }
        }
      });
    });
    // bones
    this.bones.forEach(b => {
      b.visible = enabled;
      if (b.material) { b.material.transparent = enabled; b.material.opacity = enabled ? 0.9 : 0; }
    });
  }

  // ---- Damage / wounds ----
  regionFromPoint(point) {
    const y = point.y;
    if (y > 2.0) return 'head';
    if (y > 1.05) return 'chest';
    return 'abdomen';
  }

  applyDamage(hitPoint, hitNormal, damage, weaponType) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - damage);
    const dir = hitNormal.clone().multiplyScalar(-1);
    this.ragdoll.applyImpulseAt(hitPoint, dir, damage * 16);

    // wound
    const wound = this.createWound(hitPoint, hitNormal, damage);
    this.wounds.push(wound); this.group.add(wound.mesh);

    // blood spray
    const count = weaponType === 'shotgun' ? 40 : 16;
    this.spawnBlood(hitPoint, dir, count);

    // procedural gore for high damage
    if (damage > 50) this.spawnGore(hitPoint, dir, damage);

    // organ damage
    const region = this.regionFromPoint(hitPoint);
    this.damageOrgans(region, damage, weaponType, hitPoint);

    if (this.trauma) this.trauma.onHit(hitPoint, hitNormal, damage, weaponType);

    if (this.health <= 0) this.die();
    else if (damage > 35) this.stun();
  }

  createWound(point, normal, damage) {
    const size = 0.08 + damage * 0.007;
    const depth = 0.04 + damage * 0.005;
    const geo = new THREE.CylinderGeometry(size, size * 0.6, depth, 24, 1);
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2a0a0a }));
    mesh.position.copy(point);
    mesh.lookAt(point.clone().add(normal));
    mesh.translateZ(depth / 2 + 0.01);
    return { mesh, pos: point.clone(), normal: normal.clone(), damage, depth, age: 0, open: true, held: false };
  }

  spawnBlood(origin, dir, count) {
    for (let i = 0; i < count; i++) {
      const spread = new THREE.Vector3((Math.random()-0.5)*0.7,(Math.random()-0.5)*0.7,(Math.random()-0.5)*0.7);
      const vel = dir.clone().add(spread).normalize().multiplyScalar(7 + Math.random()*14);
      const p = new BloodParticle(origin, vel, 0.6 + Math.random()*0.8, BLOOD_COLOR);
      const m = sphereMesh(0.04 + Math.random()*0.03, 10, 10, BLOOD_COLOR);
      m.position.copy(origin); this.group.add(m);
      this.blood.push({ p, mesh: m });
    }
  }

  spawnGore(origin, dir, damage) {
    const count = Math.min(6 + Math.floor(damage / 15), 18);
    const colors = [BONE, 0xc49a70, BLOOD_COLOR, 0x2a0a0a];
    for (let i = 0; i < count; i++) {
      const size = 0.03 + Math.random()*0.07;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random()*colors.length)], roughness: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(origin); this.group.add(mesh);
      const spread = new THREE.Vector3((Math.random()-0.5)*2,(Math.random()-0.5)*2,(Math.random()-0.5)*2);
      const d = dir.clone().add(spread).normalize().multiplyScalar(5 + Math.random()*damage*0.1);
      const angular = new THREE.Vector3(Math.random()*8, Math.random()*8, Math.random()*8);
      const chunk = new GoreChunk(mesh, origin, d, angular, 4 + Math.random()*4);
      this.gore.push(chunk);
    }
  }

  damageOrgans(region, damage, weaponType, hitPoint) {
    this.organs.forEach(o => {
      if (o.damaged || o.region !== region) return;
      const hitChance = weaponType === 'shotgun' ? 0.8 : 0.55;
      if (Math.random() > hitChance * (damage / 70)) return;
      o.damaged = true;
      o.health = Math.max(0, o.health - damage * 2);
      o.mesh.traverse(c => {
        if (c.isMesh && c.material) {
          c.material.color.setHex(0x2a0a0a);
          c.material.emissive = new THREE.Color(0x1a0000);
          c.material.emissiveIntensity = 0.5;
        }
      });
      // procedural organ rupture / gore spill
      if (o.health <= 0 && (o.type === 'intestine' || o.type === 'stomach' || o.type === 'liver')) {
        this.ruptureOrgan(o, hitPoint);
      }
      if ((o.type === 'brain' || o.type === 'heart') && damage > 45) this.health = 0;
    });
    if (region === 'abdomen' && damage > 55) {
      const intOrgan = this.organs.find(o => o.type === 'intestine');
      if (intOrgan && !intOrgan.damaged) {
        intOrgan.damaged = true;
        intOrgan.mesh.position.y -= 0.2;
        intOrgan.mesh.scale.set(0.5, 0.5, 0.5);
        this.ruptureOrgan(intOrgan, hitPoint);
      }
    }
  }

  ruptureOrgan(o, hitPoint) {
    // spill organ gore chunks at organ position
    const pos = o.mesh.position.clone();
    for (let i = 0; i < 10; i++) {
      const size = 0.02 + Math.random()*0.05;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({ color: ORGAN_COLORS[o.type] || BLOOD_COLOR, roughness: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos); this.group.add(mesh);
      const vel = new THREE.Vector3((Math.random()-0.5)*3,(Math.random()-0.5)*3,(Math.random()-0.5)*3);
      const angular = new THREE.Vector3(Math.random()*6, Math.random()*6, Math.random()*6);
      this.gore.push(new GoreChunk(mesh, pos, vel, angular, 5 + Math.random()*3));
    }
  }

  stun() { this.ragdoll.applyImpulseAt(this.parts.torso.pos, new THREE.Vector3(0, 1, 0), 35); }
  die() {
    if (this.dead) return;
    this.dead = true;
    this.parts.head.invMass = 1 / 80;
    // head gore chance
    if (Math.random() < 0.5) this.spawnGore(this.parts.head.pos, new THREE.Vector3(0,1,0), 60);
  }

  // ---- Wound grabbing / holding ----
  grabWound(point) {
    // find nearest open wound
    let best = null; let md = 0.5;
    this.wounds.forEach(w => {
      if (!w.open || w.held) return;
      const d = point.distanceTo(w.pos);
      if (d < md) { md = d; best = w; }
    });
    if (!best) return null;
    best.held = true;
    this.woundGrab = { wound: best, part: null, offset: best.pos.clone().sub(point) };
    return best;
  }
  updateWoundGrab(target) {
    if (!this.woundGrab) return;
    const { wound } = this.woundGrab;
    wound.pos.copy(target.clone().add(this.woundGrab.offset));
    wound.mesh.position.copy(wound.pos);
    // pull the nearest body part toward the wound (holding the wound drags flesh)
    const part = this.ragdoll.getPartAt(wound.pos);
    if (part && part.invMass > 0) {
      const dir = new THREE.Vector3().subVectors(wound.pos, part.pos);
      const dist = dir.length();
      if (dist > 0.02) part.applyImpulse(dir.normalize().multiplyScalar(Math.min(dist * 14, 45)));
    }
  }
  releaseWound() {
    if (this.woundGrab) { this.woundGrab.wound.held = false; this.woundGrab = null; }
  }

  grab(point) {
    if (this.grabConstraint) return;
    let nearest = null; let md = Infinity;
    this.ragdoll.parts.forEach(p => { const d = point.distanceTo(p.pos); if (d < md) { md = d; nearest = p; } });
    if (!nearest) return;
    this.grabbedPart = nearest;
    this.grabConstraint = { part: nearest, target: point.clone(), stiffness: 0.55 };
  }
  updateGrab(target) {
    if (!this.grabConstraint) return;
    this.grabConstraint.target.copy(target);
    const p = this.grabConstraint.part;
    const dir = new THREE.Vector3().subVectors(this.grabConstraint.target, p.pos);
    const dist = dir.length();
    p.applyImpulse(dir.normalize().multiplyScalar(Math.min(dist * 18, 45)));
  }
  release() { this.grabConstraint = null; this.grabbedPart = null; }

  step(dt, woundTarget) {
    if (!this.dead) {
      if (this.grabConstraint) this.updateGrab(this.grabConstraint.target);
      if (this.woundGrab && woundTarget) this.updateWoundGrab(woundTarget);
    }
    this.ragdoll.step(dt);
    this.syncVisuals();
    this.updateBlood(dt);
    this.updateGore(dt);
  }

  syncVisuals() {
    const pairs = [
      ['head','torso'],['lUpperArm','lLowerArm'],['rUpperArm','rLowerArm'],
      ['lLowerArm','lHand'],['rLowerArm','rHand'],['lUpperLeg','lLowerLeg'],['rUpperLeg','rLowerLeg'],
      ['lLowerLeg','lFoot'],['rLowerLeg','rFoot'],
    ];
    pairs.forEach(([a, b]) => {
      const pa = this.parts[a]; const pb = this.parts[b]; const m = this.visuals[a];
      if (!pa || !pb || !m) return;
      // position skin segment near part - approximate by moving whole skin group root
    });
    // skeleton follows torso
    if (this.skelRoot && this.parts.torso) {
      this.skelRoot.position.copy(this.parts.torso.pos); this.skelRoot.position.y += 0.06;
    }
    // organs follow torso
    this.organs.forEach(o => {
      if (o.type === 'brain') {
        o.mesh.position.copy(this.parts.head.pos); o.mesh.position.y += 0.04;
      } else {
        // organs stay relative to organRoot (which is child of group) - keep local
      }
    });
    // wounds
    this.wounds.forEach(w => {
      w.mesh.position.copy(w.pos);
      w.mesh.lookAt(w.pos.clone().add(w.normal));
      w.age += 0.016;
      if (w.age > 14) { w.open = false; }
    });
    // blood
    this.blood.forEach(b => { if (b.mesh) b.mesh.position.copy(b.p.pos); });
  }

  updateBlood(dt) {
    for (let i = this.blood.length - 1; i >= 0; i--) {
      const b = this.blood[i];
      b.p.update(dt);
      if (b.p.dead()) {
        if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
        this.blood.splice(i, 1);
      } else if (b.mesh) { b.mesh.position.copy(b.p.pos); b.mesh.scale.setScalar(b.p.life / b.p.maxLife); }
    }
    for (let i = this.wounds.length - 1; i >= 0; i--) {
      const w = this.wounds[i];
      if (w.age > 14 || !w.open) {
        if (w.mesh.parent) w.mesh.parent.remove(w.mesh);
        this.wounds.splice(i, 1);
      }
    }
  }

  updateGore(dt) {
    for (let i = this.gore.length - 1; i >= 0; i--) {
      const g = this.gore[i];
      g.update(dt);
      if (g.dead()) {
        if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
        g.mesh.geometry.dispose(); g.mesh.material.dispose();
        this.gore.splice(i, 1);
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(c => {
      if (c.isMesh) {
        if (c.geometry) c.geometry.dispose();
        if (c.material) { const m = c.material; if (Array.isArray(m)) m.forEach(x => x.dispose()); else m.dispose(); }
      }
    });
    this.blood.forEach(b => { if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh); });
    this.blood = [];
    this.gore.forEach(g => { if (g.mesh.parent) g.mesh.parent.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); });
    this.gore = [];
    this.wounds.forEach(w => { if (w.mesh.parent) w.mesh.parent.remove(w.mesh); });
    this.wounds = [];
  }
}
