import * as THREE from 'three';

// Voxel types
export const VOXEL = {
  AIR: 0,
  STONE: 1,
  DIRT: 2,
  WOOD: 3,
  GLASS: 4,
  METAL: 5,
  CONCRETE: 6,
};

export const VOXEL_MATERIALS = {
  [VOXEL.AIR]: null,
  [VOXEL.STONE]: { color: 0x5a5a66, roughness: 0.9, metalness: 0.1 },
  [VOXEL.DIRT]: { color: 0x5c4033, roughness: 1.0, metalness: 0.0 },
  [VOXEL.WOOD]: { color: 0x8b5a2b, roughness: 0.9, metalness: 0.0 },
  [VOXEL.GLASS]: { color: 0xadd8e6, roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.6, transmission: 0.9 },
  [VOXEL.METAL]: { color: 0x6e6e7a, roughness: 0.3, metalness: 0.9 },
  [VOXEL.CONCRETE]: { color: 0x88888e, roughness: 1.0, metalness: 0.05 },
};

// Voxel hardness (damage threshold to break)
export const VOXEL_HARDNESS = {
  [VOXEL.AIR]: 0,
  [VOXEL.STONE]: 60,
  [VOXEL.DIRT]: 15,
  [VOXEL.WOOD]: 25,
  [VOXEL.GLASS]: 5,
  [VOXEL.METAL]: 100,
  [VOXEL.CONCRETE]: 45,
};

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 64;
const VOXEL_SIZE = 1;

const faces = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

// corner offsets for a unit cube
const cubeCorners = [
  [0,0,0],[1,0,0],[1,1,0],[0,1,0],
  [0,0,1],[1,0,1],[1,1,1],[0,1,1],
];

export class VoxelWorld {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map(); // key "cx,cy,cz" -> Chunk
    this.chunkMeshes = new Map();
    this.voxelSize = VOXEL_SIZE;
    this.chunkSize = CHUNK_SIZE;
    this.chunkHeight = CHUNK_HEIGHT;

    this.debris = []; // physics debris pieces
    this.debrisGroup = new THREE.Group();
    scene.add(this.debrisGroup);

    this._tmpV = new THREE.Vector3();
    this._matCache = new Map();
  }

  chunkKey(cx, cy, cz) {
    return `${cx},${cy},${cz}`;
  }

  getChunk(cx, cy, cz, create = true) {
    const key = this.chunkKey(cx, cy, cz);
    let chunk = this.chunks.get(key);
    if (!chunk && create) {
      chunk = new Chunk(cx, cy, cz, this);
      this.chunks.set(key, chunk);
      this.buildMesh(chunk);
    }
    return chunk;
  }

  // world -> chunk coord
  worldToChunk(wx, wy, wz) {
    return {
      cx: Math.floor(wx / CHUNK_SIZE),
      cy: Math.floor(wy / CHUNK_HEIGHT),
      cz: Math.floor(wz / CHUNK_SIZE),
      lx: ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
      ly: ((wy % CHUNK_HEIGHT) + CHUNK_HEIGHT) % CHUNK_HEIGHT,
      lz: ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
    };
  }

  getVoxel(wx, wy, wz) {
    const { cx, cy, cz, lx, ly, lz } = this.worldToChunk(wx, wy, wz);
    const chunk = this.chunks.get(this.chunkKey(cx, cy, cz));
    if (!chunk) return VOXEL.AIR;
    return chunk.get(lx, ly, lz);
  }

  setVoxel(wx, wy, wz, type) {
    const { cx, cy, cz, lx, ly, lz } = this.worldToChunk(wx, wy, wz);
    let chunk = this.chunks.get(this.chunkKey(cx, cy, cz));
    if (!chunk) {
      if (type === VOXEL.AIR) return;
      chunk = this.getChunk(cx, cy, cz, true);
    }
    chunk.set(lx, ly, lz, type);
    this.markDirty(chunk);
    // rebuild neighbors that may show a face toward this voxel
    this.updateNeighbors(wx, wy, wz, chunk);
    return chunk;
  }

  markDirty(chunk) {
    chunk.dirty = true;
  }

  updateNeighbors(wx, wy, wz, chunk) {
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    dirs.forEach(([dx,dy,dz]) => {
      const c = this.worldToChunk(wx + dx, wy + dy, wz + dz);
      const nc = this.chunks.get(this.chunkKey(c.cx, c.cy, c.cz));
      if (nc) nc.dirty = true;
    });
    chunk.dirty = true;
  }

  buildMesh(chunk) {
    // remove old mesh
    const old = this.chunkMeshes.get(chunk.key());
    if (old) { this.scene.remove(old); old.geometry.dispose(); old.material.dispose(); this.chunkMeshes.delete(chunk.key()); }

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const colors = [];
    const uvs = [];

    const mat = VOXEL_MATERIALS[chunk.type] || null;

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const t = chunk.get(x, y, z);
          if (t === VOXEL.AIR) continue;
          const m = VOXEL_MATERIALS[t];
          if (!m) continue;
          // for each face, emit if neighbor is air or different/transparent
          for (let f = 0; f < 6; f++) {
            const n = faces[f];
            const nx = x + n[0], ny = y + n[1], nz = z + n[2];
            const nt = this.getVoxelAtChunk(chunk, nx, ny, nz);
            const neighborMat = VOXEL_MATERIALS[nt];
            // skip face if neighbor is same opaque type
            if (nt === t && (!m.transparent)) continue;
            // skip if neighbor is glass-like transparent too (avoid double glass faces partially)
            this.addFace(geometry, x, y, z, n[0], n[1], n[2], t, positions, normals, colors, uvs);
          }
        }
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: mat.roughness,
      metalness: mat.metalness,
      transparent: !!mat.transparent,
      opacity: mat.opacity !== undefined ? mat.opacity : 1,
      transmission: mat.transmission,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.chunkMeshes.set(chunk.key(), mesh);
    chunk.dirty = false;
    chunk.mesh = mesh;
  }

  getVoxelAtChunk(chunk, x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      // need neighboring chunk
      const wx = chunk.cx * CHUNK_SIZE + x;
      const wy = chunk.cy * CHUNK_HEIGHT + y;
      const wz = chunk.cz * CHUNK_SIZE + z;
      return this.getVoxel(wx, wy, wz);
    }
    return chunk.get(x, y, z);
  }

  addFace(geometry, x, y, z, nx, ny, nz, type, positions, normals, colors, uvs) {
    // build a quad for the face normal (nx,ny,nz)
    // pick two tangent vectors
    const u = new THREE.Vector3();
    const v = new THREE.Vector3();
    const normal = new THREE.Vector3(nx, ny, nz);

    // find a non-parallel vector
    const tmp = Math.abs(nx) > 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
    u.crossVectors(normal, tmp).normalize();
    v.crossVectors(normal, u).normalize();

    const base = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
    const half = 0.5;
    const corners = [
      base.clone().addScaledVector(u, -half).addScaledVector(v, -half),
      base.clone().addScaledVector(u,  half).addScaledVector(v, -half),
      base.clone().addScaledVector(u,  half).addScaledVector(v,  half),
      base.clone().addScaledVector(u, -half).addScaledVector(v,  half),
    ];

    const c = VOXEL_MATERIALS[type].color;
    const r = (c >> 16 & 255) / 255;
    const g = (c >> 8 & 255) / 255;
    const b = (c & 255) / 255;

    // two triangles
    const tri = [[0,1,2],[0,2,3]];
    tri.forEach(([a,b2,c2]) => {
      [a,b2,c2].forEach(idx => {
        const p = corners[idx];
        positions.push(p.x, p.y, p.z);
        normals.push(nx, ny, nz);
        colors.push(r, g, b);
        // simple planar uv
        uvs.push((p.x - Math.floor(p.x)), (p.z - Math.floor(p.z)));
      });
    });
  }

  // explosion / damage sphere: break voxels within radius, apply impulse to debris
  explode(wx, wy, wz, radius, power) {
    const r2 = radius * radius;
    const affected = [];
    const min = Math.floor(wx - radius) - 1;
    const max = Math.ceil(wx + radius) + 1;
    const miny = Math.floor(wy - radius) - 1;
    const maxy = Math.ceil(wy + radius) + 1;
    const minz = Math.floor(wz - radius) - 1;
    const maxz = Math.ceil(wz + radius) + 1;

    const center = new THREE.Vector3(wx, wy, wz);
    for (let y = miny; y <= maxy; y++) {
      for (let z = minz; z <= maxz; z++) {
        for (let x = min; x <= max; x++) {
          const d2 = (x - wx) * (x - wx) + (y - wy) * (y - wy) + (z - wz) * (z - wz);
          if (d2 > r2) continue;
          const t = this.getVoxel(x, y, z);
          if (t === VOXEL.AIR) continue;
          const hardness = VOXEL_HARDNESS[t];
          // damage = power * falloff
          const dist = Math.sqrt(d2);
          const damage = power * Math.max(0, 1 - dist / radius);
          if (damage >= hardness) {
            this.setVoxel(x, y, z, VOXEL.AIR);
            affected.push({ x, y, z, type: t });
          }
        }
      }
    }

    // spawn debris chunks from affected voxels
    affected.forEach(a => {
      this.spawnDebris(a.x + 0.5, a.y + 0.5, a.z + 0.5, a.type, center);
    });

    return affected.length;
  }

  spawnDebris(x, y, z, type, origin) {
    const m = VOXEL_MATERIALS[type];
    const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const mat = new THREE.MeshStandardMaterial({
      color: m.color, roughness: m.roughness, metalness: m.metalness,
      transparent: m.transparent, opacity: m.opacity, transmission: m.transmission,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.debrisGroup.add(mesh);

    const dir = new THREE.Vector3(x, y, z).sub(origin).normalize();
    const spread = new THREE.Vector3((Math.random()-0.5)*0.5,(Math.random()-0.5)*0.5,(Math.random()-0.5)*0.5);
    const vel = dir.clone().add(spread).normalize().multiplyScalar(8 + Math.random() * 10);
    const angular = new THREE.Vector3(Math.random()*4, Math.random()*4, Math.random()*4);

    this.debris.push({ mesh, vel, angular, life: 5 + Math.random() * 5, type, disposeAssets: true });
  }

  updateDebris(dt) {
    const gravity = new THREE.Vector3(0, -28, 0);
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vel.addScaledVector(gravity, dt);
      d.vel.multiplyScalar(0.96);
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.angular.x * dt;
      d.mesh.rotation.y += d.angular.y * dt;
      d.mesh.rotation.z += d.angular.z * dt;
      d.life -= dt;
      if (d.life <= 0) {
        this.debrisGroup.remove(d.mesh);
        if (d.disposeAssets) {
          d.mesh.geometry.dispose();
          d.mesh.material.dispose();
        }
        this.debris.splice(i, 1);
      }
    }
  }

  update() {
    // rebuild dirty chunks
    this.chunks.forEach(chunk => {
      if (chunk.dirty) this.buildMesh(chunk);
    });
    this.updateDebris(1/60);
  }

  dispose() {
    this.chunkMeshes.forEach(m => { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    this.chunkMeshes.clear();
    this.chunks.clear();
    this.debris.forEach(d => { this.debrisGroup.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.dispose(); });
    this.debris = [];
    this.scene.remove(this.debrisGroup);
  }
}

class Chunk {
  constructor(cx, cy, cz, world) {
    this.cx = cx; this.cy = cy; this.cz = cz;
    this.world = world;
    this.key = () => world.chunkKey(cx, cy, cz);
    this.data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    this.dirty = true;
    this.mesh = null;
    // default: fill bottom layer with stone
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        this.set(x, 0, z, VOXEL.STONE);
      }
    }
  }
  idx(x, y, z) { return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x; }
  get(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return VOXEL.AIR;
    return this.data[this.idx(x, y, z)];
  }
  set(x, y, z, v) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return;
    this.data[this.idx(x, y, z)] = v;
  }
}

export { CHUNK_SIZE, CHUNK_HEIGHT, VOXEL_SIZE };
