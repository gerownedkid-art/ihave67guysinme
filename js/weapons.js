import * as THREE from 'three';

const TEMP_V3 = new THREE.Vector3();
const TEMP_RAY = new THREE.Raycaster();

export class Weapon {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.type = 'pistol'; // pistol | shotgun
    this.ammo = { pistol: 12, shotgun: 8 };
    this.ammoMax = { pistol: 60, shotgun: 32 };
    this.reserve = { pistol: 60, shotgun: 32 };
    this.fireRate = { pistol: 350, shotgun: 900 }; // ms
    this.lastFire = 0;
    this.recoil = 0;
    this.mesh = null;
    this.muzzleLight = null;
    this.buildWeaponMesh();
  }

  buildWeaponMesh() {
    const g = new THREE.Group();
    // pistol: simple block + barrel
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.09, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x22222a, roughness: 0.4 })
    );
    body.position.set(0.16, -0.16, -0.45);
    body.rotation.z = 0.15;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.28, 12),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1f })
    );
    barrel.position.set(0.16, -0.16, -0.66);
    barrel.rotation.z = 0.15;
    g.add(body, barrel);
    this.mesh = g;
    // muzzle flash light
    const light = new THREE.PointLight(0xff5500, 0, 1.2);
    light.position.set(0.16, -0.16, -0.72);
    this.muzzleLight = light;
    g.add(light);
    this.setType('pistol');
  }

  setType(type) {
    this.type = type;
    this.mesh.visible = true;
    this.lastFire = 0;
  }

  canFire(now) {
    return now - this.lastFire >= this.fireRate[this.type];
  }

  fire(now) {
    if (!this.canFire(now)) return null;
    this.lastFire = now;
    const shots = this.type === 'shotgun' ? 8 : 1;
    const spread = this.type === 'shotgun' ? 0.14 : 0.018;
    const results = [];
    const origin = this.camera.position.clone();
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    up.crossVectors(right, forward);
    for (let i = 0; i < shots; i++) {
      const dir = forward.clone()
        .add(right.clone().multiplyScalar((Math.random() - 0.5) * spread))
        .add(up.clone().multiplyScalar((Math.random() - 0.5) * spread))
        .normalize();
      results.push({ origin: origin.clone(), dir });
    }
    this.recoil = this.type === 'shotgun' ? 0.35 : 0.14;
    this.muzzleLight.intensity = 4;
    this.ammo[this.type] = Math.max(0, this.ammo[this.type] - shots);
    if (this.ammo[this.type] <= 0) this.ammo[this.type] = 0;
    return results;
  }

  reload() {
    if (this.ammo[this.type] >= this.ammoMax[this.type]) return;
    const need = this.ammoMax[this.type] - this.ammo[this.type];
    const take = Math.min(need, this.reserve[this.type]);
    this.ammo[this.type] += take;
    this.reserve[this.type] -= take;
  }

  update(dt) {
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 20);
    // bob weapon with recoil
    if (this.mesh) {
      this.mesh.position.z = -0.45 - this.recoil * 0.12;
      this.mesh.position.y = -0.16 + this.recoil * 0.06;
    }
  }

  getAmmoText() {
    return `${this.ammo[this.type]} / ${this.reserve[this.type]}`;
  }
}

export function castShots(results, dummies, scene, onHit) {
  const hits = [];
  results.forEach(r => {
    TEMP_RAY.set(r.origin, r.dir);
    const intersected = [];
    dummies.forEach(d => {
      // raycast against visual meshes of dummy
      d.group.traverse(c => {
        if (!c.isMesh) return;
        const hitsLocal = TEMP_RAY.intersectObject(c, false);
        hitsLocal.forEach(h => { h.dummy = d; h.object = c; intersected.push(h); });
      });
    });
    intersected.sort((a, b) => a.distance - b.distance);
    if (intersected.length) {
      const h = intersected[0];
      const hitPos = h.point.clone();
      const hitNormal = h.face ? h.face.normal.clone() : h.normal.clone();
      hits.push({ dummy: h.dummy, point: hitPos, normal: hitNormal, distance: h.distance, object: h.object });
      if (onHit) onHit(h.dummy, hitPos, hitNormal, h.object);
    }
  });
  return hits;
}

export function spawnMuzzleFlash(weapon, scene) {
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffaa00 })
  );
  flash.position.copy(weapon.muzzleLight.position);
  scene.add(flash);
  const start = performance.now();
  const animate = () => {
    const t = (performance.now() - start) / 120;
    if (t > 1) { scene.remove(flash); flash.geometry.dispose(); flash.material.dispose(); return; }
    flash.scale.setScalar(1 + t);
    flash.material.opacity = 1 - t;
    requestAnimationFrame(animate);
  };
  animate();
}

export function spawnShellEject(weapon, scene) {
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3 })
  );
  shell.position.copy(weapon.mesh.position);
  shell.position.x += 0.08;
  shell.rotation.x = Math.random() * Math.PI;
  scene.add(shell);
  const vel = new THREE.Vector3((Math.random() - 0.5) * 2, 4 + Math.random() * 3, -1 - Math.random());
  const start = performance.now();
  const animate = () => {
    const t = (performance.now() - start) / 700;
    if (t > 1) { scene.remove(shell); shell.geometry.dispose(); shell.material.dispose(); return; }
    shell.position.addScaledVector(vel, 0.016);
    vel.y -= 24 * 0.016;
    shell.rotation.x += 0.2;
    shell.material.opacity = 1 - t;
    requestAnimationFrame(animate);
  };
  animate();
}
