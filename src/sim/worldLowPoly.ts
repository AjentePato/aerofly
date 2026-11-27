import * as THREE from 'three';
import { LAKE_AREA, groundHeightAt } from './physics';
import { ROAD_SEGMENTS, distToSegment2D, type StructureMaterialKey } from './structures';

export interface LowPolyPalette {
  terrainMat: THREE.MeshStandardMaterial;
  lakeMat: THREE.MeshStandardMaterial;
  mainPadMat: THREE.MeshStandardMaterial;
  elevPadMat: THREE.MeshStandardMaterial;
  padSideMat: THREE.MeshStandardMaterial;
  padSteelCollarMat: THREE.MeshStandardMaterial;
  asphaltMat: THREE.MeshStandardMaterial;
  poleSteelMat: THREE.MeshStandardMaterial;
  turbineMat: THREE.MeshStandardMaterial;
  nacelleMat: THREE.MeshStandardMaterial;
  woodDeckMat: THREE.MeshStandardMaterial;
  cabinSteelMat: THREE.MeshStandardMaterial;
  metalRoofMat: THREE.MeshStandardMaterial;
  amberAccentMat: THREE.MeshStandardMaterial;
  trunkMat: THREE.MeshStandardMaterial;
  foliageMat: THREE.MeshStandardMaterial;
  rockMat: THREE.MeshStandardMaterial;
  pylonMat: THREE.MeshStandardMaterial;
  pylonAccentMat: THREE.MeshStandardMaterial;
  structureMaterials: Record<StructureMaterialKey, THREE.MeshStandardMaterial>;
}

function flatMat(color: number, roughness = 0.85, metalness = 0.05): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  });
}

export function createLowPolyPalette(track: <T extends { dispose: () => void }>(item: T) => T): LowPolyPalette {
  const concreteMat = track(flatMat(0x94a3b8, 0.9, 0.05));
  const steelDarkMat = track(flatMat(0x334155, 0.65, 0.45));
  const amberMat = track(flatMat(0xf59e0b, 0.65, 0.15));
  const metalRoofMat = track(flatMat(0x64748b, 0.7, 0.35));
  const woodMat = track(flatMat(0x8b5a2b, 0.9, 0.02));

  return {
    terrainMat: track(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.92,
        metalness: 0.0,
      })
    ),
    lakeMat: track(
      new THREE.MeshStandardMaterial({
        color: 0x2292cc,
        flatShading: true,
        roughness: 0.28,
        metalness: 0.06,
        transparent: true,
        opacity: 0.86,
      })
    ),
    mainPadMat: track(flatMat(0x475569, 0.88, 0.05)),
    elevPadMat: track(flatMat(0x3b495e, 0.86, 0.06)),
    padSideMat: concreteMat,
    padSteelCollarMat: steelDarkMat,
    asphaltMat: track(flatMat(0x334155, 0.9, 0.05)),
    poleSteelMat: steelDarkMat,
    turbineMat: track(flatMat(0xf1f5f9, 0.45, 0.1)),
    nacelleMat: track(flatMat(0xe2e8f0, 0.42, 0.18)),
    woodDeckMat: woodMat,
    cabinSteelMat: steelDarkMat,
    metalRoofMat,
    amberAccentMat: amberMat,
    trunkMat: track(flatMat(0x6b4423, 0.92, 0.02)),
    foliageMat: track(flatMat(0x2d7a36, 0.88, 0.02)),
    rockMat: track(flatMat(0x788290, 0.92, 0.04)),
    pylonMat: steelDarkMat,
    pylonAccentMat: amberMat,
    structureMaterials: {
      concrete_weathered: concreteMat,
      brick_ruin: track(flatMat(0xb4533c, 0.92, 0.02)),
      plaster_ruin: track(flatMat(0xcbb99e, 0.92, 0.02)),
      wood_aged: woodMat,
      stone_ancient: track(flatMat(0x78716c, 0.94, 0.02)),
      steel_dark: steelDarkMat,
      steel_rust: track(flatMat(0x7c2d12, 0.85, 0.35)),
      container_blue: track(flatMat(0x1d4ed8, 0.72, 0.2)),
      container_red: track(flatMat(0xb91c1c, 0.72, 0.2)),
      container_amber: amberMat,
      metal_roof: metalRoofMat,
    },
  };
}

/**
 * Faceted low-poly terrain geometry (110x110) with clean biome vertex colors.
 */
export function createLowPolyTerrainGeometry(): THREE.PlaneGeometry {
  const terrainSize = 1360;
  const terrainSegments = 110;
  const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const halfSpan = terrainSize * 0.5;
  const cTmp = new THREE.Color();
  const grassCol = new THREE.Color(0x3c8f38);
  const turfCol = new THREE.Color(0x49a342);
  const gravelCol = new THREE.Color(0x8a806c);
  const shoreCol = new THREE.Color(0xc2b284);
  const rockCol = new THREE.Color(0x707884);

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
      for (const [ax, az, bx, bz] of ROAD_SEGMENTS) {
        const d = distToSegment2D(x, z, ax, az, bx, bz);
        if (d < minRoad) minRoad = d;
      }
      if (minRoad < 4.8) {
        roadWeight = Math.max(0, 1 - minRoad / 4.8);
      }
    }

    const rockWeight = Math.max(0, Math.min(1, (y - 16) / 14));
    cTmp.copy(grassCol).lerp(turfCol, turfWeight);
    cTmp.lerp(shoreCol, shoreWeight * (1 - rockWeight * 0.6));
    cTmp.lerp(gravelCol, roadWeight * (1 - rockWeight * 0.7));
    cTmp.lerp(rockCol, rockWeight);

    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Classic stacked 3-cone low-poly pine tree crown matching collision bounds (y: 2.0..7.95, R <= 2.05).
 */
export function createLowPolyPineCrownGeometry(
  mergeGeos: (geos: THREE.BufferGeometry[]) => THREE.BufferGeometry
): THREE.BufferGeometry {
  const c1 = new THREE.ConeGeometry(1.95, 2.7, 7);
  c1.translate(0, 3.35, 0);
  const c2 = new THREE.ConeGeometry(1.5, 2.5, 7);
  c2.rotateY(0.45);
  c2.translate(0, 4.75, 0);
  const c3 = new THREE.ConeGeometry(1.0, 2.3, 7);
  c3.rotateY(0.9);
  c3.translate(0, 6.25, 0);
  return mergeGeos([c1, c2, c3]);
}

/**
 * Adds a clean geometric 'H' helipad circle marking onto low-poly landing pads.
 */
export function buildLowPolyHelipadMarkings(
  parent: THREE.Object3D,
  x: number,
  topY: number,
  z: number,
  radius: number,
  ringColor: number,
  track: <T extends { dispose: () => void }>(item: T) => T
): void {
  const ringMat = track(
    new THREE.MeshStandardMaterial({
      color: ringColor,
      roughness: 0.72,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const hMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.72,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    })
  );

  const ringGeo = track(new THREE.RingGeometry(radius * 0.68, radius * 0.8, 24));
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(x, topY + 0.012, z);
  parent.add(ring);

  const legLen = radius * 0.72;
  const legW = radius * 0.14;
  const legGeo = track(new THREE.PlaneGeometry(legW, legLen));
  legGeo.rotateX(-Math.PI / 2);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, hMat);
    leg.position.set(x + sx * radius * 0.22, topY + 0.014, z);
    parent.add(leg);
  }
  const crossGeo = track(new THREE.PlaneGeometry(radius * 0.44, legW));
  crossGeo.rotateX(-Math.PI / 2);
  const cross = new THREE.Mesh(crossGeo, hMat);
  cross.position.set(x, topY + 0.014, z);
  parent.add(cross);
}
