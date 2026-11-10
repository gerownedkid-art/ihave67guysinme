import * as THREE from 'three';

// Advanced trauma system: blood decals (projected onto geometry), skeletal fracturing
// (breaking bones/constraints), organ damage, wound persistence.

const BLOOD_COLOR = 0x6a0a0a;

export class BloodDecal {
  constructor(scene) {
    this.scene = scene;
    this.decals = []; // {mesh, pos, normal, age, life}
    this.geometryPool = [];
    this._tmp = new THREE.Vector3();
  }

  add(point, normal, size = 0.35, color = BLOOD_COLOR) {
    // Project a blood splat decal onto surface. Use a thin oriented cylinder/disk.
    const geo = new THREE.CylinderGeometry(size * 0.5, size * 0.5, 0.02, 24, 1);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    mesh.lookAt(point.clone().add(normal));
    mesh.translateZ(0.011); // slight offset to avoid z-fighting
    this.scene.add(mesh);
    const d = { mesh, pos: point.clone(), normal: normal.clone(), age: 0, life: 30 + Math.random() * 20 };
    this.decals.push(d);
    return d;
  }

  update(dt) {
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.age += dt;
      const t = Math.min(1, d.age / d.life);
      d.mesh.material.opacity = 1 - t;
      if (t >= 1) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        this.decals.splice(i, 1);
      }
    }
  }

  dispose() {
    this.decals.forEach(d => {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.mesh.material.dispose();
    });
    this.decals = [];
  }
}

// Fracture point on a bone/constraint. When damage exceeds threshold, snap a constraint
// and spawn bone shards.
export class FractureSystem {
  constructor(scene) {
    this.scene = scene;
    this.fractures = []; // {pos, normal, boneType, age}
    this.shards = []; // {mesh, vel, angular, life}
    this.shardGroup = new THREE.Group();
    scene.add(this.shardGroup);
  }

  fracture(point, normal, force, boneType = 'limb') {
    const d = { pos: point.clone(), normal: normal.clone(), boneType, age: 0, life: 20 };
    this.fractures.push(d);
    this.spawnShards(point, normal, force, boneType);
    return d;
  }

  spawnShards(point, normal, force, boneType) {
    const count = boneType === 'skull' ? 12 : 6;
    const color = 0xeae8e0;
    for (let i = 0; i < count; i++) {
      const size = 0.04 + Math.random() * 0.08;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(point);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.shardGroup.add(mesh);

      const spread = new THREE.Vector3((Math.random()-0.5)*1.5, (Math.random()-0.5)*1.5, (Math.random()-0.5)*1.5);
      const dir = normal.clone().add(spread).normalize();
      const vel = dir.multiplyScalar(4 + Math.random() * force * 0.1);
      const angular = new THREE.Vector3(Math.random()*6, Math.random()*6, Math.random()*6);
      this.shards.push({ mesh, vel, angular, life: 2.5 + Math.random()*2 });
    }
  }

  update(dt) {
    const gravity = new THREE.Vector3(0, -28, 0);
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.vel.addScaledVector(gravity, dt);
      s.vel.multiplyScalar(0.94);
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.angular.x * dt;
      s.mesh.rotation.y += s.angular.y * dt;
      s.mesh.rotation.z += s.angular.z * dt;
      s.life -= dt;
      if (s.life <= 0) {
        this.shardGroup.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this.shards.splice(i, 1);
      }
    }
    // age out fracture markers (no visual marker for now, just track)
    for (let i = this.fractures.length - 1; i >= 0; i--) {
      this.fractures[i].age += dt;
      if (this.fractures[i].age > this.fractures[i].life) this.fractures.splice(i, 1);
    }
  }

  dispose() {
    this.shards.forEach(s => { this.shardGroup.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); });
    this.shards = [];
    this.scene.remove(this.shardGroup);
  }
}

// Trauma manager ties together decals, fractures, organ damage on a Dummy.
export class TraumaSystem {
  constructor(scene) {
    this.scene = scene;
    this.decalSystem = new BloodDecal(scene);
    this.fractureSystem = new FractureSystem(scene);
    this.woundHistory = [];
  }

  registerDummy(dummy) {
    dummy.trauma = this;
  }

  onHit(hitPoint, hitNormal, damage, weaponType) {
    // 1. blood decal at impact
    const size = 0.2 + damage * 0.005;
    this.decalSystem.add(hitPoint, hitNormal, size);

    // 2. blood spray particles (via LiquidSystem if attached)
    const dir = hitNormal.clone().negate();

    // 3. wound + fracture
    const woundDummy = hitPoint.userData && hitPoint.userData.dummy;
    const region = 'torso';
    if (damage > 35 && Math.random() < 0.6) {
      this.fractureSystem.fracture(hitPoint, hitNormal, damage, 'limb');
    }
    if (damage > 70 && Math.random() < 0.4) {
      this.fractureSystem.fracture(hitPoint, hitNormal, damage, 'skull');
    }
  }

  update(dt) {
    this.decalSystem.update(dt);
    this.fractureSystem.update(dt);
  }

  dispose() {
    this.decalSystem.dispose();
    this.fractureSystem.dispose();
  }
}
