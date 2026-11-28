import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  ELEVATED_PAD,
  LAKE_AREA,
  MAIN_HELIPAD,
  RADIO_TOWER,
  WIND_TURBINES,
  getWorldRocks,
  getWorldTrees,
  groundHeightAt,
} from './physics';
import { ROAD_SEGMENTS, buildWorldStructures, distToSegment2D, type StructureMaterialKey } from './structures';
import { createWorldTextureBundle, type PbrTextureSet, type WorldTextureBundle } from './proceduralTextures';
import {
  createGrassTuftMaterial,
  createOutdoorEnvironment,
  createRealisticTerrainMaterial,
  createRealisticWaterMaterial,
  createWindSwayFoliageMaterial,
  type RealisticWaterUniforms,
  type WindFoliageUniforms,
} from './worldMaterials';
import {
  buildLowPolyHelipadMarkings,
  createLowPolyPalette,
  createLowPolyPineCrownGeometry,
  createLowPolyTerrainGeometry,
} from './worldLowPoly';
import type { GatePoint, GraphicsMode, MissionDefinition, MissionProgress } from './types';

export interface GateVisual {
  group: THREE.Group;
  ringMat: THREE.MeshStandardMaterial;
  reticleMat: THREE.ShaderMaterial;
}

export interface WorldHandles {
  turbineRotors: THREE.Group[];
  windsockSwivel: THREE.Group;
  windsockCone: THREE.Group;
  towerBeaconMat: THREE.MeshStandardMaterial;
  hoverZoneMesh: THREE.Mesh;
  landingBeaconMesh: THREE.Mesh;
  gateGroup: THREE.Group;
  gateVisuals: GateVisual[];
  sunLight: THREE.DirectionalLight;
  sunDirection: THREE.Vector3;
  environmentColliders: THREE.Object3D[];
  updateMissionVisuals: (mission: MissionDefinition, progress: MissionProgress, elapsed: number) => void;
  updateEnvironment: (elapsed: number, windEnabled: boolean) => void;
  dispose: () => void;
}

/**
 * Generates a BoxGeometry whose UVs are scaled in real world meters so masonry, wood planks,
 * concrete panels, and corrugated steel keep uniform physical scale on any building box.
 */
function createWorldScaledBoxGeometry(w: number, h: number, d: number, tileMeters = 3.2): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const norm = geo.attributes.normal;
  if (uv && norm) {
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(norm.getX(i));
      const ny = Math.abs(norm.getY(i));
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (nx > 0.5) {
        uv.setXY(i, (u * d) / tileMeters, (v * h) / tileMeters);
      } else if (ny > 0.5) {
        uv.setXY(i, (u * w) / tileMeters, (v * d) / tileMeters);
      } else {
        uv.setXY(i, (u * w) / tileMeters, (v * h) / tileMeters);
      }
    }
    uv.needsUpdate = true;
  }
  return geo;
}

/**
 * Generates a BoxGeometry tailored for ISO shipping containers: keeps vertical height [0..1]
 * across walls so corner rust/stencils align, while scaling corrugations proportionally along width/length.
 */
function createContainerBoxGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const norm = geo.attributes.normal;
  if (uv && norm) {
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(norm.getX(i));
      const ny = Math.abs(norm.getY(i));
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (nx > 0.5) {
        uv.setXY(i, u * Math.max(1, d / 3.0), v * Math.max(0.85, h / 2.8));
      } else if (ny > 0.5) {
        uv.setXY(i, u * Math.max(1, w / 3.0), v * Math.max(1, d / 3.0));
      } else {
        uv.setXY(i, u * Math.max(1, w / 3.0), v * Math.max(0.85, h / 2.8));
      }
    }
    uv.needsUpdate = true;
  }
  return geo;
}

/**
 * Multi-tier crossed evergreen pine crown geometry matching physics cone bounds (y: 2.0..7.95, R <= 2.05).
 */
function createPineCrownGeometry(): THREE.BufferGeometry {
  const planes: THREE.PlaneGeometry[] = [];
  const tiers = [
    { yBase: 2.05, width: 3.9, height: 2.1, tilt: 0.42 },
    { yBase: 3.1, width: 3.3, height: 1.95, tilt: 0.44 },
    { yBase: 4.15, width: 2.65, height: 1.85, tilt: 0.46 },
    { yBase: 5.15, width: 1.95, height: 1.7, tilt: 0.48 },
    { yBase: 6.1, width: 1.25, height: 1.85, tilt: 0.36 },
  ];

  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t];
    const rotOffset = t * 0.52;
    for (let p = 0; p < 3; p++) {
      const ang = rotOffset + (p * Math.PI) / 3;
      const card = new THREE.PlaneGeometry(tier.width, tier.height, 1, 2);
      card.translate(0, tier.height * 0.5, 0);
      // Droop lower pine needles subtly outward while pitching inward toward apex
      const pos = card.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k);
        const ny = y / tier.height;
        pos.setZ(k, (1 - ny) * tier.tilt);
      }
      card.computeVertexNormals();
      card.rotateY(ang);
      card.translate(0, tier.yBase, 0);
      planes.push(card);
    }
  }

  return mergeSimpleGeometries(planes);
}

/**
 * Crossed two-plane tuft geometry for ground grass & shoreline reeds.
 */
function createGrassTuftGeometry(): THREE.BufferGeometry {
  const p1 = new THREE.PlaneGeometry(0.85, 0.72, 1, 2);
  p1.translate(0, 0.36, 0);
  const p2 = p1.clone();
  p2.rotateY(Math.PI * 0.48);
  const p3 = p1.clone();
  p3.rotateY(-Math.PI * 0.48);
  return mergeSimpleGeometries([p1, p2, p3]);
}

function mergeSimpleGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;
  for (const g of geos) {
    totalVerts += g.attributes.position.count;
    totalIndices += g.index ? g.index.count : g.attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  for (const g of geos) {
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const dst3 = (vOffset + i) * 3;
      positions[dst3] = pos.getX(i);
      positions[dst3 + 1] = pos.getY(i);
      positions[dst3 + 2] = pos.getZ(i);
      if (norm) {
        normals[dst3] = norm.getX(i);
        normals[dst3 + 1] = norm.getY(i);
        normals[dst3 + 2] = norm.getZ(i);
      }
      if (uv) {
        const dst2 = (vOffset + i) * 2;
        uvs[dst2] = uv.getX(i);
        uvs[dst2 + 1] = uv.getY(i);
      }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) {
        indices[iOffset + i] = g.index.getX(i) + vOffset;
      }
      iOffset += g.index.count;
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices[iOffset + i] = vOffset + i;
      }
      iOffset += pos.count;
    }
    vOffset += pos.count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

/**
 * Craggy weathered granite boulder geometry (subdivided icosahedron displaced into organic strata).
 */
function createCraggyRockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1.12, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n1 = Math.sin(x * 2.7 + y * 1.9) * Math.cos(z * 2.3 - x * 1.4);
    const n2 = Math.sin(x * 5.4 - z * 4.8 + y * 3.1) * 0.35;
    // Slight angular strata flattening on upper faces
    const flatTop = y > 0.3 ? 0.92 : 1.04;
    const disp = (1.0 + n1 * 0.22 + n2 * 0.14) * flatTop;
    pos.setXYZ(i, x * disp, y * disp * 0.88, z * disp);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Streamlined tapered wind-turbine airfoil blade (length 11.8m) with realistic root collar and chord taper.
 */
function createTurbineBladeGeometry(): THREE.BufferGeometry {
  const len = 11.8;
  const segs = 16;
  const geo = new THREE.BoxGeometry(0.76, len, 0.14, 2, segs, 1);
  geo.translate(0, len * 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = Math.max(0, Math.min(1, y / len));
    // Narrow cylindrical root neck -> wide mid-root airfoil chord -> sleek tapered tip
    const chord = t < 0.12 ? 0.48 + (t / 0.12) * 0.72 : 1.2 * (1 - Math.pow((t - 0.12) / 0.88, 1.15) * 0.76);
    const thickness = 1.0 - t * 0.65;
    // Aerodynamic pitch twist from root (~16 deg) to tip (~2 deg)
    const twist = (1 - t) * 0.24;
    const cx = x * chord;
    const cz = z * thickness;
    const rx = cx * Math.cos(twist) - cz * Math.sin(twist);
    const rz = cx * Math.sin(twist) + cz * Math.cos(twist);
    // Subtle swept leading edge curve
    pos.setXYZ(i, rx + Math.pow(t, 2.2) * 0.22, y, rz - Math.pow(t, 2.0) * 0.18);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the aerodynamic wind turbine spinner cone with base-to-tip LatheGeometry winding
 * so all outer face normals point outward and forward (+Z after X rotation).
 */
export function createTurbineSpinnerGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.004, 0)];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = i === steps ? 0.004 : Math.max(0.004, Math.cos(t * Math.PI * 0.5) * 0.88);
    pts.push(new THREE.Vector2(r, 1.84 * t));
  }
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Holographic targeting reticle shader inside mission gates (concentric dashed ring + corner brackets + Fresnel).
 */
function createGateReticleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x38bdf8) },
      uOpacity: { value: 0.22 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float ang = atan(p.y, p.x);

        // Rotating dashed inner telemetry ring
        float ring1 = smoothstep(0.035, 0.0, abs(r - 0.78));
        float dash1 = step(0.15, fract((ang + uTime * 0.55) / 6.283185 * 12.0));
        // Subtle fine outer glow rim
        float rimGlow = pow(smoothstep(0.45, 0.99, r), 2.5) * 0.65;
        // Center alignment cross ticks
        float ticks = smoothstep(0.025, 0.0, abs(r - 0.35)) * step(0.55, abs(cos(ang * 2.0)));

        float alpha = (ring1 * dash1 * 0.85 + ticks * 0.55 + rimGlow * 0.45) * uOpacity;
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.85));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makePbrMaterial(
  set: PbrTextureSet,
  opts: {
    roughness?: number;
    metalness?: number;
    normalScale?: number;
    color?: number;
  } = {}
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    map: set.map,
    normalMap: set.normalMap,
    normalScale: new THREE.Vector2(opts.normalScale ?? 1.0, opts.normalScale ?? 1.0),
    roughnessMap: set.roughnessMap,
    roughness: opts.roughness ?? 1.0,
    metalness: opts.metalness ?? 0.04,
  });
}

export function buildTrainingWorld(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  graphicsMode: GraphicsMode = 'realistic'
): WorldHandles {
  const isLowPoly = graphicsMode === 'low_poly';
  const maxAniso = isSoftwareGl ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const worldRoot = new THREE.Group();
  scene.add(worldRoot);
  scene.environment = null;
  scene.background = null;
  scene.fog = null;

  renderer.toneMappingExposure = isLowPoly ? 0.92 : 0.48;

  const textures: WorldTextureBundle | null = isLowPoly ? null : track(createWorldTextureBundle(maxAniso));
  const lowPoly = isLowPoly ? createLowPolyPalette(track) : null;

  const sunVec = new THREE.Vector3();
  let skyUniforms: Record<string, THREE.IUniform> | null = null;

  if (isLowPoly) {
    const phi = THREE.MathUtils.degToRad(90 - 34);
    const theta = THREE.MathUtils.degToRad(42);
    sunVec.setFromSphericalCoords(1, phi, theta).normalize();
    scene.background = new THREE.Color(0x7cc4f5);
    scene.fog = new THREE.FogExp2(0x9bd3f7, 0.00105);
  } else {
    // 1. Realistic Outdoor IBL Environment + Golden-Afternoon Atmospheric Sky + Drifting Clouds
    const outdoorEnv = track(createOutdoorEnvironment(renderer));
    scene.environment = outdoorEnv.envMap;
    scene.environmentIntensity = 0.48;

    const skyBase = new Sky();
    skyBase.geometry.dispose();
    const skyGeo = track(new THREE.SphereGeometry(1, 32, 20));
    const skyMat = track(skyBase.material as THREE.ShaderMaterial);
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.scale.setScalar(5000);
    worldRoot.add(sky);

    skyUniforms = skyMat.uniforms;
    skyUniforms['turbidity'].value = 1.6;
    skyUniforms['rayleigh'].value = 3.0;
    skyUniforms['mieCoefficient'].value = 0.0012;
    skyUniforms['mieDirectionalG'].value = 0.76;
    skyUniforms['cloudScale'].value = 0.00024;
    skyUniforms['cloudSpeed'].value = 0.000045;
    skyUniforms['cloudCoverage'].value = 0.44;
    skyUniforms['cloudDensity'].value = 0.52;
    skyUniforms['cloudElevation'].value = 0.48;
    sunVec.copy(outdoorEnv.sunDirection);
    skyUniforms['sunPosition'].value.copy(sunVec);

    scene.fog = new THREE.FogExp2(0x6e9bc8, 0.00048);
  }

  // 2. Calibrated 3-Point Outdoor Lighting Rig
  const hemiLight = isLowPoly
    ? new THREE.HemisphereLight(0xdbeafe, 0x3b6b35, 0.88)
    : new THREE.HemisphereLight(0x84bcf8, 0x324627, 0.54);
  hemiLight.position.set(0, 90, 0);
  worldRoot.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(isLowPoly ? 0xfff5e0 : 0xffeed4, isLowPoly ? 1.45 : 1.95);
  sunLight.position.copy(sunVec).multiplyScalar(140);
  sunLight.castShadow = !isSoftwareGl;
  if (!isSoftwareGl) {
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    const d = 105;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 360;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.025;
  }
  worldRoot.add(sunLight);
  worldRoot.add(sunLight.target);

  const rimLight = new THREE.DirectionalLight(isLowPoly ? 0x93c5fd : 0x98bde6, isLowPoly ? 0.3 : 0.28);
  rimLight.position.set(-120, 55, -130);
  worldRoot.add(rimLight);

  // 3. Terrain Surface (220x220 multi-biome PBR splatted vs 110x110 flat-shaded low-poly)
  if (lowPoly) {
    const terrainGeo = track(createLowPolyTerrainGeometry());
    const terrainMesh = new THREE.Mesh(terrainGeo, lowPoly.terrainMat);
    terrainMesh.receiveShadow = true;
    worldRoot.add(terrainMesh);
  } else {
    const terrainSize = 1360;
    const terrainSegments = 220;
    const terrainGeo = track(new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments));
    terrainGeo.rotateX(-Math.PI / 2);

    const posAttr = terrainGeo.attributes.position;
    const splatAttr = new Float32Array(posAttr.count * 3); // [roadWeight, turfWeight, shoreWeight]
    const halfSpan = terrainSize * 0.5;
    const roadSegments = ROAD_SEGMENTS;

    for (let i = 0; i < posAttr.count; i++) {
      const rawX = posAttr.getX(i);
      const rawZ = posAttr.getZ(i);
      const nx = rawX / halfSpan;
      const nz = rawZ / halfSpan;
      const x = nx * (0.42 + 0.58 * nx * nx) * halfSpan;
      const z = nz * (0.42 + 0.58 * nz * nz) * halfSpan;
      const y = groundHeightAt(x, z);
      posAttr.setXYZ(i, x, y, z);

      const r = Math.hypot(x, z);
      const lakeDist = Math.hypot(x - LAKE_AREA.x, z - LAKE_AREA.z);
      const turfWeight = Math.max(0, Math.min(1, 1 - (r - 34) / 28));
      const shoreWeight = Math.max(
        0,
        Math.min(1, 1 - Math.max(0, lakeDist - (LAKE_AREA.waterRadius - 4)) / 14)
      );

      let roadWeight = 0;
      if (r > 10 && y > -0.5 && y < 13) {
        let minRoad = 999;
        for (const [ax, az, bx, bz] of roadSegments) {
          const d = distToSegment2D(x, z, ax, az, bx, bz);
          if (d < minRoad) minRoad = d;
        }
        if (minRoad < 4.8) {
          roadWeight = Math.max(0, 1 - minRoad / 4.8);
        }
      }

      splatAttr[i * 3] = roadWeight;
      splatAttr[i * 3 + 1] = turfWeight;
      splatAttr[i * 3 + 2] = shoreWeight;
    }

    terrainGeo.setAttribute('aSplat', new THREE.BufferAttribute(splatAttr, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = track(createRealisticTerrainMaterial(textures!));
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    worldRoot.add(terrainMesh);
  }

  // 4. Lake Water Surface
  let waterUniforms: RealisticWaterUniforms | null = null;
  if (lowPoly) {
    const lakeGeo = track(new THREE.CircleGeometry(LAKE_AREA.waterRadius, 40));
    lakeGeo.rotateX(-Math.PI / 2);
    const lakeMesh = new THREE.Mesh(lakeGeo, lowPoly.lakeMat);
    lakeMesh.position.set(LAKE_AREA.x, LAKE_AREA.waterLevelY, LAKE_AREA.z);
    lakeMesh.receiveShadow = true;
    worldRoot.add(lakeMesh);
  } else {
    const lakeGeo = track(new THREE.CircleGeometry(LAKE_AREA.waterRadius, 72));
    lakeGeo.rotateX(-Math.PI / 2);
    const waterRes = createRealisticWaterMaterial(
      LAKE_AREA.x,
      LAKE_AREA.z,
      LAKE_AREA.waterRadius,
      sunVec,
      0x6e9bc8,
      0.00048
    );
    waterUniforms = waterRes.uniforms;
    track(waterRes.material);
    const lakeMesh = new THREE.Mesh(lakeGeo, waterRes.material);
    lakeMesh.position.set(LAKE_AREA.x, LAKE_AREA.waterLevelY, LAKE_AREA.z);
    worldRoot.add(lakeMesh);
  }

  // 5. Helipad + Perimeter Collar & Aviation Beacons + Asphalt Runway
  const mainPadMat = lowPoly
    ? lowPoly.mainPadMat
    : track(makePbrMaterial(textures!.helipadMain, { roughness: 0.95, metalness: 0.04 }));
  const padSideMat = lowPoly
    ? lowPoly.padSideMat
    : track(makePbrMaterial(textures!.structures.concrete_weathered, { roughness: 0.95 }));
  const padSteelCollarMat = lowPoly
    ? lowPoly.padSteelCollarMat
    : track(makePbrMaterial(textures!.structures.steel_dark, { roughness: 0.95, metalness: 0.65 }));

  const padGeo = track(
    new THREE.CylinderGeometry(MAIN_HELIPAD.radius, MAIN_HELIPAD.radius + 0.35, 0.34, isLowPoly ? 24 : 48)
  );
  const mainPad = new THREE.Mesh(padGeo, [padSideMat, mainPadMat, padSideMat]);
  mainPad.position.set(MAIN_HELIPAD.x, MAIN_HELIPAD.topY - 0.17, MAIN_HELIPAD.z);
  mainPad.rotation.y = Math.PI * 0.5;
  mainPad.receiveShadow = true;
  worldRoot.add(mainPad);
  if (lowPoly) {
    buildLowPolyHelipadMarkings(worldRoot, MAIN_HELIPAD.x, MAIN_HELIPAD.topY, MAIN_HELIPAD.z, MAIN_HELIPAD.radius, 0xfbbf24, track);
  }

  // Bolted steel apron curb ring + 12 inset amber perimeter helipad markers
  const mainCollarGeo = track(new THREE.TorusGeometry(MAIN_HELIPAD.radius + 0.02, 0.08, 8, 48));
  mainCollarGeo.rotateX(Math.PI / 2);
  const mainCollar = new THREE.Mesh(mainCollarGeo, padSteelCollarMat);
  mainCollar.position.set(MAIN_HELIPAD.x, MAIN_HELIPAD.topY - 0.02, MAIN_HELIPAD.z);
  worldRoot.add(mainCollar);

  const perimeterLedAmberMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    })
  );
  const ledHousingGeo = track(new THREE.CylinderGeometry(0.11, 0.14, 0.07, 10));
  const ledBulbGeo = track(new THREE.SphereGeometry(0.065, 8, 6));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const px = MAIN_HELIPAD.x + Math.cos(a) * (MAIN_HELIPAD.radius - 0.22);
    const pz = MAIN_HELIPAD.z + Math.sin(a) * (MAIN_HELIPAD.radius - 0.22);
    const housing = new THREE.Mesh(ledHousingGeo, padSteelCollarMat);
    housing.position.set(px, MAIN_HELIPAD.topY + 0.02, pz);
    worldRoot.add(housing);
    const bulb = new THREE.Mesh(ledBulbGeo, perimeterLedAmberMat);
    bulb.position.set(px, MAIN_HELIPAD.topY + 0.055, pz);
    worldRoot.add(bulb);
  }

  // Asphalt Runway Approach Strip heading north (-Z)
  const asphaltMat = lowPoly
    ? lowPoly.asphaltMat
    : track(makePbrMaterial(textures!.asphalt, { roughness: 0.95, metalness: 0.04, normalScale: 1.2 }));
  const stripGeo = track(new THREE.BoxGeometry(5.6, 0.28, 38.5));
  const stripMesh = new THREE.Mesh(stripGeo, asphaltMat);
  stripMesh.position.set(0, -0.02, -23.75);
  stripMesh.receiveShadow = true;
  worldRoot.add(stripMesh);

  // Runway painted markings (center dashes + threshold piano keys + side edge stripes) with polygonOffset
  const paintWhiteMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xc2ccd6,
      roughness: 0.78,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const dashGeo = track(new THREE.PlaneGeometry(0.32, 2.2));
  dashGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const dash = new THREE.Mesh(dashGeo, paintWhiteMat);
    dash.position.set(0, 0.125, -8.5 - i * 4.1);
    dash.receiveShadow = true;
    worldRoot.add(dash);
  }

  // Threshold piano keys at north & south ends of runway
  const pianoKeyGeo = track(new THREE.PlaneGeometry(0.45, 2.1));
  pianoKeyGeo.rotateX(-Math.PI / 2);
  for (const rz of [-6.0, -41.4]) {
    for (const rx of [-1.95, -1.25, -0.55, 0.55, 1.25, 1.95]) {
      const key = new THREE.Mesh(pianoKeyGeo, paintWhiteMat);
      key.position.set(rx, 0.125, rz);
      worldRoot.add(key);
    }
  }
  const edgeLineGeo = track(new THREE.PlaneGeometry(0.14, 37.8));
  edgeLineGeo.rotateX(-Math.PI / 2);
  for (const side of [-2.45, 2.45]) {
    const edgeLine = new THREE.Mesh(edgeLineGeo, paintWhiteMat);
    edgeLine.position.set(side, 0.124, -23.75);
    worldRoot.add(edgeLine);
  }

  // Runway edge marker lights (low profile)
  const runwayEdgeBulbMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xfde68a,
      emissiveIntensity: 1.1,
      roughness: 0.25,
    })
  );
  for (let i = 0; i < 6; i++) {
    const rz = -7.5 - i * 6.4;
    for (const side of [-2.72, 2.72]) {
      const mh = new THREE.Mesh(ledHousingGeo, padSteelCollarMat);
      mh.position.set(side, 0.13, rz);
      worldRoot.add(mh);
      const mb = new THREE.Mesh(ledBulbGeo, runwayEdgeBulbMat);
      mb.position.set(side, 0.165, rz);
      worldRoot.add(mb);
    }
  }

  // 6. Aviation Windsock (Biruta) beside Main Helipad
  const windsockGroup = new THREE.Group();
  windsockGroup.position.set(7.5, groundHeightAt(7.5, -2), -2);

  const poleSteelMat = lowPoly
    ? lowPoly.poleSteelMat
    : track(makePbrMaterial(textures!.structures.steel_dark, { roughness: 0.72, metalness: 0.85 }));
  const galvanizedPoleMat = track(
    new THREE.MeshStandardMaterial({ color: 0xdbe2ea, roughness: 0.34, metalness: 0.78, flatShading: isLowPoly })
  );
  const safetyOrangeMat = track(new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.44, metalness: 0.12 }));

  const wsFooting = new THREE.Mesh(track(new THREE.CylinderGeometry(0.28, 0.34, 0.18, 16)), padSideMat);
  wsFooting.position.y = 0.09;
  wsFooting.receiveShadow = true;
  wsFooting.castShadow = true;
  windsockGroup.add(wsFooting);

  const wsFlange = new THREE.Mesh(track(new THREE.CylinderGeometry(0.14, 0.17, 0.08, 14)), poleSteelMat);
  wsFlange.position.y = 0.22;
  wsFlange.castShadow = true;
  windsockGroup.add(wsFlange);

  const wsPole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.045, 0.068, 4.65, 16)), galvanizedPoleMat);
  wsPole.position.y = 2.52;
  wsPole.castShadow = true;
  windsockGroup.add(wsPole);

  const wsSafetyBand = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.052, 0.22, 16)), safetyOrangeMat);
  wsSafetyBand.position.y = 4.32;
  windsockGroup.add(wsSafetyBand);

  const wsFinial = new THREE.Mesh(track(new THREE.SphereGeometry(0.056, 12, 8)), poleSteelMat);
  wsFinial.position.y = 4.86;
  windsockGroup.add(wsFinial);

  const windsockSwivel = new THREE.Group();
  windsockSwivel.position.set(0, 4.68, 0);
  windsockGroup.add(windsockSwivel);

  windsockSwivel.add(new THREE.Mesh(track(new THREE.CylinderGeometry(0.062, 0.062, 0.13, 16)), poleSteelMat));

  const boomGeo = track(new THREE.CylinderGeometry(0.017, 0.021, 0.38, 10));
  boomGeo.rotateZ(-Math.PI / 2);
  const boomArm = new THREE.Mesh(boomGeo, poleSteelMat);
  boomArm.position.set(0.22, 0, 0);
  windsockSwivel.add(boomArm);

  const braceStart = new THREE.Vector3(0.04, 0.12, 0);
  const braceEnd = new THREE.Vector3(0.28, 0, 0);
  const braceVec = braceEnd.clone().sub(braceStart);
  const braceArm = new THREE.Mesh(track(new THREE.CylinderGeometry(0.011, 0.011, braceVec.length(), 8)), poleSteelMat);
  braceArm.position.copy(braceStart).add(braceEnd).multiplyScalar(0.5);
  braceArm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), braceVec.normalize());
  windsockSwivel.add(braceArm);

  const pivotHub = new THREE.Mesh(track(new THREE.SphereGeometry(0.026, 10, 8)), poleSteelMat);
  pivotHub.position.set(0.41, 0, 0);
  windsockSwivel.add(pivotHub);

  const windsockCone = new THREE.Group();
  windsockCone.position.set(0.41, 0, 0);
  windsockSwivel.add(windsockCone);

  const throatX = 0.15;
  const throatRadius = 0.27;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    const targetVec = new THREE.Vector3(throatX, Math.cos(a) * throatRadius, Math.sin(a) * throatRadius);
    const wire = new THREE.Mesh(track(new THREE.CylinderGeometry(0.007, 0.007, targetVec.length(), 6)), poleSteelMat);
    wire.position.copy(targetVec).multiplyScalar(0.5);
    wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetVec.clone().normalize());
    windsockCone.add(wire);
  }

  const hoopGeo = track(new THREE.TorusGeometry(throatRadius, 0.013, 8, 24));
  hoopGeo.rotateY(Math.PI / 2);
  const throatHoop = new THREE.Mesh(hoopGeo, poleSteelMat);
  throatHoop.position.set(throatX, 0, 0);
  throatHoop.castShadow = true;
  windsockCone.add(throatHoop);

  const wsCanvas = document.createElement('canvas');
  wsCanvas.width = 512;
  wsCanvas.height = 256;
  const wsCtx = wsCanvas.getContext('2d')!;
  const bandColors = ['#ea580c', '#f8fafc', '#ea580c', '#f8fafc', '#ea580c'];
  const bandH = wsCanvas.height / bandColors.length;
  bandColors.forEach((col, idx) => {
    wsCtx.fillStyle = col;
    wsCtx.fillRect(0, idx * bandH, wsCanvas.width, bandH + 1);
  });
  wsCtx.fillStyle = 'rgba(15, 23, 42, 0.06)';
  for (let x = 0; x < wsCanvas.width; x += 8) {
    wsCtx.fillRect(x, 0, 1, wsCanvas.height);
  }
  wsCtx.fillStyle = 'rgba(15, 23, 42, 0.18)';
  for (let i = 1; i < bandColors.length; i++) {
    wsCtx.fillRect(0, i * bandH - 1.5, wsCanvas.width, 3);
  }
  const windsockTex = track(new THREE.CanvasTexture(wsCanvas));
  windsockTex.colorSpace = THREE.SRGBColorSpace;
  windsockTex.anisotropy = maxAniso;

  const sockLen = 1.65;
  const sockGeo = track(new THREE.CylinderGeometry(0.105, throatRadius, sockLen, 24, 4, true));
  sockGeo.rotateZ(-Math.PI / 2);
  sockGeo.translate(throatX + sockLen * 0.5, 0, 0);
  const sockMat = track(
    new THREE.MeshStandardMaterial({
      map: windsockTex,
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  const sockMesh = new THREE.Mesh(sockGeo, sockMat);
  sockMesh.castShadow = true;
  windsockCone.add(sockMesh);
  worldRoot.add(windsockGroup);

  // 7. Elevated Precision Landing Platform (NE) with Steel Cross-Braced Legs & Perimeter LEDs
  const elevGroup = new THREE.Group();
  const elevGroundY = groundHeightAt(ELEVATED_PAD.x, ELEVATED_PAD.z);
  elevGroup.position.set(ELEVATED_PAD.x, 0, ELEVATED_PAD.z);

  const elevPadMat = lowPoly
    ? lowPoly.elevPadMat
    : track(makePbrMaterial(textures!.helipadElevated, { roughness: 0.92, metalness: 0.04 }));
  const elevTop = new THREE.Mesh(
    track(new THREE.CylinderGeometry(ELEVATED_PAD.radius, ELEVATED_PAD.radius + 0.22, 0.46, isLowPoly ? 24 : 48)),
    [padSideMat, elevPadMat, padSideMat]
  );
  elevTop.position.y = ELEVATED_PAD.topY - 0.23;
  elevTop.receiveShadow = true;
  elevTop.castShadow = true;
  elevGroup.add(elevTop);

  const elevCollarGeo = track(new THREE.TorusGeometry(ELEVATED_PAD.radius + 0.02, 0.08, 8, 48));
  elevCollarGeo.rotateX(Math.PI / 2);
  const elevCollar = new THREE.Mesh(elevCollarGeo, padSteelCollarMat);
  elevCollar.position.y = ELEVATED_PAD.topY - 0.02;
  elevGroup.add(elevCollar);

  const perimeterLedCyanMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.5,
      roughness: 0.22,
    })
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = Math.cos(a) * (ELEVATED_PAD.radius - 0.2);
    const pz = Math.sin(a) * (ELEVATED_PAD.radius - 0.2);
    const h = new THREE.Mesh(ledHousingGeo, padSteelCollarMat);
    h.position.set(px, ELEVATED_PAD.topY + 0.02, pz);
    elevGroup.add(h);
    const b = new THREE.Mesh(ledBulbGeo, perimeterLedCyanMat);
    b.position.set(px, ELEVATED_PAD.topY + 0.055, pz);
    elevGroup.add(b);
  }

  const colHeight = ELEVATED_PAD.topY - elevGroundY + 1.5;
  const colGeo = track(new THREE.CylinderGeometry(0.28, 0.38, colHeight, 16));
  const collarFootGeo = track(new THREE.CylinderGeometry(0.46, 0.56, 0.55, 16));
  for (const [cx, cz] of [
    [-2.1, -2.1],
    [2.1, -2.1],
    [-2.1, 2.1],
    [2.1, 2.1],
  ]) {
    const col = new THREE.Mesh(colGeo, padSideMat);
    col.position.set(cx, ELEVATED_PAD.topY - 0.42 - colHeight * 0.5, cz);
    col.castShadow = true;
    col.receiveShadow = true;
    elevGroup.add(col);

    const foot = new THREE.Mesh(collarFootGeo, padSideMat);
    foot.position.set(cx, elevGroundY + 0.15, cz);
    elevGroup.add(foot);
  }
  if (lowPoly) {
    buildLowPolyHelipadMarkings(elevGroup, 0, ELEVATED_PAD.topY, 0, ELEVATED_PAD.radius, 0x38bdf8, track);
  }
  worldRoot.add(elevGroup);

  // 8. Radio Lattice Tower (28m tall with real diagonal X-bracing, microwave drum & aviation beacon)
  const towerGroup = new THREE.Group();
  const towerBaseY = groundHeightAt(RADIO_TOWER.x, RADIO_TOWER.z);
  towerGroup.position.set(RADIO_TOWER.x, towerBaseY, RADIO_TOWER.z);

  const towerBase = new THREE.Mesh(
    createWorldScaledBoxGeometry(4.4, 2.4, 4.4, 2.4),
    padSideMat
  );
  track(towerBase.geometry);
  towerBase.position.y = 0.0;
  towerBase.receiveShadow = true;
  towerGroup.add(towerBase);

  const redSteel = track(new THREE.MeshStandardMaterial({ color: 0xc82323, roughness: 0.38, metalness: 0.62 }));
  const whiteSteel = track(new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.34, metalness: 0.58 }));

  const towerBotY = 1.2;
  const towerTopY = RADIO_TOWER.height;
  const halfBot = 1.18;
  const halfTop = 0.64;

  const cornerPts = (tierY: number): Array<[number, number]> => {
    const t = THREE.MathUtils.clamp((tierY - towerBotY) / (towerTopY - towerBotY), 0, 1);
    const half = THREE.MathUtils.lerp(halfBot, halfTop, t);
    return [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ];
  };

  // 4 corner lattice legs computed directly from exact bottom-to-top corner vectors so bracing meets flush
  const upAxis = new THREE.Vector3(0, 1, 0);
  const legLen = Math.hypot(halfBot - halfTop, Math.SQRT1_2) > 0
    ? new THREE.Vector3(halfTop - halfBot, towerTopY - towerBotY, halfTop - halfBot).length()
    : towerTopY - towerBotY;
  const legGeo = track(new THREE.CylinderGeometry(0.105, 0.175, legLen, 12));
  const legCapGeo = track(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 12));

  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const pBot = new THREE.Vector3(sx * halfBot, towerBotY, sz * halfBot);
    const pTop = new THREE.Vector3(sx * halfTop, towerTopY, sz * halfTop);
    const dir = pTop.clone().sub(pBot);
    const leg = new THREE.Mesh(legGeo, redSteel);
    leg.position.copy(pBot).add(pTop).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(upAxis, dir.normalize());
    leg.castShadow = true;
    towerGroup.add(leg);

    const legCap = new THREE.Mesh(legCapGeo, poleSteelMat);
    legCap.position.set(sx * halfTop, towerTopY - 0.02, sz * halfTop);
    towerGroup.add(legCap);
  }

  const strutMatA = redSteel;
  const strutMatB = whiteSteel;
  const strutGeoUnit = track(new THREE.CylinderGeometry(0.036, 0.036, 1, 6));
  const addStrut = (a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material) => {
    const delta = b.clone().sub(a);
    const len = delta.length();
    const strut = new THREE.Mesh(strutGeoUnit, mat);
    strut.position.copy(a).add(b).multiplyScalar(0.5);
    strut.scale.set(1, len, 1);
    strut.quaternion.setFromUnitVectors(upAxis, delta.normalize());
    towerGroup.add(strut);
  };

  const tierHeights = [1.2, 5.6, 10.0, 14.4, 18.8, 23.4, 28.0];
  for (let t = 0; t < tierHeights.length; t++) {
    const y = tierHeights[t];
    const pts = cornerPts(y);
    const mat = t % 2 === 0 ? strutMatB : strutMatA;
    for (let s = 0; s < 4; s++) {
      const p1 = pts[s];
      const p2 = pts[(s + 1) % 4];
      addStrut(new THREE.Vector3(p1[0], y, p1[1]), new THREE.Vector3(p2[0], y, p2[1]), mat);
      if (t < tierHeights.length - 1) {
        const nextY = tierHeights[t + 1];
        const nextPts = cornerPts(nextY);
        const q1 = nextPts[s];
        const q2 = nextPts[(s + 1) % 4];
        addStrut(new THREE.Vector3(p1[0], y, p1[1]), new THREE.Vector3(q2[0], nextY, q2[1]), mat);
        addStrut(new THREE.Vector3(p2[0], y, p2[1]), new THREE.Vector3(q1[0], nextY, q1[1]), mat);
      }
    }
  }

  // Microwave relay drum dish mounted near top tier
  const dishDrum = new THREE.Mesh(track(new THREE.CylinderGeometry(0.65, 0.65, 0.42, 18)), whiteSteel);
  dishDrum.rotation.x = Math.PI / 2;
  dishDrum.position.set(0, 22.5, 0.85);
  dishDrum.castShadow = true;
  towerGroup.add(dishDrum);

  // Structural steel crown cap platform & bolted mast socket connecting the 4 legs cleanly to the antenna mast
  const crownPlate = new THREE.Mesh(track(new THREE.BoxGeometry(1.48, 0.14, 1.48)), poleSteelMat);
  crownPlate.position.y = towerTopY + 0.07;
  crownPlate.castShadow = true;
  towerGroup.add(crownPlate);

  const mastSocket = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.27, 0.28, 16)), poleSteelMat);
  mastSocket.position.y = towerTopY + 0.26;
  towerGroup.add(mastSocket);

  const mastCollar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.145, 0.145, 0.12, 14)), poleSteelMat);
  mastCollar.position.y = towerTopY + 1.05;
  towerGroup.add(mastCollar);

  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    addStrut(
      new THREE.Vector3(sx * 0.56, towerTopY + 0.12, sz * 0.56),
      new THREE.Vector3(sx * 0.1, towerTopY + 1.05, sz * 0.1),
      poleSteelMat
    );
  }

  // Tapered white antenna mast firmly seated inside the crown socket (y = 28.12 .. 32.42)
  const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.068, 0.128, 4.3, 14)), whiteSteel);
  mast.position.y = towerTopY + 2.27;
  mast.castShadow = true;
  towerGroup.add(mast);

  // Mid-mast VHF dipole crossarm & stainless whip elements
  const vhfCrossarm = new THREE.Mesh(track(new THREE.BoxGeometry(0.92, 0.055, 0.055)), poleSteelMat);
  vhfCrossarm.position.y = towerTopY + 2.85;
  towerGroup.add(vhfCrossarm);
  const dipoleGeo = track(new THREE.CylinderGeometry(0.012, 0.016, 0.96, 8));
  for (const dx of [-0.44, 0.44]) {
    const whip = new THREE.Mesh(dipoleGeo, galvanizedPoleMat);
    whip.position.set(dx, towerTopY + 2.85, 0);
    towerGroup.add(whip);
  }

  // Realistic aviation obstruction luminaire assembly at mast tip (flange, cooling collar, Fresnel red dome, lightning finial)
  const beaconTipY = towerTopY + 4.42;
  const beaconFlange = new THREE.Mesh(track(new THREE.CylinderGeometry(0.19, 0.115, 0.11, 16)), poleSteelMat);
  beaconFlange.position.y = beaconTipY + 0.05;
  towerGroup.add(beaconFlange);

  const beaconCollar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.19, 0.09, 16)), poleSteelMat);
  beaconCollar.position.y = beaconTipY + 0.15;
  towerGroup.add(beaconCollar);

  const towerBeaconMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0xdc2626,
      emissiveIntensity: 2.2,
      roughness: 0.16,
      metalness: 0.08,
    })
  );
  const beaconLensCyl = new THREE.Mesh(track(new THREE.CylinderGeometry(0.145, 0.155, 0.14, 16)), towerBeaconMat);
  beaconLensCyl.position.y = beaconTipY + 0.265;
  towerGroup.add(beaconLensCyl);

  const beacon = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.145, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)),
    towerBeaconMat
  );
  beacon.position.y = beaconTipY + 0.335;
  towerGroup.add(beacon);

  // Offset side bracket + thin stainless lightning arrestor rod rising clear above the beacon dome
  const rodArm = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.035, 0.04)), poleSteelMat);
  rodArm.position.set(0.17, beaconTipY + 0.08, 0);
  towerGroup.add(rodArm);
  const lightningRod = new THREE.Mesh(track(new THREE.CylinderGeometry(0.008, 0.02, 0.72, 8)), galvanizedPoleMat);
  lightningRod.position.set(0.26, beaconTipY + 0.44, 0);
  towerGroup.add(lightningRod);

  worldRoot.add(towerGroup);

  // 9. Four Composite Wind Turbines
  const turbineRotors: THREE.Group[] = [];
  const turbineMat = lowPoly
    ? lowPoly.turbineMat
    : track(
        new THREE.MeshPhysicalMaterial({
          color: 0xf1f4f7,
          roughness: 0.28,
          metalness: 0.14,
          clearcoat: 0.45,
          clearcoatRoughness: 0.22,
        })
      );
  const nacelleMat = lowPoly
    ? lowPoly.nacelleMat
    : track(
        new THREE.MeshPhysicalMaterial({
          color: 0xe6ebf0,
          roughness: 0.26,
          metalness: 0.28,
          clearcoat: 0.55,
          clearcoatRoughness: 0.2,
        })
      );

  // Smooth aerodynamic spinner cone via LatheGeometry (outward base-to-tip winding)
  const spinnerGeo = track(createTurbineSpinnerGeometry());

  const airfoilBladeGeo = track(createTurbineBladeGeometry());
  const nacelleBodyGeo = track(new THREE.CapsuleGeometry(0.82, 2.55, 8, 18));
  nacelleBodyGeo.rotateX(Math.PI / 2);

  for (const wt of WIND_TURBINES) {
    const tGroup = new THREE.Group();
    const ty = groundHeightAt(wt.x, wt.z);
    tGroup.position.set(wt.x, ty, wt.z);
    tGroup.rotation.y = wt.yaw;

    const plinth = new THREE.Mesh(track(new THREE.CylinderGeometry(1.45, 1.75, 1.2, 20)), padSideMat);
    plinth.position.y = 0.2;
    plinth.receiveShadow = true;
    tGroup.add(plinth);

    const mastMesh = new THREE.Mesh(track(new THREE.CylinderGeometry(0.48, 0.98, wt.mastHeight, 22)), turbineMat);
    mastMesh.position.y = wt.mastHeight * 0.5;
    mastMesh.castShadow = true;
    mastMesh.receiveShadow = true;
    tGroup.add(mastMesh);

    const nacelle = new THREE.Mesh(nacelleBodyGeo, nacelleMat);
    nacelle.position.set(0, 28.2, 0.38);
    nacelle.castShadow = true;
    tGroup.add(nacelle);

    const rotor = new THREE.Group();
    rotor.position.set(0, 28.2, 2.32);

    const nose = new THREE.Mesh(spinnerGeo, turbineMat);
    nose.position.z = -0.45;
    nose.castShadow = true;
    rotor.add(nose);

    for (let b = 0; b < 3; b++) {
      const bladeWrap = new THREE.Group();
      bladeWrap.rotation.z = (b * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(airfoilBladeGeo, turbineMat);
      blade.castShadow = true;
      bladeWrap.add(blade);
      rotor.add(bladeWrap);
    }

    tGroup.add(rotor);
    turbineRotors.push(rotor);
    worldRoot.add(tGroup);
  }

  // 10. Detailed Flight Control Observation Station (Deck Planks, Safety Railings, Mullions & Weather Mast)
  const standPos = { x: -16, z: 16 };
  const standBaseY = groundHeightAt(standPos.x, standPos.z);
  const hangarGroup = new THREE.Group();
  hangarGroup.position.set(standPos.x, standBaseY, standPos.z);
  hangarGroup.rotation.y = 0.65;

  const woodDeckMat = lowPoly
    ? lowPoly.woodDeckMat
    : track(makePbrMaterial(textures!.structures.wood_aged, { roughness: 0.92 }));
  const cabinSteelMat = lowPoly
    ? lowPoly.cabinSteelMat
    : track(makePbrMaterial(textures!.structures.steel_dark, { roughness: 0.88, metalness: 0.6 }));
  const metalRoofMat = lowPoly
    ? lowPoly.metalRoofMat
    : track(makePbrMaterial(textures!.structures.metal_roof, { roughness: 0.85, metalness: 0.5 }));
  const amberAccentMat = lowPoly
    ? lowPoly.amberAccentMat
    : track(makePbrMaterial(textures!.structures.container_amber, { roughness: 0.72, metalness: 0.25 }));

  // Concrete foundation plinth
  const cabinPlinth = new THREE.Mesh(createWorldScaledBoxGeometry(7.6, 1.2, 5.6, 2.5), padSideMat);
  track(cabinPlinth.geometry);
  cabinPlinth.position.y = -0.3;
  cabinPlinth.receiveShadow = true;
  hangarGroup.add(cabinPlinth);

  // Timber observation deck
  const deck = new THREE.Mesh(createWorldScaledBoxGeometry(7.4, 0.36, 5.4, 2.2), woodDeckMat);
  track(deck.geometry);
  deck.position.y = 0.48;
  deck.receiveShadow = true;
  hangarGroup.add(deck);

  // Perimeter deck safety railings on front & right viewing apron
  const railPostGeo = track(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 8));
  for (const rx of [-3.4, -1.7, 0, 1.7, 3.4]) {
    const p = new THREE.Mesh(railPostGeo, poleSteelMat);
    p.position.set(rx, 1.12, 2.52);
    p.castShadow = true;
    hangarGroup.add(p);
  }
  const frontRailBar = new THREE.Mesh(track(new THREE.BoxGeometry(6.9, 0.06, 0.06)), poleSteelMat);
  frontRailBar.position.set(0, 1.56, 2.52);
  hangarGroup.add(frontRailBar);

  // Corrugated cabin lower hull
  const cabin = new THREE.Mesh(createWorldScaledBoxGeometry(4.4, 1.35, 3.4, 2.2), cabinSteelMat);
  track(cabin.geometry);
  cabin.position.set(-0.6, 1.33, 0);
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  hangarGroup.add(cabin);

  // Upper cabin corner mullions
  const mullionGeo = track(new THREE.BoxGeometry(0.18, 1.15, 0.18));
  for (const [mx, mz] of [
    [-2.7, -1.6],
    [1.5, -1.6],
    [-2.7, 1.6],
    [1.5, 1.6],
  ]) {
    const mul = new THREE.Mesh(mullionGeo, poleSteelMat);
    mul.position.set(mx, 2.58, mz);
    hangarGroup.add(mul);
  }

  // Interior operator desk & glowing telemetry screens visible behind glass
  const deskMesh = new THREE.Mesh(track(new THREE.BoxGeometry(3.2, 0.65, 1.2)), poleSteelMat);
  deskMesh.position.set(-0.6, 1.85, 0.45);
  hangarGroup.add(deskMesh);

  const monitorGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    })
  );
  for (const sx of [-1.2, -0.3]) {
    const screen = new THREE.Mesh(track(new THREE.BoxGeometry(0.68, 0.42, 0.06)), monitorGlowMat);
    screen.position.set(sx, 2.38, 0.65);
    screen.rotation.x = -0.15;
    hangarGroup.add(screen);
  }

  // Reflective dark-tinted architectural glass band
  const cabinGlass = new THREE.Mesh(
    track(new THREE.BoxGeometry(4.32, 1.08, 3.32)),
    track(
      new THREE.MeshPhysicalMaterial({
        color: 0x1e3a4c,
        roughness: 0.08,
        metalness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        transparent: true,
        opacity: 0.52,
      })
    )
  );
  cabinGlass.position.set(-0.6, 2.55, 0);
  hangarGroup.add(cabinGlass);

  // Overhanging corrugated metal roof + amber fascia + VHF antenna mast
  const roof = new THREE.Mesh(createWorldScaledBoxGeometry(5.6, 0.24, 4.6, 2.4), metalRoofMat);
  track(roof.geometry);
  roof.position.set(-0.4, 3.24, 0);
  roof.rotation.z = -0.05;
  roof.castShadow = true;
  roof.receiveShadow = true;
  hangarGroup.add(roof);

  const roofFascia = new THREE.Mesh(createWorldScaledBoxGeometry(5.68, 0.16, 4.68, 2.4), amberAccentMat);
  track(roofFascia.geometry);
  roofFascia.position.set(-0.4, 3.38, 0);
  roofFascia.rotation.z = -0.05;
  hangarGroup.add(roofFascia);

  const cabinAnt = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.05, 1.8, 8)), galvanizedPoleMat);
  cabinAnt.position.set(-2.2, 4.25, -1.2);
  hangarGroup.add(cabinAnt);
  worldRoot.add(hangarGroup);

  // 10b. Pass-Through Architectural Structures
  const structureMaterials: Record<StructureMaterialKey, THREE.MeshStandardMaterial> = lowPoly
    ? lowPoly.structureMaterials
    : {
        concrete_weathered: track(
          makePbrMaterial(textures!.structures.concrete_weathered, { roughness: 0.96, metalness: 0.04 })
        ),
        brick_ruin: track(
          makePbrMaterial(textures!.structures.brick_ruin, { roughness: 0.96, metalness: 0.03, normalScale: 1.25 })
        ),
        plaster_ruin: track(
          makePbrMaterial(textures!.structures.plaster_ruin, { roughness: 0.94, metalness: 0.02, normalScale: 1.25 })
        ),
        wood_aged: track(
          makePbrMaterial(textures!.structures.wood_aged, { roughness: 0.94, metalness: 0.02, normalScale: 1.15 })
        ),
        stone_ancient: track(
          makePbrMaterial(textures!.structures.stone_ancient, { roughness: 0.96, metalness: 0.02, normalScale: 1.35 })
        ),
        steel_dark: track(makePbrMaterial(textures!.structures.steel_dark, { roughness: 0.88, metalness: 0.72 })),
        steel_rust: track(
          makePbrMaterial(textures!.structures.steel_rust, { roughness: 0.92, metalness: 0.52, normalScale: 1.15 })
        ),
        container_blue: track(
          makePbrMaterial(textures!.structures.container_blue, { roughness: 0.82, metalness: 0.38, normalScale: 1.25 })
        ),
        container_red: track(
          makePbrMaterial(textures!.structures.container_red, { roughness: 0.82, metalness: 0.38, normalScale: 1.25 })
        ),
        container_amber: track(
          makePbrMaterial(textures!.structures.container_amber, { roughness: 0.8, metalness: 0.36, normalScale: 1.25 })
        ),
        metal_roof: track(
          makePbrMaterial(textures!.structures.metal_roof, { roughness: 0.88, metalness: 0.56, normalScale: 1.2 })
        ),
      };

  const structureGeoCache = new Map<string, THREE.BoxGeometry>();
  const getStructureBoxGeo = (w: number, h: number, d: number, isContainer: boolean): THREE.BoxGeometry => {
    const key = `${isContainer ? 'c' : 's'}:${w.toFixed(2)}:${h.toFixed(2)}:${d.toFixed(2)}`;
    let geo = structureGeoCache.get(key);
    if (!geo) {
      geo = track(isContainer ? createContainerBoxGeometry(w, h, d) : createWorldScaledBoxGeometry(w, h, d, 3.2));
      structureGeoCache.set(key, geo);
    }
    return geo;
  };

  const { parts: structureParts } = buildWorldStructures(groundHeightAt);
  const structureGroup = new THREE.Group();
  const environmentColliders: THREE.Object3D[] = [];

  for (const part of structureParts) {
    const isContainer = part.material.startsWith('container_');
    const geo = getStructureBoxGeo(part.hx * 2, part.hy * 2, part.hz * 2, isContainer);
    const mesh = new THREE.Mesh(geo, structureMaterials[part.material]);
    mesh.position.set(part.cx, part.cy, part.cz);
    mesh.rotation.y = part.yaw;
    mesh.castShadow = Boolean(part.castShadow);
    mesh.receiveShadow = true;
    structureGroup.add(mesh);
    if (part.solid) {
      mesh.userData.cullRadius = Math.hypot(part.hx, part.hy, part.hz);
      environmentColliders.push(mesh);
    }
  }
  worldRoot.add(structureGroup);

  // 11. Evergreen Pine Trees (1:1 synced with physics colliders), Grass Tufts (realistic), & Rocks
  const treePositions = getWorldTrees();
  const rockPositions = getWorldRocks();
  const dummy = new THREE.Object3D();
  const organicTint = new THREE.Color();

  let foliageUniforms: WindFoliageUniforms | null = null;
  let grassUniforms: WindFoliageUniforms | null = null;

  if (lowPoly) {
    const trunkGeo = track(new THREE.CylinderGeometry(0.18, 0.34, 2.5, 7));
    trunkGeo.translate(0, 1.25, 0);
    const trunkInst = new THREE.InstancedMesh(trunkGeo, lowPoly.trunkMat, treePositions.length);
    trunkInst.castShadow = true;
    trunkInst.receiveShadow = true;

    const foliageGeo = track(createLowPolyPineCrownGeometry(mergeSimpleGeometries));
    const foliageInst = new THREE.InstancedMesh(foliageGeo, lowPoly.foliageMat, treePositions.length);
    foliageInst.castShadow = true;
    foliageInst.receiveShadow = true;

    treePositions.forEach((tp, idx) => {
      dummy.position.set(tp.x, tp.baseY, tp.z);
      dummy.rotation.set(0, (idx * 1.7) % (Math.PI * 2), 0);
      dummy.scale.setScalar(tp.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(idx, dummy.matrix);
      foliageInst.setMatrixAt(idx, dummy.matrix);
      organicTint.setHSL(0.32 + ((idx % 4) - 1.5) * 0.015, 0.52, 0.44 + (idx % 3) * 0.06);
      foliageInst.setColorAt(idx, organicTint);
    });
    trunkInst.computeBoundingSphere();
    foliageInst.computeBoundingSphere();
    worldRoot.add(trunkInst);
    worldRoot.add(foliageInst);

    const rockGeo = track(new THREE.DodecahedronGeometry(1.0, 0));
    const rockInst = new THREE.InstancedMesh(rockGeo, lowPoly.rockMat, rockPositions.length);
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;
    rockPositions.forEach((rp, i) => {
      dummy.position.set(rp.x, rp.y, rp.z);
      dummy.rotation.set(rp.idx * 0.5, rp.idx * 1.1, rp.idx * 0.3);
      dummy.scale.set(rp.scale * 1.2, rp.scale * 0.8, rp.scale);
      dummy.updateMatrix();
      rockInst.setMatrixAt(i, dummy.matrix);
      organicTint.setHSL(0.58, 0.1, 0.55 + (i % 4) * 0.06);
      rockInst.setColorAt(i, organicTint);
    });
    rockInst.computeBoundingSphere();
    worldRoot.add(rockInst);
  } else {
    const trunkGeo = track(new THREE.CylinderGeometry(0.18, 0.36, 3.0, 9));
    trunkGeo.translate(0, 1.5, 0);
    const trunkMat = track(makePbrMaterial(textures!.pineBark, { roughness: 0.96, metalness: 0.02, normalScale: 1.2 }));
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    trunkInst.castShadow = true;
    trunkInst.receiveShadow = true;

    const foliageGeo = track(createPineCrownGeometry());
    const foliageRes = createWindSwayFoliageMaterial(textures!);
    foliageUniforms = foliageRes.uniforms;
    track(foliageRes.material);
    const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageRes.material, treePositions.length);
    foliageInst.castShadow = true;
    foliageInst.receiveShadow = true;

    treePositions.forEach((tp, idx) => {
      dummy.position.set(tp.x, tp.baseY, tp.z);
      dummy.rotation.set(0, (idx * 1.7) % (Math.PI * 2), 0);
      dummy.scale.setScalar(tp.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(idx, dummy.matrix);
      foliageInst.setMatrixAt(idx, dummy.matrix);
      organicTint.setHSL(0.28 + ((idx % 5) - 2) * 0.015, 0.22, 0.86 + (idx % 4) * 0.05);
      foliageInst.setColorAt(idx, organicTint);
    });
    trunkInst.computeBoundingSphere();
    foliageInst.computeBoundingSphere();
    worldRoot.add(trunkInst);
    worldRoot.add(foliageInst);

    const tuftTransforms: Array<{ x: number; y: number; z: number; yaw: number; sx: number; sy: number; idx: number }> = [];
    for (let i = 0; i < 240; i++) {
      const a = (i / 240) * Math.PI * 2 + Math.sin(i * 3.1) * 0.05;
      const rad = LAKE_AREA.waterRadius + 0.4 + ((i * 19) % 45) * 0.1;
      const gx = LAKE_AREA.x + Math.cos(a) * rad;
      const gz = LAKE_AREA.z + Math.sin(a) * rad;
      const gy = groundHeightAt(gx, gz);
      if (gy < LAKE_AREA.waterLevelY - 0.15 || gy > LAKE_AREA.waterLevelY + 2.4) continue;
      const s = 0.72 + (i % 5) * 0.11;
      tuftTransforms.push({ x: gx, y: gy - 0.04, z: gz, yaw: (i * 1.4) % (Math.PI * 2), sx: s, sy: s * 0.95, idx: i });
    }

    for (let rIdx = 0; rIdx < rockPositions.length; rIdx++) {
      const rp = rockPositions[rIdx];
      for (let k = 0; k < 2; k++) {
        const a = rIdx * 2.1 + k * 2.4;
        const dist = rp.scale * 1.05 + 0.25;
        const gx = rp.x + Math.cos(a) * dist;
        const gz = rp.z + Math.sin(a) * dist;
        const gy = groundHeightAt(gx, gz);
        if (gy < LAKE_AREA.waterLevelY + 0.05) continue;
        const s = 0.55 + ((rIdx + k) % 4) * 0.09;
        tuftTransforms.push({ x: gx, y: gy - 0.03, z: gz, yaw: a, sx: s, sy: s * 0.85, idx: rIdx + k });
      }
    }

    const grassTuftGeo = track(createGrassTuftGeometry());
    const grassRes = createGrassTuftMaterial(textures!);
    grassUniforms = grassRes.uniforms;
    track(grassRes.material);
    const grassTuftInst = new THREE.InstancedMesh(grassTuftGeo, grassRes.material, tuftTransforms.length);
    grassTuftInst.receiveShadow = true;
    tuftTransforms.forEach((gt, i) => {
      dummy.position.set(gt.x, gt.y, gt.z);
      dummy.rotation.set(0, gt.yaw, 0);
      dummy.scale.set(gt.sx, gt.sy, gt.sx);
      dummy.updateMatrix();
      grassTuftInst.setMatrixAt(i, dummy.matrix);
      organicTint.setHSL(0.24 + (gt.idx % 4) * 0.02, 0.24, 0.82 + (gt.idx % 3) * 0.07);
      grassTuftInst.setColorAt(i, organicTint);
    });
    grassTuftInst.computeBoundingSphere();
    worldRoot.add(grassTuftInst);

    const rockGeo = track(createCraggyRockGeometry());
    const rockMat = track(makePbrMaterial(textures!.terrain.rock, { roughness: 0.94, metalness: 0.04, normalScale: 1.35 }));
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockPositions.length);
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;
    rockPositions.forEach((rp, i) => {
      dummy.position.set(rp.x, rp.y, rp.z);
      dummy.rotation.set(rp.idx * 0.5, rp.idx * 1.1, rp.idx * 0.3);
      dummy.scale.set(rp.scale * 1.25, rp.scale * 0.78, rp.scale);
      dummy.updateMatrix();
      rockInst.setMatrixAt(i, dummy.matrix);
      organicTint.setHSL(0.11, 0.08, 0.82 + (i % 5) * 0.05);
      rockInst.setColorAt(i, organicTint);
    });
    rockInst.computeBoundingSphere();
    worldRoot.add(rockInst);
  }

  // 12. Dynamic Mission Elements (Aviation Gates, Reticles & Precision Beacons)
  const hoverZoneMesh = new THREE.Mesh(
    track(new THREE.CylinderGeometry(4.5, 4.5, 6.0, isLowPoly ? 20 : 36, 1, true)),
    track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
  );
  hoverZoneMesh.position.set(0, 7.5, 0);
  hoverZoneMesh.visible = false;
  worldRoot.add(hoverZoneMesh);

  const landingBeaconMesh = new THREE.Mesh(
    track(new THREE.RingGeometry(2.4, 3.15, isLowPoly ? 24 : 40)),
    track(
      new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
  );
  landingBeaconMesh.rotation.x = -Math.PI / 2;
  landingBeaconMesh.position.set(ELEVATED_PAD.x, ELEVATED_PAD.topY + 0.04, ELEVATED_PAD.z);
  landingBeaconMesh.visible = false;
  worldRoot.add(landingBeaconMesh);

  const gateGroup = new THREE.Group();
  worldRoot.add(gateGroup);
  let gateVisuals: GateVisual[] = [];
  let currentBuiltMissionId = '';

  const pylonMat = lowPoly
    ? lowPoly.pylonMat
    : track(makePbrMaterial(textures!.structures.steel_dark, { roughness: 0.78, metalness: 0.72 }));
  const pylonAccentMat = lowPoly
    ? lowPoly.pylonAccentMat
    : track(makePbrMaterial(textures!.structures.container_amber, { roughness: 0.6, metalness: 0.3 }));

  function rebuildGates(gates: GatePoint[]) {
    while (gateGroup.children.length > 0) {
      const child = gateGroup.children[0];
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else if (obj.material !== pylonMat && obj.material !== pylonAccentMat) obj.material.dispose();
        }
      });
      gateGroup.remove(child);
    }
    gateVisuals = [];

    for (const g of gates) {
      const grp = new THREE.Group();
      grp.position.set(g.x, g.y, g.z);
      grp.rotation.y = g.yaw;

      const ringMat = new THREE.MeshStandardMaterial({
        map: textures ? textures.gateChevronMap : null,
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 1.15,
        roughness: isLowPoly ? 0.45 : 0.32,
        metalness: isLowPoly ? 0.15 : 0.38,
        flatShading: isLowPoly,
      });
      const ringRadius = g.noPylons ? g.radius * 0.68 : g.radius * 0.85;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(ringRadius, g.noPylons ? 0.14 : 0.21, isLowPoly ? 8 : 14, isLowPoly ? 20 : 40),
        ringMat
      );
      ring.castShadow = true;
      grp.add(ring);

      const reticleMat = createGateReticleMaterial();
      const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(ringRadius * 0.94, isLowPoly ? 20 : 36), reticleMat);
      grp.add(innerDisc);

      if (!g.noPylons) {
        const gy = groundHeightAt(g.x, g.z);
        const legHeight = Math.max(1, g.y - gy);
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, legHeight, 10), pylonMat);
          post.position.set(side * (g.radius * 0.88), -legHeight * 0.5, 0);
          post.castShadow = true;
          grp.add(post);

          const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), pylonAccentMat);
          cap.position.set(side * (g.radius * 0.88), 0, 0);
          grp.add(cap);
        }
      }

      gateGroup.add(grp);
      gateVisuals.push({ group: grp, ringMat, reticleMat });
    }
  }

  function updateMissionVisuals(mission: MissionDefinition, progress: MissionProgress, elapsed: number) {
    if (currentBuiltMissionId !== mission.id) {
      currentBuiltMissionId = mission.id;
      rebuildGates(mission.gates);
    }

    hoverZoneMesh.visible = Boolean(mission.hoverTarget) && !progress.completed;
    if (hoverZoneMesh.visible) {
      const pulse = 0.14 + Math.sin(elapsed * 4) * 0.05;
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

      gv.reticleMat.uniforms.uTime.value = elapsed;

      if (cleared) {
        gv.ringMat.color.setHex(0x10b981);
        gv.ringMat.emissive.setHex(0x059669);
        gv.ringMat.emissiveIntensity = 0.35;
        gv.reticleMat.uniforms.uColor.value.setHex(0x10b981);
        gv.reticleMat.uniforms.uOpacity.value = 0.14;
      } else if (isTarget || isFreeFlight) {
        gv.ringMat.color.setHex(0xf59e0b);
        gv.ringMat.emissive.setHex(0xf59e0b);
        gv.ringMat.emissiveIntensity = 0.75 + Math.sin(elapsed * 5) * 0.25;
        gv.reticleMat.uniforms.uColor.value.setHex(0xf59e0b);
        gv.reticleMat.uniforms.uOpacity.value = 0.42;
      } else {
        gv.ringMat.color.setHex(0x38bdf8);
        gv.ringMat.emissive.setHex(0x0284c7);
        gv.ringMat.emissiveIntensity = 0.28;
        gv.reticleMat.uniforms.uColor.value.setHex(0x38bdf8);
        gv.reticleMat.uniforms.uOpacity.value = 0.2;
      }
    });
  }

  function updateEnvironment(elapsed: number, windEnabled: boolean) {
    const windVal = windEnabled ? 1.0 : 0.35;
    if (waterUniforms) {
      waterUniforms.uTime.value = elapsed;
      waterUniforms.uWindStrength.value = windVal;
    }
    if (foliageUniforms) {
      foliageUniforms.uTime.value = elapsed;
      foliageUniforms.uWindStrength.value = windVal;
    }
    if (grassUniforms) {
      grassUniforms.uTime.value = elapsed;
      grassUniforms.uWindStrength.value = windVal;
    }
    if (skyUniforms) {
      skyUniforms['time'].value = elapsed * (windEnabled ? 1.8 : 0.85);
    }

    // Subtle aviation helipad approach strobe breathing
    perimeterLedAmberMat.emissiveIntensity = 0.75 + Math.sin(elapsed * 2.8) * 0.2;
    perimeterLedCyanMat.emissiveIntensity = 0.78 + Math.cos(elapsed * 2.8) * 0.2;
  }

  return {
    turbineRotors,
    windsockSwivel,
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
    updateEnvironment,
    dispose: () => {
      worldRoot.removeFromParent();
      scene.environment = null;
      scene.background = null;
      scene.fog = null;
      for (const gv of gateVisuals) {
        gv.ringMat.dispose();
        gv.reticleMat.dispose();
      }
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
