export type StructureMaterialKey =
  | 'concrete_weathered'
  | 'brick_ruin'
  | 'wood_aged'
  | 'stone_ancient'
  | 'steel_dark'
  | 'steel_rust'
  | 'container_blue'
  | 'container_red'
  | 'container_amber'
  | 'metal_roof';

export interface BoxCollider {
  /** World-space center */
  cx: number;
  cy: number;
  cz: number;
  /** Half-extents along local X, Y, Z */
  hx: number;
  hy: number;
  hz: number;
  /** Rotation around world Y axis (radians) */
  yaw: number;
  /** Material key for rendering */
  material: StructureMaterialKey;
  /** Whether physics collides against this box (false for thin non-blocking trim) */
  solid: boolean;
  /** Whether this part casts shadows */
  castShadow?: boolean;
}

export interface StructureAnchor {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
}

interface LocalBox {
  lx: number;
  ly: number;
  lz: number;
  hx: number;
  hy: number;
  hz: number;
  material: StructureMaterialKey;
  solid?: boolean;
  castShadow?: boolean;
}

function addLocalParts(
  out: BoxCollider[],
  originX: number,
  baseY: number,
  originZ: number,
  yaw: number,
  parts: LocalBox[]
) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (const p of parts) {
    // Three.js Y-rotation maps local (lx, lz) -> (lx * c + lz * s, -lx * s + lz * c)
    const wx = originX + p.lx * c + p.lz * s;
    const wz = originZ - p.lx * s + p.lz * c;
    out.push({
      cx: wx,
      cy: baseY + p.ly,
      cz: wz,
      hx: p.hx,
      hy: p.hy,
      hz: p.hz,
      yaw,
      material: p.material,
      solid: p.solid !== false,
      castShadow: p.castShadow !== false,
    });
  }
}

export const STRUCTURE_SLAB_ELEVATION = 0.34;

/**
 * Two-story abandoned concrete & brick house with pass-through ground doorways
 * (front/back + side breaches), 2nd-floor panoramic broken windows, and collapsed skylight roof.
 * All wall/lintel/slab seams are strictly disjoint to prevent Z-fighting.
 */
function buildTwoStoryAbandonedHouse(
  out: BoxCollider[],
  x: number,
  baseY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];
  const wallT = 0.28; // wall spans +/-0.28 around wall center

  // Concrete foundation plinth extending deep below terrain (top at y = 0.0 -> groundY + 0.34)
  parts.push({
    lx: 0,
    ly: -1.4,
    lz: 0,
    hx: 7.4,
    hy: 1.4,
    hz: 5.4,
    material: 'concrete_weathered',
    castShadow: false,
  });

  // Front (lz = +4.8) & Back (lz = -4.8) walls: z in [±4.52, ±5.08], full width x in [-7, +7]
  for (const sz of [-4.8, 4.8]) {
    // Ground left & right piers (x in [-7,-2] and [2,7], y in [0, 3.4])
    parts.push({ lx: -4.5, ly: 1.7, lz: sz, hx: 2.5, hy: 1.7, hz: wallT, material: 'brick_ruin' });
    parts.push({ lx: 4.5, ly: 1.7, lz: sz, hx: 2.5, hy: 1.7, hz: wallT, material: 'brick_ruin' });
    // Doorway timber jamb trim flush inside opening (x in [±1.84, ±2.00])
    parts.push({ lx: -1.92, ly: 1.7, lz: sz, hx: 0.08, hy: 1.68, hz: 0.34, material: 'wood_aged', solid: false });
    parts.push({ lx: 1.92, ly: 1.7, lz: sz, hx: 0.08, hy: 1.68, hz: 0.34, material: 'wood_aged', solid: false });
    // First-floor lintel band (y in [3.4, 4.1])
    parts.push({ lx: 0, ly: 3.75, lz: sz, hx: 7.0, hy: 0.35, hz: wallT, material: 'concrete_weathered' });
    // Upper-floor piers flanking 5.0m panoramic window (y in [4.1, 6.5])
    parts.push({ lx: -4.75, ly: 5.3, lz: sz, hx: 2.25, hy: 1.2, hz: wallT, material: 'brick_ruin' });
    parts.push({ lx: 4.75, ly: 5.3, lz: sz, hx: 2.25, hy: 1.2, hz: wallT, material: 'brick_ruin' });
    // Top roof beam (y in [6.5, 7.1])
    parts.push({ lx: 0, ly: 6.8, lz: sz, hx: 7.0, hy: 0.3, hz: wallT, material: 'concrete_weathered' });
  }

  // Side walls (lx = ±6.72) strictly between front/back inner faces (z in [-4.52, +4.52])
  for (const sx of [-6.72, 6.72]) {
    // Ground side piers leaving 4.0m central side breach (z in [-2.0, +2.0])
    parts.push({ lx: sx, ly: 1.7, lz: -3.26, hx: wallT, hy: 1.7, hz: 1.26, material: 'brick_ruin' });
    parts.push({ lx: sx, ly: 1.7, lz: 3.26, hx: wallT, hy: 1.7, hz: 1.26, material: 'brick_ruin' });
    // Upper side walls (y in [3.4, 7.1], z in [-4.52, +4.52])
    parts.push({ lx: sx, ly: 5.25, lz: 0, hx: wallT, hy: 1.85, hz: 4.52, material: 'brick_ruin' });
  }

  // Partial 2nd floor slabs strictly inside perimeter walls (y in [3.45, 3.85])
  parts.push({ lx: -4.65, ly: 3.65, lz: 0, hx: 1.79, hy: 0.2, hz: 4.52, material: 'concrete_weathered' });
  parts.push({ lx: 4.65, ly: 3.65, lz: 0, hx: 1.79, hy: 0.2, hz: 4.52, material: 'concrete_weathered' });

  // Partially collapsed roof wings sitting strictly above y = 7.1 + exposed rafters
  parts.push({ lx: -4.75, ly: 7.28, lz: 0, hx: 2.35, hy: 0.16, hz: 5.3, material: 'metal_roof' });
  parts.push({ lx: 4.75, ly: 7.28, lz: 0, hx: 2.35, hy: 0.16, hz: 5.3, material: 'metal_roof' });
  for (const rz of [-3.2, 0, 3.2]) {
    parts.push({ lx: 0, ly: 7.22, lz: rz, hx: 2.4, hy: 0.1, hz: 0.14, material: 'wood_aged' });
  }

  addLocalParts(out, x, baseY, z, yaw, parts);
}

/**
 * Single-story ruined house with wide front-to-back breach, porch columns, and missing roof corner.
 */
function buildSingleStoryRuinedHouse(
  out: BoxCollider[],
  x: number,
  baseY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];
  const wallT = 0.26;

  parts.push({
    lx: 0,
    ly: -1.4,
    lz: 0,
    hx: 5.8,
    hy: 1.4,
    hz: 4.8,
    material: 'concrete_weathered',
    castShadow: false,
  });

  // Front & back walls (z in [±3.94, ±4.46], full x in [-5.5, +5.5])
  for (const sz of [-4.2, 4.2]) {
    parts.push({ lx: -3.7, ly: 1.6, lz: sz, hx: 1.8, hy: 1.6, hz: wallT, material: 'concrete_weathered' });
    parts.push({ lx: 3.7, ly: 1.6, lz: sz, hx: 1.8, hy: 1.6, hz: wallT, material: 'concrete_weathered' });
    parts.push({ lx: 0, ly: 3.55, lz: sz, hx: 5.5, hy: 0.35, hz: wallT, material: 'concrete_weathered' });
  }

  // Left & right walls strictly between front/back inner faces (z in [-3.94, +3.94])
  parts.push({ lx: -5.24, ly: 1.6, lz: -2.47, hx: wallT, hy: 1.6, hz: 1.47, material: 'brick_ruin' });
  parts.push({ lx: -5.24, ly: 1.6, lz: 2.47, hx: wallT, hy: 1.6, hz: 1.47, material: 'brick_ruin' });
  parts.push({ lx: -5.24, ly: 3.55, lz: 0, hx: wallT, hy: 0.35, hz: 3.94, material: 'concrete_weathered' });

  parts.push({ lx: 5.24, ly: 1.95, lz: -2.54, hx: wallT, hy: 1.95, hz: 1.4, material: 'brick_ruin' });
  parts.push({ lx: 5.24, ly: 1.0, lz: 2.54, hx: wallT, hy: 1.0, hz: 1.4, material: 'brick_ruin' });

  // Porch pillars out front (lz = +5.8, top at y = 3.70) + porch canopy above (y = 3.86..4.14)
  for (const px of [-4.5, 4.5]) {
    parts.push({ lx: px, ly: 1.85, lz: 5.8, hx: 0.22, hy: 1.85, hz: 0.22, material: 'wood_aged' });
  }
  parts.push({ lx: 0, ly: 4.0, lz: 5.3, hx: 5.6, hy: 0.14, hz: 0.84, material: 'metal_roof' });

  // Half roof left intact strictly above walls (y in [3.92, 4.24])
  parts.push({ lx: -2.8, ly: 4.08, lz: 0, hx: 2.8, hy: 0.16, hz: 4.46, material: 'metal_roof' });
  parts.push({ lx: 2.7, ly: 4.02, lz: -1.8, hx: 2.6, hy: 0.1, hz: 0.14, material: 'wood_aged' });
  parts.push({ lx: 2.7, ly: 4.02, lz: 1.8, hx: 2.6, hy: 0.1, hz: 0.14, material: 'wood_aged' });

  addLocalParts(out, x, baseY, z, yaw, parts);
}

/**
 * Roofless brick barn/shed with 3 arched side bays and overhead timber beams.
 */
function buildBrickShellBarn(
  out: BoxCollider[],
  x: number,
  baseY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];
  const wallT = 0.28;

  parts.push({
    lx: 0,
    ly: -1.4,
    lz: 0,
    hx: 8.4,
    hy: 1.4,
    hz: 5.2,
    material: 'concrete_weathered',
    castShadow: false,
  });

  // Front & back gable ends (z in [±4.52, ±5.08], x in [-8.0, +8.0])
  for (const sz of [-4.8, 4.8]) {
    parts.push({ lx: -5.1, ly: 2.2, lz: sz, hx: 2.9, hy: 2.2, hz: wallT, material: 'brick_ruin' });
    parts.push({ lx: 5.1, ly: 2.2, lz: sz, hx: 2.9, hy: 2.2, hz: wallT, material: 'brick_ruin' });
    parts.push({ lx: 0, ly: 4.85, lz: sz, hx: 8.0, hy: 0.45, hz: wallT, material: 'concrete_weathered' });
  }

  // Side walls strictly between front/back inner faces (z in [-4.52, +4.52])
  for (const sx of [-7.72, 7.72]) {
    for (const pz of [-4.05, -1.35, 1.35, 4.05]) {
      parts.push({ lx: sx, ly: 2.2, lz: pz, hx: wallT, hy: 2.2, hz: 0.44, material: 'brick_ruin' });
    }
    parts.push({ lx: sx, ly: 4.8, lz: 0, hx: wallT, hy: 0.4, hz: 4.52, material: 'concrete_weathered' });
  }

  // 3 exposed overhead rafters strictly above side beams (y in [5.22, 5.54])
  for (const rz of [-2.4, 0, 2.4]) {
    parts.push({ lx: 0, ly: 5.38, lz: rz, hx: 8.0, hy: 0.16, hz: 0.18, material: 'wood_aged' });
  }

  addLocalParts(out, x, baseY, z, yaw, parts);
}

/**
 * Ancient stone aqueduct with 5 wide pass-through arches (9.4m wide x 7.1m tall openings).
 */
function buildRuinedAqueduct(
  out: BoxCollider[],
  x: number,
  baseY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];
  const pierXs = [-30, -18, -6, 6, 18, 30];

  for (const px of pierXs) {
    // Pier spans y in [0.0, 7.2]
    parts.push({
      lx: px,
      ly: 3.6,
      lz: 0,
      hx: 1.3,
      hy: 3.6,
      hz: 2.4,
      material: 'stone_ancient',
    });
    // Base stone step footing strictly below y = 0.0 (y in [-3.2, 0.0])
    parts.push({
      lx: px,
      ly: -1.6,
      lz: 0,
      hx: 1.65,
      hy: 1.6,
      hz: 2.75,
      material: 'stone_ancient',
      castShadow: false,
    });
  }

  // Continuous upper aqueduct lintel deck sitting cleanly above piers (y in [7.2, 8.5])
  parts.push({ lx: 0, ly: 7.85, lz: 0, hx: 31.3, hy: 0.65, hz: 2.5, material: 'stone_ancient' });

  // Broken upper water-channel parapets sitting cleanly above deck (y in [8.5, 9.3])
  for (const sz of [-2.15, 2.15]) {
    parts.push({ lx: -15, ly: 8.9, lz: sz, hx: 14, hy: 0.4, hz: 0.35, material: 'stone_ancient' });
    parts.push({ lx: 16, ly: 8.9, lz: sz, hx: 8, hy: 0.4, hz: 0.35, material: 'stone_ancient' });
  }

  // Angled stone arch corbels recessed in Z & strictly between piers/deck (y in [6.3, 7.2])
  for (const spanX of [-24, -12, 0, 12, 24]) {
    parts.push({ lx: spanX - 4.05, ly: 6.75, lz: 0, hx: 0.65, hy: 0.45, hz: 2.25, material: 'stone_ancient' });
    parts.push({ lx: spanX + 4.05, ly: 6.75, lz: 0, hx: 0.65, hy: 0.45, hz: 2.25, material: 'stone_ancient' });
  }

  addLocalParts(out, x, baseY, z, yaw, parts);
}

/**
 * Ancient stone temple courtyard with 4 cardinal portico arches and hollow inner sanctum.
 */
function buildAncientRuinsCourtyard(
  out: BoxCollider[],
  x: number,
  baseY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];

  // Stepped stone foundation (top at y = 0.0)
  parts.push({
    lx: 0,
    ly: -1.4,
    lz: 0,
    hx: 12.5,
    hy: 1.4,
    hz: 12.5,
    material: 'stone_ancient',
    castShadow: false,
  });

  // North & South entrance archways (z in [±10.3, ±11.7], full x in [-11.8, +11.8])
  for (const sz of [-11, 11]) {
    parts.push({ lx: -7.1, ly: 2.5, lz: sz, hx: 4.7, hy: 2.5, hz: 0.7, material: 'stone_ancient' });
    parts.push({ lx: 7.1, ly: 2.5, lz: sz, hx: 4.7, hy: 2.5, hz: 0.7, material: 'stone_ancient' });
    parts.push({ lx: 0, ly: 5.55, lz: sz, hx: 11.8, hy: 0.55, hz: 0.8, material: 'stone_ancient' });
  }
  // East & West entrance archways strictly between N/S inner faces (z in [-10.2, +10.2])
  for (const sx of [-11, 11]) {
    parts.push({ lx: sx, ly: 2.5, lz: -6.3, hx: 0.7, hy: 2.5, hz: 3.9, material: 'stone_ancient' });
    parts.push({ lx: sx, ly: 2.5, lz: 6.3, hx: 0.7, hy: 2.5, hz: 3.9, material: 'stone_ancient' });
    parts.push({ lx: sx, ly: 5.55, lz: 0, hx: 0.8, hy: 0.55, hz: 10.2, material: 'stone_ancient' });
  }

  // Inner colonnade pillars around central sanctum (y in [0.0, 5.6])
  for (const [cx, cz] of [
    [-5.5, -5.5],
    [5.5, -5.5],
    [-5.5, 5.5],
    [5.5, 5.5],
  ]) {
    parts.push({ lx: cx, ly: 2.8, lz: cz, hx: 0.55, hy: 2.8, hz: 0.55, material: 'stone_ancient' });
  }
  // Broken lintel sitting cleanly on top of the northern two inner pillars (y in [5.6, 6.4])
  parts.push({ lx: 0, ly: 6.0, lz: -5.5, hx: 6.3, hy: 0.4, hz: 0.65, material: 'stone_ancient' });

  addLocalParts(out, x, baseY, z, yaw, parts);
}

/**
 * Large open-ended industrial aviation hangar (15m wide x 9.5m tall x 30m long)
 * with side doorway breaches and interior overhead crane beam at y=6.2m.
 */
function buildIndustrialHangar(
  out: BoxCollider[],
  x: number,
  baseY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];

  // Concrete apron slab (top at y = 0.0 -> groundY + 0.34)
  parts.push({
    lx: 0,
    ly: -1.4,
    lz: 0,
    hx: 8.5,
    hy: 1.4,
    hz: 16.0,
    material: 'concrete_weathered',
    castShadow: false,
  });

  // Outer corrugated side walls (lx = ±7.32, x in [±7.02, ±7.62], y in [0, 9.0])
  for (const sx of [-7.32, 7.32]) {
    parts.push({ lx: sx, ly: 4.5, lz: -8.75, hx: 0.3, hy: 4.5, hz: 6.25, material: 'steel_dark' });
    parts.push({ lx: sx, ly: 4.5, lz: 8.75, hx: 0.3, hy: 4.5, hz: 6.25, material: 'steel_dark' });
    parts.push({ lx: sx, ly: 6.6, lz: 0, hx: 0.3, hy: 2.4, hz: 2.5, material: 'steel_dark' });
  }

  // 5 heavy steel portal ribs proud INSIDE the side walls (lx = ±6.67, x in [±6.32, ±7.02])
  for (const rz of [-14, -7, 0, 7, 14]) {
    parts.push({ lx: -6.67, ly: 4.3, lz: rz, hx: 0.35, hy: 4.3, hz: 0.35, material: 'steel_rust' });
    parts.push({ lx: 6.67, ly: 4.3, lz: rz, hx: 0.35, hy: 4.3, hz: 0.35, material: 'steel_rust' });
    // Top roof truss spanning y in [8.6, 9.24]
    parts.push({ lx: 0, ly: 8.92, lz: rz, hx: 7.02, hy: 0.32, hz: 0.35, material: 'steel_rust' });
  }

  // Metal roof cladding strictly above ribs/walls (y in [9.24, 9.64])
  parts.push({ lx: 0, ly: 9.44, lz: 0, hx: 7.8, hy: 0.2, hz: 15.3, material: 'metal_roof' });

  // Interior overhead crane girder at y = 6.2 cleanly between inner rib faces (hx = 6.32)
  parts.push({ lx: 0, ly: 6.2, lz: 0, hx: 6.32, hy: 0.32, hz: 0.42, material: 'container_amber' });

  addLocalParts(out, x, baseY, z, yaw, parts);
}

/**
 * Stacked shipping container yard featuring narrow slalom alleys and an elevated
 * hollow open-through container tunnel (3.1m wide x 2.6m tall inside).
 */
function buildContainerPrecisionYard(
  out: BoxCollider[],
  x: number,
  baseY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];

  parts.push({
    lx: 0,
    ly: -1.4,
    lz: 0,
    hx: 12.5,
    hy: 1.4,
    hz: 10.5,
    material: 'concrete_weathered',
    castShadow: false,
  });

  // Two lower base containers flanking a 4.0m ground alley (top at y = 2.8)
  parts.push({ lx: -3.4, ly: 1.4, lz: 0, hx: 1.4, hy: 1.4, hz: 4.5, material: 'container_blue' });
  parts.push({ lx: 3.4, ly: 1.4, lz: 0, hx: 1.4, hy: 1.4, hz: 4.5, material: 'container_red' });

  // Elevated HOLLOW pass-through container sitting cleanly above base (y in [2.8, 5.9])
  // Floor (y in [2.8, 3.12]), Roof (y in [5.58, 5.9]), Side walls strictly between floor & roof (y in [3.12, 5.58])
  parts.push({ lx: 0, ly: 2.96, lz: 0, hx: 1.94, hy: 0.16, hz: 4.5, material: 'container_amber' });
  parts.push({ lx: 0, ly: 5.74, lz: 0, hx: 1.94, hy: 0.16, hz: 4.5, material: 'container_amber' });
  parts.push({ lx: -1.76, ly: 4.35, lz: 0, hx: 0.18, hy: 1.23, hz: 4.5, material: 'container_amber' });
  parts.push({ lx: 1.76, ly: 4.35, lz: 0, hx: 0.18, hy: 1.23, hz: 4.5, material: 'container_amber' });

  // Adjacent offset slalom containers creating a 3.6m S-alley (stacked strictly y in [0, 2.8] & [2.8, 5.6])
  parts.push({ lx: 8.6, ly: 1.4, lz: -3.0, hx: 1.4, hy: 1.4, hz: 4.5, material: 'container_amber' });
  parts.push({ lx: 8.6, ly: 4.2, lz: -3.0, hx: 1.4, hy: 1.4, hz: 4.5, material: 'container_blue' });
  parts.push({ lx: -8.6, ly: 1.4, lz: 3.2, hx: 1.4, hy: 1.4, hz: 4.5, material: 'container_red' });

  addLocalParts(out, x, baseY, z, yaw, parts);
}

/**
 * Steel truss bridge spanning the expanded lake with 3 water-skimming under-arches
 * and overhead steel portal frames for high-speed deck runs.
 */
function buildLakeTrussBridge(
  out: BoxCollider[],
  x: number,
  waterY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];
  // Deck sits 6.6m above water (world y = 5.0 when waterY = -1.6)
  const deckY = 6.6;

  // 4 deep concrete bridge piers anchored below lakebed (y in [-5.0, deckY - 0.38 = 6.22])
  for (const px of [-32, -11, 11, 32]) {
    parts.push({ lx: px, ly: 0.61, lz: 0, hx: 1.35, hy: 5.61, hz: 3.5, material: 'concrete_weathered' });
  }

  // Continuous bridge deck (y in [deckY - 0.38, deckY + 0.38])
  parts.push({ lx: 0, ly: deckY, lz: 0, hx: 42, hy: 0.38, hz: 3.8, material: 'concrete_weathered' });

  // Bridge side guardrails sitting cleanly on deck (y in [deckY + 0.38, deckY + 1.08])
  for (const sz of [-3.46, 3.46]) {
    parts.push({ lx: 0, ly: deckY + 0.73, lz: sz, hx: 42, hy: 0.35, hz: 0.14, material: 'steel_dark' });
  }

  // 3 overhead truss portals positioned just outside guardrails (sz = ±3.74)
  for (const px of [-18, 0, 18]) {
    parts.push({ lx: px, ly: deckY + 2.68, lz: -3.74, hx: 0.28, hy: 2.3, hz: 0.14, material: 'steel_rust' });
    parts.push({ lx: px, ly: deckY + 2.68, lz: 3.74, hx: 0.28, hy: 2.3, hz: 0.14, material: 'steel_rust' });
    // Top portal crossbeam strictly above vertical posts (y in [deckY + 4.98, deckY + 5.54])
    parts.push({ lx: px, ly: deckY + 5.26, lz: 0, hx: 0.32, hy: 0.28, hz: 3.92, material: 'steel_rust' });
  }
  // Longitudinal top truss chords strictly between portals (x in [-17.68, -0.32] & [0.32, 17.68])
  for (const sz of [-3.72, 3.72]) {
    parts.push({ lx: -9, ly: deckY + 4.74, lz: sz, hx: 8.68, hy: 0.24, hz: 0.16, material: 'steel_dark' });
    parts.push({ lx: 9, ly: deckY + 4.74, lz: sz, hx: 8.68, hy: 0.24, hz: 0.16, material: 'steel_dark' });
  }

  addLocalParts(out, x, waterY, z, yaw, parts);
}

/**
 * Training runway gantry near spawn (twin stacked openings: low 7m bay & upper 7m truss window).
 * Posts, amber crossbar, and top cap are strictly non-overlapping to prevent Z-fighting.
 */
function buildRunwayTrainingGantry(
  out: BoxCollider[],
  x: number,
  baseY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];
  // Two vertical dark steel posts (inner faces at lx = ±3.52, embedded to y = -0.5, top at y = 8.2)
  for (const sx of [-3.8, 3.8]) {
    parts.push({ lx: sx, ly: 3.85, lz: 0, hx: 0.28, hy: 4.35, hz: 0.28, material: 'steel_dark' });
  }
  // Mid amber crossbar recessed cleanly between inner faces of the posts (lx in [-3.52, +3.52], hz = 0.22)
  parts.push({ lx: 0, ly: 5.2, lz: 0, hx: 3.52, hy: 0.24, hz: 0.22, material: 'container_amber' });
  // Top rust steel cap sitting cleanly ON TOP of the posts (y in [8.2, 8.76])
  parts.push({ lx: 0, ly: 8.48, lz: 0, hx: 4.2, hy: 0.28, hz: 0.34, material: 'steel_rust' });

  addLocalParts(out, x, baseY, z, yaw, parts);
}

/**
 * Abandoned lakeside wooden boathouse on stilts with open water-facing boat bay.
 */
function buildAbandonedBoathouse(
  out: BoxCollider[],
  x: number,
  baseY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];
  // 4 pilings strictly below walkway bottom (y in [-1.8, 1.34])
  for (const [px, pz] of [
    [-3.6, -4.5],
    [3.6, -4.5],
    [-3.6, 4.5],
    [3.6, 4.5],
  ]) {
    parts.push({ lx: px, ly: -0.23, lz: pz, hx: 0.25, hy: 1.57, hz: 0.25, material: 'wood_aged' });
  }
  // Side deck walkways leaving central boat channel (4.2m wide) open (y in [1.34, 1.66])
  parts.push({ lx: -3.0, ly: 1.5, lz: 0, hx: 0.9, hy: 0.16, hz: 4.8, material: 'wood_aged' });
  parts.push({ lx: 3.0, ly: 1.5, lz: 0, hx: 0.9, hy: 0.16, hz: 4.8, material: 'wood_aged' });
  // Side wooden walls strictly above deck top (y in [1.66, 5.10])
  parts.push({ lx: -3.7, ly: 3.38, lz: 0, hx: 0.2, hy: 1.72, hz: 4.6, material: 'wood_aged' });
  parts.push({ lx: 3.7, ly: 3.38, lz: 0, hx: 0.2, hy: 1.72, hz: 4.6, material: 'wood_aged' });
  // Partial weathered roof strictly above wall tops (y in [5.10, 5.42], 0.2m skylight gap at lx=0)
  parts.push({ lx: -2.05, ly: 5.26, lz: -0.6, hx: 1.95, hy: 0.16, hz: 4.2, material: 'metal_roof' });
  parts.push({ lx: 2.05, ly: 5.26, lz: 0.6, hx: 1.95, hy: 0.16, hz: 4.0, material: 'metal_roof' });

  addLocalParts(out, x, baseY, z, yaw, parts);
}

/**
 * Concrete hillside tunnel bunker along the northern approach (5.2m wide x 4.3m tall).
 */
function buildConcreteBunkerTunnel(
  out: BoxCollider[],
  x: number,
  baseY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];
  // Floor pad (y in [-2.8, 0.0]), walls (y in [0.0, 4.3]), roof (y in [4.3, 5.2])
  parts.push({ lx: 0, ly: -1.4, lz: 0, hx: 3.7, hy: 1.4, hz: 10.8, material: 'concrete_weathered', castShadow: false });
  parts.push({ lx: -3.15, ly: 2.15, lz: 0, hx: 0.55, hy: 2.15, hz: 10.5, material: 'concrete_weathered' });
  parts.push({ lx: 3.15, ly: 2.15, lz: 0, hx: 0.55, hy: 2.15, hz: 10.5, material: 'concrete_weathered' });
  parts.push({ lx: 0, ly: 4.75, lz: 0, hx: 3.7, hy: 0.45, hz: 10.5, material: 'concrete_weathered' });

  addLocalParts(out, x, baseY, z, yaw, parts);
}

/**
 * Twin industrial silos connected by an elevated steel catwalk (clear 10m underpass).
 */
function buildSilosAndCatwalk(
  out: BoxCollider[],
  x: number,
  baseY: number,
  z: number,
  yaw: number
) {
  const parts: LocalBox[] = [];
  for (const sx of [-7.2, 7.2]) {
    parts.push({ lx: sx, ly: 6.5, lz: 0, hx: 2.2, hy: 9.5, hz: 2.2, material: 'steel_dark' });
    parts.push({ lx: sx, ly: 16.4, lz: 0, hx: 2.4, hy: 0.4, hz: 2.4, material: 'steel_rust' });
  }
  // Catwalk strictly between silos (x in [-5.0, +5.0]) + railings strictly above deck (y in [9.75, 10.65])
  parts.push({ lx: 0, ly: 9.5, lz: 0, hx: 5.0, hy: 0.25, hz: 1.4, material: 'steel_rust' });
  parts.push({ lx: 0, ly: 10.2, lz: -1.3, hx: 4.98, hy: 0.45, hz: 0.1, material: 'steel_dark', solid: false });
  parts.push({ lx: 0, ly: 10.2, lz: 1.3, hx: 4.98, hy: 0.45, hz: 0.1, material: 'steel_dark', solid: false });

  addLocalParts(out, x, baseY, z, yaw, parts);
}

/**
 * Generates all static architectural colliders & meshes across the expanded open world.
 * Pure function of groundHeightAt so physics and Three.js stay 100% synchronized.
 */
export function buildWorldStructures(getGroundY: (x: number, z: number) => number): {
  parts: BoxCollider[];
  anchors: StructureAnchor[];
} {
  const parts: BoxCollider[] = [];

  // Near-spawn precision runway gantry
  buildRunwayTrainingGantry(parts, 0, getGroundY(0, -36), -36, 0);

  const floorY = (x: number, z: number) => getGroundY(x, z) + STRUCTURE_SLAB_ELEVATION;

  // NW Abandoned Village ("Vila Fantasma")
  buildTwoStoryAbandonedHouse(parts, -82, floorY(-82, -48), -48, 0.35);
  buildSingleStoryRuinedHouse(parts, -112, floorY(-112, -68), -68, -0.45);
  buildBrickShellBarn(parts, -96, floorY(-96, -102), -102, 0.8);
  buildSingleStoryRuinedHouse(parts, -135, floorY(-135, -45), -45, 1.15);

  // SW Ancient Ruins ("Ruínas do Vale")
  buildRuinedAqueduct(parts, -95, floorY(-95, 78), 78, -0.3);
  buildAncientRuinsCourtyard(parts, -145, floorY(-145, 122), 122, 0.4);
  buildBrickShellBarn(parts, -55, floorY(-55, 118), 118, -0.6);

  // SE Industrial Complex ("Setor Industrial")
  buildIndustrialHangar(parts, 96, floorY(96, 68), 68, -0.55);
  buildContainerPrecisionYard(parts, 138, floorY(138, 105), 105, 0.25);
  buildSilosAndCatwalk(parts, 82, floorY(82, 125), 125, 0.1);

  // NE Expanded Lake Bridge & Boathouse (water surface at y = -1.6)
  buildLakeTrussBridge(parts, 148, -1.6, -32, 0.2);
  buildAbandonedBoathouse(parts, 114, -1.6, -55, 0.72);

  // North Approach Concrete Tunnel Bunker
  buildConcreteBunkerTunnel(parts, 24, floorY(24, -175), -175, 0.15);

  const anchors: StructureAnchor[] = [
    { id: 'village', label: 'Vila Abandonada', x: -102, z: -68, radius: 42 },
    { id: 'ruins', label: 'Ruínas & Aqueduto', x: -115, z: 98, radius: 48 },
    { id: 'industrial', label: 'Hangar & Contêineres', x: 112, z: 90, radius: 48 },
    { id: 'bridge', label: 'Ponte sobre o Lago', x: 148, z: -32, radius: 46 },
    { id: 'bunker', label: 'Túnel Norte', x: 24, z: -175, radius: 22 },
  ];

  return { parts, anchors };
}

export interface TreeCollider {
  x: number;
  baseY: number;
  z: number;
  scale: number;
}

export const ROAD_SEGMENTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, -82, -48],   // Airfield -> Abandoned Village
  [0, 0, -95, 78],    // Airfield -> Aqueduct Ruins
  [0, 0, 96, 68],     // Airfield -> Industrial Hangar
  [96, 68, 138, 105], // Hangar -> Container Yard
  [0, 0, 114, -55],   // Airfield -> Lakeside Boathouse
];

export function distToSegment2D(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
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

export function isPointNearStructureBox2D(
  px: number,
  pz: number,
  box: BoxCollider,
  margin: number
): boolean {
  const dx = px - box.cx;
  const dz = pz - box.cz;
  const c = Math.cos(box.yaw);
  const s = Math.sin(box.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= box.hx + margin && Math.abs(lz) <= box.hz + margin;
}

export interface RockPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  idx: number;
}

/**
 * Generates deterministic decorative boulders across foothills & open terrain,
 * strictly excluding every structure bounding box (houses, barns, ruins, hangar, tunnel),
 * lakes, roads, helipads, towers, and wind turbines.
 */
export function buildWorldRocks(
  getGroundY: (x: number, z: number) => number,
  parts: readonly BoxCollider[],
  anchors: readonly StructureAnchor[],
  lakeArea: { x: number; z: number; waterRadius: number },
  elevatedPad: { x: number; z: number },
  radioTower: { x: number; z: number },
  windTurbines: ReadonlyArray<{ x: number; z: number }>
): RockPlacement[] {
  const rocks: RockPlacement[] = [];
  for (let i = 0; i < 140; i++) {
    const a = i * 1.93;
    const r = 64 + ((i * 31) % 260);
    const rx = Math.cos(a) * r;
    const rz = Math.sin(a) * r;
    const s = 0.7 + ((i * 11) % 14) * 0.14;
    const rockFootprint = 1.45 * s + 3.2;

    if (Math.hypot(rx - lakeArea.x, rz - lakeArea.z) < lakeArea.waterRadius + 4) continue;
    if (Math.hypot(rx - elevatedPad.x, rz - elevatedPad.z) < 10) continue;
    if (Math.hypot(rx - radioTower.x, rz - radioTower.z) < 9) continue;

    let blocked = false;
    for (const wt of windTurbines) {
      if (Math.hypot(rx - wt.x, rz - wt.z) < 8) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    for (const anc of anchors) {
      if (Math.hypot(rx - anc.x, rz - anc.z) < anc.radius) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    for (const box of parts) {
      if (isPointNearStructureBox2D(rx, rz, box, rockFootprint)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    for (const [ax, az, bx, bz] of ROAD_SEGMENTS) {
      if (distToSegment2D(rx, rz, ax, az, bx, bz) < 5.8) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const gy = getGroundY(rx, rz);
    if (gy < -0.5) continue;

    rocks.push({ x: rx, y: gy + 0.3, z: rz, scale: s, idx: i });
  }
  return rocks;
}

/**
 * Generates deterministic pine tree transforms & collision bounds synchronized
 * between Three.js instanced rendering and the physics engine.
 */
export function buildWorldTrees(
  getGroundY: (x: number, z: number) => number,
  lakeArea: { x: number; z: number; waterRadius: number },
  elevatedPad: { x: number; z: number },
  radioTower: { x: number; z: number },
  anchors: readonly StructureAnchor[],
  parts: readonly BoxCollider[] = []
): TreeCollider[] {
  const trees: TreeCollider[] = [];
  for (let i = 0; i < 420; i++) {
    const angle = i * 2.39996; // Golden angle distribution
    const radius = 52 + ((i * 29.3) % 278);
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;

    const lakeD = Math.hypot(tx - lakeArea.x, tz - lakeArea.z);
    const padD = Math.hypot(tx - elevatedPad.x, tz - elevatedPad.z);
    const towerD = Math.hypot(tx - radioTower.x, tz - radioTower.z);
    const gy = getGroundY(tx, tz);
    if (lakeD < lakeArea.waterRadius + 6 || padD < 12 || towerD < 11 || gy < -0.2) continue;

    let insideStructureZone = false;
    for (const anc of anchors) {
      if (Math.hypot(tx - anc.x, tz - anc.z) < anc.radius) {
        insideStructureZone = true;
        break;
      }
    }
    if (!insideStructureZone && parts.length > 0) {
      for (const box of parts) {
        if (isPointNearStructureBox2D(tx, tz, box, 4.5)) {
          insideStructureZone = true;
          break;
        }
      }
    }
    if (insideStructureZone) continue;

    let onRoad = false;
    for (const [ax, az, bx, bz] of ROAD_SEGMENTS) {
      if (distToSegment2D(tx, tz, ax, az, bx, bz) < 6.5) {
        onRoad = true;
        break;
      }
    }
    if (onRoad) continue;

    const scale = 0.85 + ((i * 7) % 35) / 100;
    trees.push({ x: tx, baseY: gy - 0.1, z: tz, scale });
  }
  return trees;
}
