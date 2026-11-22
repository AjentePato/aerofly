import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ELEVATED_PAD, LAKE_AREA, MAIN_HELIPAD, RADIO_TOWER, WIND_TURBINES, getWorldRocks, getWorldTrees, groundHeightAt } from './physics';
import { ROAD_SEGMENTS, buildWorldStructures, distToSegment2D, type StructureMaterialKey } from './structures';
import type { GatePoint, MissionDefinition, MissionProgress } from './types';

export interface GateVisual {
  group: THREE.Group;
  ringMat: THREE.MeshStandardMaterial;
  beaconMat: THREE.MeshBasicMaterial;
}

export interface WorldHandles {
  turbineRotors: THREE.Group[];
  windsockCone: THREE.Mesh;
  towerBeaconMat: THREE.MeshStandardMaterial;
  hoverZoneMesh: THREE.Mesh;
  landingBeaconMesh: THREE.Mesh;
  gateGroup: THREE.Group;
  gateVisuals: GateVisual[];
  sunLight: THREE.DirectionalLight;
  sunDirection: THREE.Vector3;
  environmentColliders: THREE.Object3D[];
  updateMissionVisuals: (mission: MissionDefinition, progress: MissionProgress, elapsed: number) => void;
  dispose: () => void;
}

function createHelipadTexture(label: string, accentColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Concrete base
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle concrete grain
  for (let i = 0; i < 2400; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * 512;
    const y = (Math.sin(i * 78.233) * 19341.231 % 1 + 1) % 1 * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, y, 3, 3);
  }

  // Outer safety ring
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(256, 256, 212, 0, Math.PI * 2);
  ctx.stroke();

  // Inner dashed ring
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 6;
  ctx.setLineDash([24, 18]);
  ctx.beginPath();
  ctx.arc(256, 256, 168, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Center H
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(178, 152, 32, 208);
  ctx.fillRect(302, 152, 32, 208);
  ctx.fillRect(178, 240, 156, 32);

  // Label at bottom
  ctx.fillStyle = accentColor;
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 256, 444);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTerrainDetailTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 4500; i++) {
    const x = (i * 73) % 256;
    const y = (i * 139 + Math.floor(i / 256) * 29) % 256;
    const shade = 110 + ((i * 37) % 40);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  return tex;
}

function createMasonryBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle weathered brick/concrete courses + pitting
  ctx.fillStyle = '#686868';
  for (let y = 0; y < 256; y += 32) {
    ctx.fillRect(0, y, 256, 3);
    const offset = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = offset; x < 256; x += 64) {
      ctx.fillRect(x, y, 3, 32);
    }
  }
  for (let i = 0; i < 1800; i++) {
    const x = (i * 97) % 256;
    const y = (i * 53 + Math.floor(i / 64) * 19) % 256;
    const v = 96 + ((i * 29) % 64);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const c1 = vx * wx + vz * wz;
  if (c1 <= 0) return Math.hypot(px - ax, pz - az);
  const c2 = vx * vx + vz * vz;
  if (c2 <= c1) return Math.hypot(px - bx, pz - bz);
  const t = c1 / c2;
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}

export function buildTrainingWorld(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean
): WorldHandles {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // 1. Studio Environment Reflection (RoomEnvironment) + Atmospheric Sky
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmremGenerator.dispose();

  const sky = new Sky();
  sky.scale.setScalar(6500);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 4.2;
  skyUniforms['rayleigh'].value = 1.6;
  skyUniforms['mieCoefficient'].value = 0.004;
  skyUniforms['mieDirectionalG'].value = 0.82;

  const sunVec = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(90 - 34); // 34 deg sun elevation
  const theta = THREE.MathUtils.degToRad(142);
  sunVec.setFromSphericalCoords(1, phi, theta);
  skyUniforms['sunPosition'].value.copy(sunVec);

  scene.fog = new THREE.FogExp2(0xc7d9e8, 0.0017);

  // 2. Warm/Cool 3-Point Outdoor Lighting Rig
  const hemiLight = new THREE.HemisphereLight(0x9ed0ff, 0x3b4d34, 0.95);
  hemiLight.position.set(0, 80, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.5);
  sunLight.position.copy(sunVec).multiplyScalar(140);
  sunLight.castShadow = !isSoftwareGl;
  if (!isSoftwareGl) {
    sunLight.shadow.mapSize.width = 1536;
    sunLight.shadow.mapSize.height = 1536;
    const d = 95;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 340;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
  }
  scene.add(sunLight);
  scene.add(sunLight.target);

  const rimLight = new THREE.DirectionalLight(0xbfe0ff, 0.55);
  rimLight.position.set(-120, 45, 110);
  scene.add(rimLight);

  // 3. Open-World Procedural Terrain (1360m x 1360m expansive valley + continuous mountain horizon)
  const terrainSize = 1360;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, 140, 140);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const cGrass = new THREE.Color(0x466d3b);
  const cAirfield = new THREE.Color(0x4d7740);
  const cSand = new THREE.Color(0x9a8f6f);
  const cTrail = new THREE.Color(0x7c7158);
  const cRock = new THREE.Color(0x5e6770);
  const tmpColor = new THREE.Color();

  const roadSegments = ROAD_SEGMENTS;

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = groundHeightAt(x, z);
    posAttr.setY(i, y);

    const r = Math.hypot(x, z);
    if (y < -0.6) {
      tmpColor.copy(cSand);
    } else if (y > 12.0) {
      const rockMix = Math.min(1, (y - 12.0) / 14);
      tmpColor.copy(cGrass).lerp(cRock, rockMix);
    } else if (r < 48) {
      tmpColor.copy(cAirfield);
    } else {
      const n = 0.5 + 0.5 * Math.sin(x * 0.055 + z * 0.045);
      tmpColor.copy(cAirfield).lerp(cGrass, n * 0.85);
    }

    // Blend subtle dirt access trails connecting zones (zero Z-fighting!)
    if (r > 12 && y > -0.4 && y < 12) {
      let minRoad = 999;
      for (const [ax, az, bx, bz] of roadSegments) {
        const d = distToSegment2D(x, z, ax, az, bx, bz);
        if (d < minRoad) minRoad = d;
      }
      if (minRoad < 4.5) {
        const blend = Math.max(0, 1 - minRoad / 4.5) * 0.72;
        tmpColor.lerp(cTrail, blend);
      }
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainBump = createTerrainDetailTexture();
  terrainBump.repeat.set(90, 90);
  terrainBump.anisotropy = maxAniso;
  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.02,
    bumpMap: terrainBump,
    bumpScale: 0.25,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // 4. Expanded Lake Water Plane (NE basin)
  const lakeGeo = new THREE.CircleGeometry(LAKE_AREA.waterRadius, 56);
  lakeGeo.rotateX(-Math.PI / 2);
  const lakeMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a6985,
    roughness: 0.14,
    metalness: 0.12,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15,
  });
  const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
  lakeMesh.position.set(LAKE_AREA.x, LAKE_AREA.waterLevelY, LAKE_AREA.z);
  lakeMesh.receiveShadow = true;
  scene.add(lakeMesh);

  // 5. Main Takeoff Helipad H & Runway Strip
  const mainPadTex = createHelipadTexture('DECOLAGEM', '#f59e0b');
  mainPadTex.anisotropy = maxAniso;
  const padMat = new THREE.MeshStandardMaterial({
    map: mainPadTex,
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.05,
  });
  const padGeo = new THREE.CylinderGeometry(MAIN_HELIPAD.radius, MAIN_HELIPAD.radius + 0.35, 0.34, 32);
  const mainPad = new THREE.Mesh(padGeo, [
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 }),
    padMat,
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 }),
  ]);
  mainPad.position.set(MAIN_HELIPAD.x, MAIN_HELIPAD.topY - 0.17, MAIN_HELIPAD.z);
  mainPad.receiveShadow = true;
  scene.add(mainPad);

  // Runway approach strip heading north (-Z), cleanly abutting helipad without Z-fighting terrain
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x2a3441, roughness: 0.82 });
  const stripMesh = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.28, 38.5), stripMat);
  stripMesh.position.set(0, -0.02, -23.75);
  stripMesh.receiveShadow = true;
  scene.add(stripMesh);

  // Runway centerline dashes clearly proud above strip top (y=0.12 -> dash y=0.125..0.165)
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
  for (let i = 0; i < 9; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 2.2), dashMat);
    dash.position.set(0, 0.145, -7 - i * 4.2);
    scene.add(dash);
  }

  // 6. Windsock Pole beside Main Helipad
  const windsockGroup = new THREE.Group();
  windsockGroup.position.set(7.5, groundHeightAt(7.5, -2), -2);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.75 });
  const wsPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.6, 12), poleMat);
  wsPole.position.y = 2.3;
  wsPole.castShadow = true;
  windsockGroup.add(wsPole);

  const coneGeo = new THREE.ConeGeometry(0.32, 1.45, 12, 1, true);
  coneGeo.rotateZ(-Math.PI / 2);
  coneGeo.translate(0.75, 0, 0);
  const windsockCone = new THREE.Mesh(
    coneGeo,
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.65, side: THREE.DoubleSide })
  );
  windsockCone.position.set(0, 4.35, 0);
  windsockGroup.add(windsockCone);
  scene.add(windsockGroup);

  // 7. Elevated Precision Landing Platform (NE)
  const elevGroup = new THREE.Group();
  const elevGroundY = groundHeightAt(ELEVATED_PAD.x, ELEVATED_PAD.z);
  elevGroup.position.set(ELEVATED_PAD.x, 0, ELEVATED_PAD.z);

  const elevPadTex = createHelipadTexture('ALVO B', '#38bdf8');
  elevPadTex.anisotropy = maxAniso;
  const elevTop = new THREE.Mesh(
    new THREE.CylinderGeometry(ELEVATED_PAD.radius, ELEVATED_PAD.radius + 0.2, 0.45, 32),
    [
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: elevPadTex, color: 0xffffff, roughness: 0.72 }),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 }),
    ]
  );
  elevTop.position.y = ELEVATED_PAD.topY - 0.225;
  elevTop.receiveShadow = true;
  elevTop.castShadow = true;
  elevGroup.add(elevTop);

  // 4 Concrete Support Columns grounded below terrain
  const colHeight = ELEVATED_PAD.topY - elevGroundY + 1.5;
  const colMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
  for (const [cx, cz] of [
    [-2.2, -2.2],
    [2.2, -2.2],
    [-2.2, 2.2],
    [2.2, 2.2],
  ]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, colHeight, 12), colMat);
    col.position.set(cx, ELEVATED_PAD.topY - 0.4 - colHeight * 0.5, cz);
    col.castShadow = true;
    elevGroup.add(col);
  }
  scene.add(elevGroup);

  // 8. Radio Tower Landmark (28m tall, visible from spawn!)
  const towerGroup = new THREE.Group();
  const towerBaseY = groundHeightAt(RADIO_TOWER.x, RADIO_TOWER.z);
  towerGroup.position.set(RADIO_TOWER.x, towerBaseY, RADIO_TOWER.z);

  const towerBase = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 2.4, 4.4),
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.88 })
  );
  towerBase.position.y = 0.0;
  towerBase.receiveShadow = true;
  towerGroup.add(towerBase);

  const redSteel = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.42, metalness: 0.55 });
  const whiteSteel = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.38, metalness: 0.55 });

  // 4 tapered legs + 6 horizontal tier rings
  const legGeo = new THREE.CylinderGeometry(0.11, 0.18, RADIO_TOWER.height, 8);
  for (const [lx, lz] of [
    [-1.1, -1.1],
    [1.1, -1.1],
    [-1.1, 1.1],
    [1.1, 1.1],
  ]) {
    const leg = new THREE.Mesh(legGeo, redSteel);
    leg.position.set(lx * 0.72, RADIO_TOWER.height * 0.5 + 0.8, lz * 0.72);
    leg.rotation.z = lx * 0.032;
    leg.rotation.x = -lz * 0.032;
    leg.castShadow = true;
    towerGroup.add(leg);
  }

  for (let tier = 0; tier < 6; tier++) {
    const y = 3.5 + tier * 4.2;
    const w = 2.4 - tier * 0.25;
    const ring = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.22, w),
      tier % 2 === 0 ? whiteSteel : redSteel
    );
    ring.position.y = y;
    towerGroup.add(ring);
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 4.5, 10), whiteSteel);
  mast.position.y = RADIO_TOWER.height + 2.2;
  towerGroup.add(mast);

  const towerBeaconMat = new THREE.MeshStandardMaterial({
    color: 0xff3b30,
    emissive: 0xff3b30,
    emissiveIntensity: 3.0,
    roughness: 0.2,
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), towerBeaconMat);
  beacon.position.y = RADIO_TOWER.height + 4.5;
  towerGroup.add(beacon);
  scene.add(towerGroup);

  // 9. Four Composite Wind Turbines on the Outer Ridges (synced with physics hitboxes)
  const turbineRotors: THREE.Group[] = [];
  const turbineMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.2 });
  const nacelleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.28, metalness: 0.35 });

  for (const wt of WIND_TURBINES) {
    const tGroup = new THREE.Group();
    const ty = groundHeightAt(wt.x, wt.z);
    tGroup.position.set(wt.x, ty, wt.z);
    tGroup.rotation.y = wt.yaw;

    const mastMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.96, wt.mastHeight, 14), turbineMat);
    mastMesh.position.y = wt.mastHeight * 0.5;
    mastMesh.castShadow = true;
    tGroup.add(mastMesh);

    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 3.6), nacelleMat);
    nacelle.position.set(0, 28.2, 0.5);
    tGroup.add(nacelle);

    const rotor = new THREE.Group();
    rotor.position.set(0, 28.2, 2.4);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.25, 14), turbineMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.45;
    rotor.add(nose);

    const bladeGeo = new THREE.BoxGeometry(0.5, 11.5, 0.16);
    bladeGeo.translate(0, 5.9, 0);
    for (let b = 0; b < 3; b++) {
      const bladeWrap = new THREE.Group();
      bladeWrap.rotation.z = (b * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(bladeGeo, turbineMat);
      blade.rotation.y = 0.15;
      bladeWrap.add(blade);
      rotor.add(bladeWrap);
    }

    tGroup.add(rotor);
    turbineRotors.push(rotor);
    scene.add(tGroup);
  }

  // 10. Pilot Observation Stand & Training Hangar
  const standPos = { x: -16, z: 16 };
  const standBaseY = groundHeightAt(standPos.x, standPos.z);
  const hangarGroup = new THREE.Group();
  hangarGroup.position.set(standPos.x, standBaseY, standPos.z);
  hangarGroup.rotation.y = 0.65;

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 1.4, 5.2),
    new THREE.MeshStandardMaterial({ color: 0x78553a, roughness: 0.82 })
  );
  deck.position.y = -0.1;
  deck.receiveShadow = true;
  hangarGroup.add(deck);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 2.8, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.25 })
  );
  cabin.position.set(-0.6, 2.0, 0);
  cabin.castShadow = true;
  hangarGroup.add(cabin);

  const cabinGlass = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 1.1, 2.6),
    new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.25,
      clearcoat: 1.0,
    })
  );
  cabinGlass.position.set(-0.6, 2.35, 0);
  hangarGroup.add(cabinGlass);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 0.25, 4.6),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.3 })
  );
  roof.position.set(-0.4, 3.5, 0);
  roof.castShadow = true;
  hangarGroup.add(roof);
  scene.add(hangarGroup);

  // 10b. Pass-Through Architectural Structures (Abandoned Houses, Ruins, Hangar, Containers, Bridge)
  const masonryBump = createMasonryBumpTexture();
  masonryBump.anisotropy = maxAniso;

  const structureMaterials: Record<StructureMaterialKey, THREE.MeshStandardMaterial> = {
    concrete_weathered: new THREE.MeshStandardMaterial({
      color: 0x8b949e,
      roughness: 0.88,
      metalness: 0.04,
      bumpMap: masonryBump,
      bumpScale: 0.12,
    }),
    brick_ruin: new THREE.MeshStandardMaterial({
      color: 0x9b5744,
      roughness: 0.9,
      metalness: 0.03,
      bumpMap: masonryBump,
      bumpScale: 0.16,
    }),
    wood_aged: new THREE.MeshStandardMaterial({
      color: 0x6f533b,
      roughness: 0.82,
      metalness: 0.02,
    }),
    stone_ancient: new THREE.MeshStandardMaterial({
      color: 0xa29c8a,
      roughness: 0.92,
      metalness: 0.02,
      bumpMap: masonryBump,
      bumpScale: 0.18,
    }),
    steel_dark: new THREE.MeshStandardMaterial({
      color: 0x374151,
      roughness: 0.45,
      metalness: 0.62,
    }),
    steel_rust: new THREE.MeshStandardMaterial({
      color: 0x7c4632,
      roughness: 0.62,
      metalness: 0.45,
    }),
    container_blue: new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.38,
      metalness: 0.35,
    }),
    container_red: new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      roughness: 0.38,
      metalness: 0.35,
    }),
    container_amber: new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.36,
      metalness: 0.35,
    }),
    metal_roof: new THREE.MeshStandardMaterial({
      color: 0x52606d,
      roughness: 0.52,
      metalness: 0.48,
    }),
  };

  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const { parts: structureParts, anchors: structureAnchors } = buildWorldStructures(groundHeightAt);
  const structureGroup = new THREE.Group();
  const environmentColliders: THREE.Object3D[] = [];

  for (const part of structureParts) {
    const mesh = new THREE.Mesh(unitBoxGeo, structureMaterials[part.material]);
    mesh.position.set(part.cx, part.cy, part.cz);
    mesh.scale.set(part.hx * 2, part.hy * 2, part.hz * 2);
    mesh.rotation.y = part.yaw;
    mesh.castShadow = Boolean(part.castShadow);
    mesh.receiveShadow = true;
    structureGroup.add(mesh);
    if (part.solid) {
      mesh.userData.cullRadius = Math.hypot(part.hx, part.hy, part.hz);
      environmentColliders.push(mesh);
    }
  }
  scene.add(structureGroup);

  // 11. Instanced Pine Trees (1:1 synced with physics tree colliders) & Natural Perimeter Boulders
  const treePositions = getWorldTrees();

  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.38, 2.8, 7);
  trunkGeo.translate(0, 1.4, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.92 });
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
  trunkInst.castShadow = true;

  const foliageGeo = new THREE.ConeGeometry(2.1, 5.8, 8);
  foliageGeo.translate(0, 5.1, 0);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
  const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageMat, treePositions.length);
  foliageInst.castShadow = true;
  foliageInst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const treeColor = new THREE.Color();
  treePositions.forEach((tp, idx) => {
    dummy.position.set(tp.x, tp.baseY, tp.z);
    dummy.rotation.set(0, (idx * 1.7) % (Math.PI * 2), 0);
    dummy.scale.setScalar(tp.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);
    foliageInst.setMatrixAt(idx, dummy.matrix);

    // Subtle organic green tint variation
    treeColor.setHSL(0.32 + ((idx % 5) - 2) * 0.014, 0.42, 0.24 + (idx % 4) * 0.03);
    foliageInst.setColorAt(idx, treeColor);
  });
  trunkInst.computeBoundingSphere();
  foliageInst.computeBoundingSphere();
  scene.add(trunkInst);
  scene.add(foliageInst);

  // Instanced Boulders around foothills & lake shore (strictly outside all structures & roads)
  const rockGeo = new THREE.DodecahedronGeometry(1.15, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.05 });
  const rockPositions = getWorldRocks();
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockPositions.length);
  rockInst.receiveShadow = true;
  rockPositions.forEach((rp, i) => {
    dummy.position.set(rp.x, rp.y, rp.z);
    dummy.rotation.set(rp.idx * 0.5, rp.idx * 1.1, rp.idx * 0.3);
    dummy.scale.set(rp.scale * 1.25, rp.scale * 0.78, rp.scale);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);
    treeColor.setHSL(0.6, 0.06, 0.36 + (i % 4) * 0.05);
    rockInst.setColorAt(i, treeColor);
  });
  rockInst.computeBoundingSphere();
  scene.add(rockInst);

  // 12. Dynamic Mission Elements (Gates, Hover Column, Precision Landing Beacon)
  const hoverZoneMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(4.5, 4.5, 6.0, 28, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  hoverZoneMesh.position.set(0, 7.5, 0);
  hoverZoneMesh.visible = false;
  scene.add(hoverZoneMesh);

  const landingBeaconMesh = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.2, 32),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  landingBeaconMesh.rotation.x = -Math.PI / 2;
  landingBeaconMesh.position.set(ELEVATED_PAD.x, ELEVATED_PAD.topY + 0.04, ELEVATED_PAD.z);
  landingBeaconMesh.visible = false;
  scene.add(landingBeaconMesh);

  const gateGroup = new THREE.Group();
  scene.add(gateGroup);
  let gateVisuals: GateVisual[] = [];
  let currentBuiltMissionId = '';

  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.4 });
  const pylonAccentMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35, metalness: 0.2 });

  function rebuildGates(gates: GatePoint[]) {
    while (gateGroup.children.length > 0) {
      gateGroup.remove(gateGroup.children[0]);
    }
    gateVisuals = [];

    for (const g of gates) {
      const grp = new THREE.Group();
      grp.position.set(g.x, g.y, g.z);
      grp.rotation.y = g.yaw;

      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.3,
      });
      const ringRadius = g.noPylons ? g.radius * 0.68 : g.radius * 0.85;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, g.noPylons ? 0.14 : 0.22, 12, 32), ringMat);
      grp.add(ring);

      const beaconMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(ringRadius * 0.96, 24), beaconMat);
      grp.add(innerDisc);

      if (!g.noPylons) {
        // Left & right support pylons down to terrain
        const gy = groundHeightAt(g.x, g.z);
        const legHeight = Math.max(1, g.y - gy);
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, legHeight, 8), pylonMat);
          post.position.set(side * (g.radius * 0.88), -legHeight * 0.5, 0);
          grp.add(post);

          const cap = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), pylonAccentMat);
          cap.position.set(side * (g.radius * 0.88), 0, 0);
          grp.add(cap);
        }
      }

      gateGroup.add(grp);
      gateVisuals.push({ group: grp, ringMat, beaconMat });
    }
  }

  function updateMissionVisuals(mission: MissionDefinition, progress: MissionProgress, elapsed: number) {
    if (currentBuiltMissionId !== mission.id) {
      currentBuiltMissionId = mission.id;
      rebuildGates(mission.gates);
    }

    hoverZoneMesh.visible = Boolean(mission.hoverTarget) && !progress.completed;
    if (hoverZoneMesh.visible) {
      const pulse = 0.2 + Math.sin(elapsed * 4) * 0.07;
      (hoverZoneMesh.material as THREE.MeshBasicMaterial).opacity = pulse;
      (hoverZoneMesh.material as THREE.MeshBasicMaterial).color.setHex(
        progress.hoverTimerSec > 0.1 ? 0x10b981 : 0x38bdf8
      );
    }

    landingBeaconMesh.visible = Boolean(mission.targetLandingPad) && !progress.completed;
    if (landingBeaconMesh.visible) {
      const s = 1 + Math.sin(elapsed * 4) * 0.08;
      landingBeaconMesh.scale.set(s, s, 1);
    }

    gateVisuals.forEach((gv, idx) => {
      const isFreeFlight = mission.id === 'free_flight';
      const cleared = isFreeFlight
        ? (progress.ringsCollected & (1 << idx)) !== 0
        : idx < progress.activeGateIndex;
      const isTarget = !isFreeFlight && idx === progress.activeGateIndex;

      if (cleared) {
        gv.ringMat.color.setHex(0x10b981);
        gv.ringMat.emissive.setHex(0x059669);
        gv.ringMat.emissiveIntensity = 0.6;
        gv.beaconMat.color.setHex(0x10b981);
        gv.beaconMat.opacity = 0.04;
      } else if (isTarget || isFreeFlight) {
        gv.ringMat.color.setHex(0xf59e0b);
        gv.ringMat.emissive.setHex(0xf59e0b);
        gv.ringMat.emissiveIntensity = 1.6 + Math.sin(elapsed * 5) * 0.5;
        gv.beaconMat.color.setHex(0xf59e0b);
        gv.beaconMat.opacity = 0.16;
      } else {
        gv.ringMat.color.setHex(0x38bdf8);
        gv.ringMat.emissive.setHex(0x0284c7);
        gv.ringMat.emissiveIntensity = 0.45;
        gv.beaconMat.color.setHex(0x38bdf8);
        gv.beaconMat.opacity = 0.06;
      }
    });
  }

  return {
    turbineRotors,
    windsockCone,
    towerBeaconMat,
    hoverZoneMesh,
    landingBeaconMesh,
    gateGroup,
    gateVisuals,
    sunLight,
    sunDirection: sunVec,
    environmentColliders,
    updateMissionVisuals,
    dispose: () => {
      envTex.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      terrainBump.dispose();
      masonryBump.dispose();
      unitBoxGeo.dispose();
      Object.values(structureMaterials).forEach((m) => m.dispose());
      mainPadTex.dispose();
      elevPadTex.dispose();
      trunkGeo.dispose();
      foliageGeo.dispose();
      rockGeo.dispose();
    },
  };
}
