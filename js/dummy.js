import * as THREE from 'three';
import { Ragdoll, BodyPart, Constraint } from './ragdoll.js';

// ---------- material / geometry helpers ----------

const FLESH = 0xe0b088;
const FLESH_DARK = 0xc49a70;
const BONE = 0xeae8e0;
const ORGAN_COLORS = {
  heart: 0xb22222,
  lung: 0x7a2e2e,
  liver: 0x8b2e2e,
  stomach: 0x6b3a2e,
  intestine: 0x8f4a2e,
  brain: 0xcfc0b0,
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({
    color, roughness: 0.85, metalness: 0.1, flatShading: false
  }, opts));
}

function xrayMat(color) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 });
}

function boneMat() {
  return new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.6, metalness: 0.05 });
}

function createCapsule(radius, height, radialSegs, heightSegs, color) {
  const geo = new THREE.CapsuleGeometry(radius, height, radialSegs, heightSegs);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function createSphere(radius, wSeg, hSeg, color, wire = false) {
  const geo = new THREE.SphereGeometry(radius, wSeg, hSeg);
  const m = mat(color);
  if (wire) m.wireframe = true;
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function latheOrgan(points, segments, color, sides = 32) {
  const geo = new THREE.LatheGeometry(points, segments);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function countVertices(mesh) {
  const g = mesh.geometry;
  return g.attributes.position ? g.attributes.position.count : 0;
}

// ---------- procedural organs ----------

function buildHeart() {
  const g = new THREE.Group();
  // simplified heart as two fused spheres + aorta
  const a = createSphere(0.16, 36, 36, ORGAN_COLORS.heart);
  a.position.set(0, 0.08, 0);
  const b = createSphere(0.16, 36, 36, ORGAN_COLORS.heart);
  b.position.set(0, -0.08, 0);
  const aorta = createCapsule(0.05, 0.22, 24, 16, 0x8a1a1a);
  aorta.position.set(0, 0.24, 0);
  aorta.rotation.x = -Math.PI / 2;
  g.add(a, b, aorta);
  return g;
}

function buildLung(side) {
  const g = new THREE.Group();
  const lobes = 3;
  for (let i = 0; i < lobes; i++) {
    const lobe = createSphere(0.14 + i * 0.03, 32, 32, ORGAN_COLORS.lung);
    lobe.position.set(side * (0.09 + i * 0.05), 0.12 - i * 0.06, 0.05 + i * 0.04);
    g.add(lobe);
  }
  return g;
}

function buildLiver() {
  const g = new THREE.Group();
  const main = createSphere(0.22, 44, 44, ORGAN_COLORS.liver);
  main.scale.set(1, 0.85, 1.1);
  const lobe = createSphere(0.14, 36, 36, ORGAN_COLORS.liver);
  lobe.position.set(0.1, -0.05, 0.05);
  g.add(main, lobe);
  return g;
}

function buildStomach() {
  const g = new THREE.Group();
  const s = createSphere(0.15, 40, 40, ORGAN_COLORS.stomach);
  s.position.set(0.08, -0.06, 0.02);
  g.add(s);
  return g;
}

function buildIntestines() {
  const g = new THREE.Group();
  const coils = 24;
  for (let i = 0; i < coils; i++) {
    const seg = createSphere(0.045, 28, 28, ORGAN_COLORS.intestine);
    seg.position.set(Math.sin(t) * 0.16, -0.35 + (i / coils) * 0.28, Math.cos(t) * 0.14);
    seg.scale.set(1, 0.6, 1);
    g.add(seg);
  }
  return g;
}

function buildBrain() {
  const g = new THREE.Group();
  const b = createSphere(0.155, 64, 64, ORGAN_COLORS.brain);
  b.scale.set(1, 0.85, 1.1);
  const stem = createCapsule(0.04, 0.16, 28, 20, 0xa89080);
  stem.position.set(0, -0.23, 0);
  stem.rotation.x = Math.PI / 2;
  g.add(b, stem);
  return g;
}

// ---------- skeleton ----------

function buildBone(len, rad) {
  const g = new THREE.Group();
  const bone = createCapsule(rad, len, 28, 20, BONE);
  bone.position.y = len / 2;
  g.add(bone);
  return g;
}

function buildSkull() {
  const g = new THREE.Group();
  const cranium = createSphere(0.17, 56, 56, BONE);
  const jaw = createSphere(0.11, 40, 40, BONE);
  jaw.position.set(0, -0.13, 0.06);
  jaw.scale.set(1, 0.7, 1.05);
  g.add(cranium, jaw);
  return g;
}

function buildRibcage() {
  const g = new THREE.Group();
  const sternum = createCapsule(0.035, 0.42, 24, 16, BONE);
  sternum.position.y = 0.05;
  g.add(sternum);
  for (let i = 0; i < 6; i++) {
    const y = 0.18 - i * 0.075;
    const r = new THREE.Group();
    const arc = new THREE.Group();
    const left = createCapsule(0.02, 0.5, 20, 14, BONE);
    left.position.set(-0.13, y, 0.02);
    left.rotation.z = -0.35 - i * 0.04;
    const right = left.clone();
    right.position.x = 0.13;
    right.rotation.z = 0.35 + i * 0.04;
    r.add(left, right);
    g.add(r);
  }
  return g;
}

function buildPelvis() {
  const g = new THREE.Group();
  const bowl = createSphere(0.17, 48, 48, BONE);
  bowl.scale.set(1.1, 0.5, 1.25);
  bowl.position.y = -0.02;
  const left = createCapsule(0.03, 0.26, 24, 16, BONE);
  left.position.set(-0.16, -0.02, 0);
  left.rotation.z = 0.35;
  const right = left.clone();
  right.position.x = 0.16;
  right.rotation.z = -0.35;
  g.add(bowl, left, right);
  return g;
}

// ---------- blood particles ----------

class BloodParticle {
  constructor(pos, vel, life, color) {
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.mesh = null;
  }
  update(dt) {
    this.pos.addScaledVector(this.vel, dt);
    this.vel.y += -24 * dt;
    this.vel.multiplyScalar(0.96);
    this.life -= dt;
  }
  dead() { return this.life <= 0; }
}

// ---------- Dummy ----------

const TEMP_V3 = new THREE.Vector3();
const TEMP_Q = new THREE.Quaternion();

export class Dummy {
  constructor(scene, x, y, z) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    scene.add(this.group);

    this.ragdoll = new Ragdoll();
    this.parts = {};      // type -> BodyPart
    this.visuals = {};    // type -> Mesh
    this.organs = [];     // {mesh, type, region, damaged}
    this.bones = [];      // skeleton meshes
    this.wounds = [];     // {mesh, pos, normal, age}
    this.blood = [];
    this.dead = false;
    this.xray = false;
    this.health = 100;
    this.vertexCount = 0;

    this.grabConstraint = null;
    this.grabbedPart = null;
    this.grabPoint = new THREE.Vector3();

    this.build();
    this.recalcVertexCount();
  }

  build() {
    const g = this.group;
    const rd = this.ragdoll;
    const s = 1.0; // scale

    // ---- ragdoll parts (physics) ----
    const parts = [];
    const add = (type, pos, radius, mass, inv = false) => {
      const p = new BodyPart(type, pos.clone(), radius, mass, 0);
      p.invMass = inv ? 0 : p.invMass;
      rd.addPart(p);
      this.parts[type] = p;
      parts.push(p);
      return p;
    };

    const headP = add('head', new THREE.Vector3(0, 1.62, 0), 0.17, 4);
    const torsoP = add('torso', new THREE.Vector3(0, 1.12, 0), 0.26, 12);
    const lUA = add('lUpperArm', new THREE.Vector3(-0.34, 1.32, 0), 0.11, 3);
    const rUA = add('rUpperArm', new THREE.Vector3(0.34, 1.32, 0), 0.11, 3);
    const lLA = add('lLowerArm', new THREE.Vector3(-0.56, 1.04, 0), 0.1, 2.5);
    const rLA = add('rLowerArm', new THREE.Vector3(0.56, 1.04, 0), 0.1, 2.5);
    const lH = add('lHand', new THREE.Vector3(-0.66, 0.84, 0), 0.075, 1.5);
    const rH = add('rHand', new THREE.Vector3(0.66, 0.84, 0), 0.075, 1.5);
    const lULeg = add('lUpperLeg', new THREE.Vector3(-0.15, 0.62, 0), 0.14, 6);
    const rULeg = add('rUpperLeg', new THREE.Vector3(0.15, 0.62, 0), 0.14, 6);
    const lLLeg = add('lLowerLeg', new THREE.Vector3(-0.15, 0.26, 0), 0.12, 5);
    const rLLeg = add('rLowerLeg', new THREE.Vector3(0.15, 0.26, 0), 0.12, 5);
    const lFoot = add('lFoot', new THREE.Vector3(-0.15, 0.04, 0.06), 0.11, 3);
    const rFoot = add('rFoot', new THREE.Vector3(0.15, 0.04, 0.06), 0.11, 3);

    // head fixed-ish (high mass) but not static so it can be knocked
    headP.invMass = 1 / 6;

    // ---- constraints ----
    const con = (a, b, len, stiff) => rd.addConstraint(a, b, len, stiff);
    // spine
    con(headP, torsoP, 0.5, 0.95);
    con(torsoP, lULeg, 0.52, 0.9); con(torsoP, rULeg, 0.52, 0.9);
    // shoulders
    con(torsoP, lUA, 0.34, 0.9); con(torsoP, rUA, 0.34, 0.9);
    // arms
    con(lUA, lLA, 0.26, 0.9); con(rUA, rLA, 0.26, 0.9);
    con(lLA, lH, 0.18, 0.9); con(rLA, rH, 0.18, 0.9);
    // legs
    con(lULeg, lLLeg, 0.38, 0.9); con(rULeg, rLLeg, 0.38, 0.9);
    con(lLLeg, lFoot, 0.26, 0.9); con(rLLeg, rFoot, 0.26, 0.9);
    // pelvic cross
    con(lULeg, rULeg, 0.32, 0.6);

    // ---- high-poly visual meshes per body part ----
    const res = { radial: 112, hseg: 70 };
    const addVis = (type, mesh, offset = new THREE.Vector3()) => {
      mesh.position.copy(offset);
      g.add(mesh);
      this.visuals[type] = mesh;
      this.meshes = this.meshes || [];
      this.meshes.push(mesh);
      return mesh;
    };

    // head
    addVis('head', createSphere(0.17, 100, 100, FLESH));
    // torso detailed
    const torso = new THREE.Group();
    const chest = createCapsule(0.26, 0.72, res.radial, res.hseg, FLESH);
    chest.position.y = 0.18;
    const belly = createCapsule(0.24, 0.62, res.radial, res.hseg, FLESH_DARK);
    belly.position.y = -0.34;
    belly.scale.set(1, 0.9, 1);
    torso.add(chest, belly);
    addVis('torso', torso);

    // arms
    const armMat = mat(FLESH);
    addVis('lUpperArm', createCapsule(0.11, 0.36, res.radial, res.hseg, FLESH));
    addVis('rUpperArm', createCapsule(0.11, 0.36, res.radial, res.hseg, FLESH));
    addVis('lLowerArm', createCapsule(0.10, 0.4, res.radial, res.hseg, FLESH));
    addVis('rLowerArm', createCapsule(0.10, 0.4, res.radial, res.hseg, FLESH));
    addVis('lHand', createSphere(0.075, 72, 72, FLESH));
    addVis('rHand', createSphere(0.075, 72, 72, FLESH));

    // legs
    addVis('lUpperLeg', createCapsule(0.14, 0.5, res.radial, res.hseg, FLESH));
    addVis('rUpperLeg', createCapsule(0.14, 0.5, res.radial, res.hseg, FLESH));
    addVis('lLowerLeg', createCapsule(0.12, 0.46, res.radial, res.hseg, FLESH));
    addVis('rLowerLeg', createCapsule(0.12, 0.46, res.radial, res.hseg, FLESH));
    addVis('lFoot', createSphere(0.11, 72, 72, 0x3a322e));
    addVis('rFoot', createSphere(0.11, 72, 72, 0x3a322e));

    // ---- organs (inside torso) ----
    const organRoot = new THREE.Group();
    organRoot.position.set(0, 0.05, 0.08);
    g.add(organRoot);

    const heart = buildHeart(); heart.position.set(0, 0.14, 0.02);
    organRoot.add(heart);
    this.organs.push({ mesh: heart, type: 'heart', region: 'chest', damaged: false, origMat: heart.material });

    const lLung = buildLung(-1); lLung.position.set(-0.16, 0.08, 0.04);
    const rLung = buildLung(1); rLung.position.set(0.16, 0.08, 0.04);
    organRoot.add(lLung, rLung);
    this.organs.push({ mesh: lLung, type: 'lung', region: 'chest', damaged: false, origMat: lLung.material });
    this.organs.push({ mesh: rLung, type: 'lung', region: 'chest', damaged: false, origMat: rLung.material });

    const liver = buildLiver(); liver.position.set(0.06, -0.28, 0.02);
    organRoot.add(liver);
    this.organs.push({ mesh: liver, type: 'liver', region: 'abdomen', damaged: false, origMat: liver.material });

    const stomach = buildStomach(); stomach.position.set(-0.06, -0.32, 0.02);
    organRoot.add(stomach);
    this.organs.push({ mesh: stomach, type: 'stomach', region: 'abdomen', damaged: false, origMat: stomach.material });

    const intestines = buildIntestines(); intestines.position.set(0, -0.42, 0.02);
    organRoot.add(intestines);
    this.organs.push({ mesh: intestines, type: 'intestine', region: 'abdomen', damaged: false, origMat: intestines.material });

    const brain = buildBrain(); brain.position.set(0, 1.66, 0.02);
    g.add(brain);
    this.organs.push({ mesh: brain, type: 'brain', region: 'head', damaged: false, origMat: brain.material });

    // ---- skeleton ----
    const skelRoot = new THREE.Group();
    this.skelRoot = skelRoot;
    g.add(skelRoot);
    const skull = buildSkull(); skull.position.set(0, 1.66, 0);
    const spine = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const b = buildBone(0.18, 0.05);
      b.position.set(0, 1.0 + i * 0.17, 0);
      spine.add(b);
    }
    const ribcage = buildRibcage(); ribcage.position.set(0, 0.9, 0.02);
    const pelvis = buildPelvis(); pelvis.position.set(0, 0.42, 0);
    const lArmB = buildBone(0.4, 0.045); lArmB.position.set(-0.3, 1.2, 0); lArmB.rotation.z = 0.3;
    const rArmB = buildBone(0.4, 0.045); rArmB.position.set(0.3, 1.2, 0); rArmB.rotation.z = -0.3;
    const lLegB = buildBone(0.55, 0.055); lLegB.position.set(-0.14, 0.55, 0); lLegB.rotation.x = 0.15;
    const rLegB = buildBone(0.55, 0.055); rLegB.position.set(0.14, 0.55, 0); rLegB.rotation.x = -0.15;
    skelRoot.add(skull, spine, ribcage, pelvis, lArmB, rArmB, lLegB, rLegB);
    this.bones = [];
    skelRoot.traverse(c => { if (c.isMesh) this.bones.push(c); });

    // initially hide organs/bones (normal mode)
    this.setXray(false);
  }

  recalcVertexCount() {
    let total = 0;
    const walk = (obj) => {
      obj.traverse(c => { if (c.isMesh) total += countVertices(c); });
    };
    walk(this.group);
    this.vertexCount = total;
    return total;
  }

  // sync visuals to ragdoll positions each frame
  syncVisuals() {
    const lookAt = (mesh, target, up = new THREE.Vector3(0, 1, 0)) => {
      mesh.lookAt(target);
      mesh.up.copy(up);
      mesh.updateMatrixWorld();
    };
    // map visual mesh -> ragdoll part, orient toward child part
    const pairs = [
      ['head', 'torso'],
      ['torso', 'head'],
      ['lUpperArm', 'lLowerArm'],
      ['rUpperArm', 'rLowerArm'],
      ['lLowerArm', 'lHand'],
      ['rLowerArm', 'rHand'],
      ['lUpperLeg', 'lLowerLeg'],
      ['rUpperLeg', 'rLowerLeg'],
      ['lLowerLeg', 'lFoot'],
      ['rLowerLeg', 'rFoot'],
    ];
    pairs.forEach(([a, b]) => {
      const pa = this.parts[a]; const pb = this.parts[b];
      const m = this.visuals[a];
      if (!pa || !pb || !m) return;
      m.position.copy(pa.pos);
      m.lookAt(pb.pos);
      m.rotateX(-Math.PI / 2); // capsule/y-axis alignment
    });
    // single parts without child alignment
    const singles = ['lHand', 'rHand', 'lFoot', 'rFoot'];
    singles.forEach(t => {
      const p = this.parts[t]; const m = this.visuals[t];
      if (p && m) m.position.copy(p.pos);
    });

    if (this.skelRoot && this.parts.torso) {
      this.skelRoot.position.copy(this.parts.torso.pos);
      this.skelRoot.position.y += 0.05;
    }

    // wounds stick to nearest part surface
    this.wounds.forEach(w => {
      const p = this.ragdoll.parts.reduce((best, cur) =>
        cur.pos.distanceTo(w.pos) < best.pos.distanceTo(w.pos) ? cur : best, this.ragdoll.parts[0]);
      w.pos.copy(p.pos).add(w.normal.clone().multiplyScalar(p.radius + 0.02));
      w.mesh.position.copy(w.pos);
      w.mesh.lookAt(w.pos.clone().add(w.normal));
      w.age += 0.016;
    });

    // update blood particles meshes
    this.blood.forEach(b => {
      if (b.mesh) b.mesh.position.copy(b.pos);
    });
  }

  // ---------- damage / trauma ----------

  regionFromPoint(point) {
    // world-space height bands (dummy group base at y=0.6)
    const y = point.y;
    if (y > 2.0) return 'head';
    if (y > 1.05) return 'chest';
    return 'abdomen';
  }

  applyDamage(hitPoint, hitNormal, damage, weaponType) {
    if (this.dead) return;
    this.health -= damage;

    // ragdoll impulse
    const dir = hitNormal.clone().multiplyScalar(-1);
    this.ragdoll.applyImpulseAt(hitPoint, dir, damage * 14);

    // blood particles
    const count = weaponType === 'shotgun' ? 22 : 8;
    this.spawnBlood(hitPoint, dir, count);

    // wound mesh (deformation)
    const wound = this.createWound(hitPoint, hitNormal, damage);
    this.wounds.push(wound);
    this.group.add(wound.mesh);

    // organ damage by region
    const region = this.regionFromPoint(hitPoint);
    this.damageOrgans(region, damage, weaponType);

    // death check
    if (this.health <= 0) {
      this.die();
    } else if (damage > 30) {
      this.stun();
    }
  }

  createWound(point, normal, damage) {
    const size = 0.07 + damage * 0.006;
    const geo = new THREE.SphereGeometry(size, 16, 16);
    // flatten into wound disk
    geo.applyMatrix4(new THREE.Matrix4().makeScale(1, 0.25, 1));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4a0a0a }));
    mesh.position.copy(point);
    mesh.lookAt(point.clone().add(normal));
    mesh.rotateX(Math.PI / 2);
    return { mesh, pos: point.clone(), normal: normal.clone(), age: 0, damage };
  }

  spawnBlood(origin, dir, count) {
    for (let i = 0; i < count; i++) {
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6
      );
      const vel = dir.clone().add(spread).normalize().multiplyScalar(6 + Math.random() * 10);
      const p = new BloodParticle(origin, vel, 0.5 + Math.random() * 0.6, 0x6a0a0a);
      const m = createSphere(0.035 + Math.random() * 0.025, 8, 8, 0x6a0a0a);
      m.position.copy(origin);
      this.group.add(m);
      this.blood.push({ p, mesh: m });
    }
  }

  damageOrgans(region, damage, weaponType) {
    this.organs.forEach(o => {
      if (o.damaged || o.region !== region) return;
      const hitChance = weaponType === 'shotgun' ? 0.75 : 0.5;
      if (Math.random() > hitChance * (damage / 60)) return;
      o.damaged = true;
      o.mesh.traverse(c => {
        if (c.isMesh && c.material) {
          c.material.color.setHex(0x2a0a0a);
          c.material.emissive = new THREE.Color(0x1a0000);
          c.material.emissiveIntensity = 0.4;
        }
      });
      // traumatic: for head/brain or chest/heart high damage -> corpse state
      if ((o.type === 'brain' || o.type === 'heart') && damage > 40) {
        this.health = 0;
      }
    });
    if (region === 'abdomen' && damage > 50) {
      // spill intestines visual
      const intOrgan = this.organs.find(o => o.type === 'intestine');
      if (intOrgan && !intOrgan.damaged) {
        intOrgan.damaged = true;
        intOrgan.mesh.position.y -= 0.15;
        intOrgan.mesh.scale.set(0.6, 0.6, 0.6);
      }
    }
  }

  stun() {
    // brief ragdoll slump
    this.ragdoll.applyImpulseAt(this.parts.torso.pos, new THREE.Vector3(0, 1, 0), 30);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    // make head static so body slumps naturally
    const head = this.parts.head;
    head.invMass = 1 / 60;
  }

  // ---------- x-ray ----------

  setXray(enabled) {
    this.xray = enabled;
    const skinAlpha = enabled ? 0.18 : 1.0;
    // skin meshes
    Object.values(this.visuals).forEach(m => {
      if (!m) return;
      m.traverse(c => {
        if (c.isMesh) {
          c.material.transparent = enabled;
          c.material.opacity = skinAlpha;
          if (!enabled) c.material.opacity = 1;
        }
      });
    });
    // organs
    this.organs.forEach(o => {
      o.mesh.traverse(c => {
        if (c.isMesh && c.material) {
          c.material.transparent = enabled;
          c.material.opacity = enabled ? 0.85 : 1;
          if (!enabled) { c.material.transparent = false; c.material.opacity = 1; }
        }
      });
    });
    // bones
    this.bones.forEach(b => {
      b.visible = enabled;
      if (b.material) {
        b.material.transparent = enabled;
        b.material.opacity = enabled ? 0.9 : 0;
      }
    });
  }

  // ---------- grab / hold wound ----------

  grab(point) {
    if (this.grabConstraint) return;
    // nearest body part
    let nearest = null; let md = Infinity;
    this.ragdoll.parts.forEach(p => {
      const d = point.distanceTo(p.pos);
      if (d < md) { md = d; nearest = p; }
    });
    if (!nearest) return;
    this.grabbedPart = nearest;
    this.grabPoint.copy(point);
    // create a soft constraint from world point to part (mouse drag handled in main)
    this.grabConstraint = { part: nearest, target: point.clone(), stiffness: 0.5 };
  }

  updateGrab(target) {
    if (!this.grabConstraint) return;
    this.grabConstraint.target.copy(target);
    const p = this.grabConstraint.part;
    const dir = new THREE.Vector3().subVectors(this.grabConstraint.target, p.pos);
    const dist = dir.length();
    const pull = dir.normalize().multiplyScalar(Math.min(dist * 18, 40));
    p.applyImpulse(pull);
  }

  release() {
    this.grabConstraint = null;
    this.grabbedPart = null;
  }

  // ---------- step ----------

  step(dt) {
    if (!this.dead && this.grabConstraint) {
      this.updateGrab(this.grabConstraint.target);
    }
    this.ragdoll.step(dt);
    this.syncVisuals();
    this.updateBlood(dt);
  }

  updateBlood(dt) {
    for (let i = this.blood.length - 1; i >= 0; i--) {
      const b = this.blood[i];
      b.p.update(dt);
      if (b.p.dead()) {
        if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
        this.blood.splice(i, 1);
      } else if (b.mesh) {
        b.mesh.position.copy(b.p.pos);
        b.mesh.scale.setScalar(b.p.life / b.p.maxLife);
      }
    }
    // age out old wounds
    for (let i = this.wounds.length - 1; i >= 0; i--) {
      const w = this.wounds[i];
      if (w.age > 12) {
        if (w.mesh.parent) w.mesh.parent.remove(w.mesh);
        this.wounds.splice(i, 1);
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(c => {
      if (c.isMesh) {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          const m = c.material;
          if (Array.isArray(m)) m.forEach(x => x.dispose());
          else m.dispose();
        }
      }
    });
    this.blood.forEach(b => { if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh); });
    this.blood = [];
    this.wounds.forEach(w => { if (w.mesh.parent) w.mesh.parent.remove(w.mesh); });
    this.wounds = [];
  }
}

