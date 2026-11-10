import * as THREE from 'three';

const TEMP_RAY = new THREE.Raycaster();

export const WEAPONS = {
  pistol: { fireRate: 350, shots: 1, spread: 0.018, damage: 22, recoil: 0.14, ammo: 12, reserve: 60, ammoMax: 12 },
  shotgun: { fireRate: 900, shots: 8, spread: 0.14, damage: 10, recoil: 0.35, ammo: 8, reserve: 32, ammoMax: 8 },
  rifle: { fireRate: 150, shots: 1, spread: 0.01, damage: 30, recoil: 0.2, ammo: 30, reserve: 90, ammoMax: 30 },
  sniper: { fireRate: 1100, shots: 1, spread: 0.004, damage: 90, recoil: 0.5, ammo: 5, reserve: 15, ammoMax: 5 },
  smg: { fireRate: 80, shots: 1, spread: 0.05, damage: 14, recoil: 0.09, ammo: 30, reserve: 120, ammoMax: 30 },
};

export class Weapon {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.type = 'pistol';
    this.cfg = WEAPONS[this.type];
    this.ammo = { pistol: 12, shotgun: 8, rifle: 30, sniper: 5, smg: 30 };
    this.reserve = { pistol: 60, shotgun: 32, rifle: 90, sniper: 15, smg: 120 };
    this.ammoMax = { pistol: 12, shotgun: 8, rifle: 30, sniper: 5, smg: 30 };
    this.lastFire = 0;
    this.recoil = 0;
    this.mesh = null;
    this.muzzleLight = null;
    this.buildWeaponMesh();
  }

  buildWeaponMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x22222a, roughness: 0.4 })
    );
    body.position.set(0.18, -0.17, -0.5);
    body.rotation.z = 0.15;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.32, 12),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1f })
    );
    barrel.position.set(0.18, -0.17, -0.74);
    barrel.rotation.z = 0.15;
    g.add(body, barrel);
    this.mesh = g;
    const light = new THREE.PointLight(0xff5500, 0, 1.4);
    light.position.set(0.18, -0.17, -0.8);
    this.muzzleLight = light;
    g.add(light);
    this.setType('pistol');
  }

  setType(type) {
    this.type = type;
    this.cfg = WEAPONS[type];
    this.mesh.visible = true;
    this.lastFire = 0;
  }

  canFire(now) {
    return now - this.lastFire >= this.cfg.fireRate;
  }

  fire(now) {
    if (!this.canFire(now)) return null;
    if (this.ammo[this.type] <= 0) return null;
    this.lastFire = now;
    const shots = this.cfg.shots;
    const spread = this.cfg.spread;
    const results = [];
    const origin = this.camera.position.clone();
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    up.crossVectors(right, forward);
    for (let i = 0; i < shots; i++) {
      const dir = forward.clone()
        .add(right.clone().multiplyScalar((Math.random()-0.5)*spread))
        .add(up.clone().multiplyScalar((Math.random()-0.5)*spread))
        .normalize();
      results.push({ origin: origin.clone(), dir });
    }
    this.recoil = this.cfg.recoil;
    this.muzzleLight.intensity = 5;
    this.ammo[this.type] = Math.max(0, this.ammo[this.type] - shots);
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
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 25);
    if (this.mesh) {
      this.mesh.position.z = -0.5 - this.recoil * 0.15;
      this.mesh.position.y = -0.17 + this.recoil * 0.08;
    }
  }

  getAmmoText() {
    return `${this.ammo[this.type]} / ${this.reserve[this.type]}`;
  }
}

export function castShots(results, targets, scene, onHit) {
  const hits = [];
  results.forEach(r => {
    TEMP_RAY.set(r.origin, r.dir);
    const intersected = [];
    targets.forEach(t => {
      // raycast group visuals
      t.group.traverse(c => {
        if (!c.isMesh) return;
        const hl = TEMP_RAY.intersectObject(c, false);
        hl.forEach(h => { h.target = t; h.object = c; intersected.push(h); });
      });
    });
    intersected.sort((a, b) => a.distance - b.distance);
    if (intersected.length) {
      const h = intersected[0];
      const normal = h.face ? h.face.normal.clone() : (h.normal || new THREE.Vector3(0,1,0)).clone();
      const hit = { target: h.target, point: h.point.clone(), normal, distance: h.distance, object: h.object };
      hits.push(hit);
      if (onHit) onHit(h.target, h.point.clone(), normal, h.object);
    }
  });
  return hits;
}

export function spawnMuzzleFlash(weapon, scene) {
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
  flash.position.copy(weapon.muzzleLight.position);
  scene.add(flash);
  const start = performance.now();
  const animate = () => {
    const t = (performance.now() - start) / 100;
    if (t > 1) { scene.remove(flash); flash.geometry.dispose(); flash.material.dispose(); return; }
    flash.scale.setScalar(1 + t * 2);
    flash.material.opacity = 1 - t;
    requestAnimationFrame(animate);
  };
  animate();
}

export function spawnShellEject(weapon, scene) {
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3 }));
  shell.position.copy(weapon.mesh.position);
  shell.position.x += 0.09;
  shell.rotation.x = Math.random() * Math.PI;
  scene.add(shell);
  const vel = new THREE.Vector3((Math.random()-0.5)*2, 4 + Math.random()*3, -1 - Math.random());
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
