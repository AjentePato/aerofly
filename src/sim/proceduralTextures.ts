import * as THREE from 'three';

export interface PbrTextureSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export interface WorldTextureBundle {
  terrain: {
    grass: PbrTextureSet;
    gravel: PbrTextureSet;
    rock: PbrTextureSet;
    shore: PbrTextureSet;
  };
  asphalt: PbrTextureSet;
  helipadMain: PbrTextureSet;
  helipadElevated: PbrTextureSet;
  pineBark: PbrTextureSet;
  pineBoughMap: THREE.CanvasTexture;
  pineBoughNormal: THREE.CanvasTexture;
  grassTuftMap: THREE.CanvasTexture;
  cloudMap: THREE.CanvasTexture;
  smokeMap: THREE.CanvasTexture;
  carbon: PbrTextureSet;
  gateChevronMap: THREE.CanvasTexture;
  structures: Record<
    | 'concrete_weathered'
    | 'brick_ruin'
    | 'plaster_ruin'
    | 'wood_aged'
    | 'stone_ancient'
    | 'steel_dark'
    | 'steel_rust'
    | 'container_blue'
    | 'container_red'
    | 'container_amber'
    | 'metal_roof',
    PbrTextureSet
  >;
  dispose: () => void;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Deterministic periodic 2D hash in [0, 1] wrapping at period P so generated textures tile seamlessly.
 */
function hash2Periodic(ix: number, iy: number, period: number, seed: number): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  const n = Math.sin(px * 127.1 + py * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Seamless periodic value noise in [0, 1] over normalized UV [0..1].
 */
function valueNoisePeriodic(u: number, v: number, freq: number, seed: number): number {
  const x = u * freq;
  const y = v * freq;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash2Periodic(ix, iy, freq, seed);
  const n10 = hash2Periodic(ix + 1, iy, freq, seed);
  const n01 = hash2Periodic(ix, iy + 1, freq, seed);
  const n11 = hash2Periodic(ix + 1, iy + 1, freq, seed);

  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

/**
 * Seamless periodic multi-octave fBM in [0, 1].
 */
function fbmPeriodic(u: number, v: number, baseFreq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoisePeriodic(u, v, freq, seed + o * 19.3);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Seamless periodic Voronoi cellular distance (f1, f2 - f1) for pebbles, stone blocks, and bark scales.
 */
function voronoiPeriodic(u: number, v: number, cells: number, seed: number): { f1: number; edge: number; cellId: number } {
  const gx = u * cells;
  const gy = v * cells;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);

  let minD1 = 99;
  let minD2 = 99;
  let bestId = 0;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox;
      const cy = iy + oy;
      const jx = 0.15 + 0.7 * hash2Periodic(cx, cy, cells, seed);
      const jy = 0.15 + 0.7 * hash2Periodic(cx, cy, cells, seed + 41.7);
      const dx = cx + jx - gx;
      const dy = cy + jy - gy;
      const d = Math.hypot(dx, dy);
      if (d < minD1) {
        minD2 = minD1;
        minD1 = d;
        bestId = hash2Periodic(cx, cy, cells, seed + 83.1);
      } else if (d < minD2) {
        minD2 = d;
      }
    }
  }

  return { f1: minD1, edge: minD2 - minD1, cellId: bestId };
}

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  return { canvas, ctx, img };
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAniso: number,
  repeatX = 1,
  repeatY = 1,
  clampEdge = false
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.wrapT = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates synchronized Albedo + Tangent-Space Normal + Roughness CanvasTextures from a single pixel evaluator.
 */
function buildPbrSet(
  size: number,
  maxAniso: number,
  normalStrength: number,
  repeatX: number,
  repeatY: number,
  samplePixel: (
    u: number,
    v: number,
    x: number,
    y: number
  ) => { r: number; g: number; b: number; height: number; roughness: number }
): PbrTextureSet {
  const albedo = makeCanvas(size);
  const rough = makeCanvas(size);
  const normal = makeCanvas(size);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      const p4 = idx * 4;
      const s = samplePixel(u, v, x, y);

      albedo.img.data[p4] = clampByte(s.r);
      albedo.img.data[p4 + 1] = clampByte(s.g);
      albedo.img.data[p4 + 2] = clampByte(s.b);
      albedo.img.data[p4 + 3] = 255;

      const rg = clampByte(s.roughness * 255);
      rough.img.data[p4] = rg;
      rough.img.data[p4 + 1] = rg;
      rough.img.data[p4 + 2] = rg;
      rough.img.data[p4 + 3] = 255;

      heights[idx] = s.height;
    }
  }

  // Central-difference Sobel normal generation (seamless periodic wrapping)
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const hL = heights[y * size + xm];
      const hR = heights[y * size + xp];
      const hU = heights[ym * size + x];
      const hD = heights[yp * size + x];

      const dx = (hL - hR) * normalStrength;
      const dy = (hU - hD) * normalStrength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const p4 = (y * size + x) * 4;
      normal.img.data[p4] = clampByte((dx * invLen * 0.5 + 0.5) * 255);
      normal.img.data[p4 + 1] = clampByte((dy * invLen * 0.5 + 0.5) * 255);
      normal.img.data[p4 + 2] = clampByte((dz * invLen * 0.5 + 0.5) * 255);
      normal.img.data[p4 + 3] = 255;
    }
  }

  albedo.ctx.putImageData(albedo.img, 0, 0);
  rough.ctx.putImageData(rough.img, 0, 0);
  normal.ctx.putImageData(normal.img, 0, 0);

  return {
    map: finalizeTexture(albedo.canvas, true, maxAniso, repeatX, repeatY),
    normalMap: finalizeTexture(normal.canvas, false, maxAniso, repeatX, repeatY),
    roughnessMap: finalizeTexture(rough.canvas, false, maxAniso, repeatX, repeatY),
  };
}

function createGrassPbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 3.2, 1, 1, (u, v) => {
    const macro = fbmPeriodic(u, v, 4, 4, 11.2);
    const blade = fbmPeriodic(u * 2.0, v * 0.5, 16, 3, 27.4);
    const micro = valueNoisePeriodic(u, v, 64, 53.1);
    const dryPatch = Math.max(0, macro - 0.54) * 2.1;

    const h = blade * 0.6 + micro * 0.4;
    const baseR = lerp(52, 86, blade) + dryPatch * 42 + micro * 10;
    const baseG = lerp(84, 122, blade) + dryPatch * 18 + micro * 12;
    const baseB = lerp(34, 52, macro) + dryPatch * 10;

    return {
      r: baseR * (0.85 + 0.25 * macro),
      g: baseG * (0.85 + 0.25 * macro),
      b: baseB * (0.85 + 0.25 * macro),
      height: h,
      roughness: 0.84 + (1 - blade) * 0.12,
    };
  });
}

function createGravelPbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 4.6, 1, 1, (u, v) => {
    const vor = voronoiPeriodic(u, v, 18, 71.3);
    const soil = fbmPeriodic(u, v, 6, 4, 15.8);
    const grit = valueNoisePeriodic(u, v, 48, 91.2);
    const pebble = Math.max(0, 1 - vor.f1 * 1.9);
    const tint = lerp(0.84, 1.15, vor.cellId);
    const h = soil * 0.45 + pebble * 0.42 + grit * 0.13;

    return {
      r: (116 * (0.75 + 0.3 * soil) + pebble * 32) * tint,
      g: (106 * (0.75 + 0.3 * soil) + pebble * 28) * tint,
      b: (88 * (0.75 + 0.3 * soil) + pebble * 22) * tint,
      height: h,
      roughness: 0.89 + (1 - pebble) * 0.09,
    };
  });
}

function createRockPbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 6.2, 1, 1, (u, v) => {
    const strata = fbmPeriodic(u * 0.5, v * 2.2, 6, 4, 33.9);
    const cracks = voronoiPeriodic(u, v, 7, 44.1);
    const mineral = fbmPeriodic(u, v, 14, 3, 62.5);
    const crevice = Math.min(1, cracks.edge * 4.5);
    const h = (strata * 0.55 + mineral * 0.45) * (0.4 + 0.6 * crevice);

    const shade = (0.58 + 0.42 * crevice) * (0.76 + 0.42 * strata);
    return {
      r: (96 + mineral * 24) * shade,
      g: (98 + mineral * 22) * shade,
      b: (102 + mineral * 20) * shade,
      height: h,
      roughness: 0.84 + (1 - crevice) * 0.14,
    };
  });
}

function createShorePbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 4.4, 1, 1, (u, v) => {
    const silt = fbmPeriodic(u, v, 6, 4, 102.1);
    const pebbles = voronoiPeriodic(u, v, 14, 118.4);
    const stone = Math.max(0, 1 - pebbles.f1 * 1.85);
    const h = silt * 0.45 + stone * 0.55;
    const tone = lerp(0.8, 1.12, pebbles.cellId);

    return {
      r: (102 * silt + stone * 38) * tone,
      g: (94 * silt + stone * 34) * tone,
      b: (78 * silt + stone * 28) * tone,
      height: h,
      roughness: 0.89 + silt * 0.08,
    };
  });
}

function createAsphaltPbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(512, maxAniso, 3.4, 1.2, 8.5, (u, v) => {
    const agg = valueNoisePeriodic(u, v, 96, 12.7);
    const patch = fbmPeriodic(u, v, 5, 4, 24.3);
    const crackVor = voronoiPeriodic(u, v, 4, 88.2);
    const isCrack = crackVor.edge < 0.02 ? 1 - crackVor.edge / 0.02 : 0;
    const centerDist = Math.abs(u - 0.5) * 2;
    const tireWear = Math.exp(-centerDist * centerDist * 9) * 0.2;

    const h = agg * 0.65 + patch * 0.35 - isCrack * 0.55;
    const base = (26 + agg * 14 + patch * 9) * (1 - isCrack * 0.55 - tireWear);

    return {
      r: base,
      g: base + 1,
      b: base + 3,
      height: h,
      roughness: 0.78 + agg * 0.14 - tireWear * 0.22,
    };
  });
}

function createHelipadPbr(label: string, accentHex: string, maxAniso: number): PbrTextureSet {
  const size = 512;
  const albedo = makeCanvas(size);
  const rough = makeCanvas(size);
  const normal = makeCanvas(size);
  const heights = new Float32Array(size * size);

  // Pass 1: Realistic poured concrete apron slab base with expansion joints
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      const p4 = idx * 4;

      const grain = fbmPeriodic(u, v, 12, 4, 41.2);
      const micro = valueNoisePeriodic(u, v, 64, 9.4);
      const stain = fbmPeriodic(u, v, 3, 3, 73.1);

      // Concrete slab expansion joints in 4x4 grid
      const gx = (u * 4) % 1;
      const gy = (v * 4) % 1;
      const joint = gx < 0.012 || gx > 0.988 || gy < 0.012 || gy > 0.988 ? 1 : 0;

      // Subtle skid scuffs around center landing circle
      const dCenter = Math.hypot(u - 0.5, v - 0.5);
      const tireRing = Math.exp(-Math.pow((dCenter - 0.19) * 18, 2)) * 0.14;

      const h = grain * 0.55 + micro * 0.45 - joint * 0.65;
      heights[idx] = h;

      const base = (54 + grain * 20 + micro * 10) * (0.84 + 0.22 * stain) * (1 - joint * 0.45 - tireRing);
      albedo.img.data[p4] = clampByte(base);
      albedo.img.data[p4 + 1] = clampByte(base + 2);
      albedo.img.data[p4 + 2] = clampByte(base + 5);
      albedo.img.data[p4 + 3] = 255;

      const rg = clampByte((0.8 + (1 - micro) * 0.14 + joint * 0.08) * 255);
      rough.img.data[p4] = rg;
      rough.img.data[p4 + 1] = rg;
      rough.img.data[p4 + 2] = rg;
      rough.img.data[p4 + 3] = 255;
    }
  }

  albedo.ctx.putImageData(albedo.img, 0, 0);
  rough.ctx.putImageData(rough.img, 0, 0);

  // Pass 2: Paint crisp aviation markings onto albedo & lower roughness on painted stripes
  const ctx = albedo.ctx;
  const rCtx = rough.ctx;

  const paintGlow = (fn: (c: CanvasRenderingContext2D) => void) => {
    ctx.save();
    ctx.globalAlpha = 0.9;
    fn(ctx);
    ctx.restore();

    // Painted concrete is slightly smoother than bare weathered concrete
    rCtx.save();
    rCtx.globalAlpha = 0.65;
    fn(rCtx);
    rCtx.restore();
  };

  // Outer warning safety ring
  paintGlow((c) => {
    c.strokeStyle = c === rCtx ? '#8a8a8a' : accentHex;
    c.lineWidth = 18;
    c.beginPath();
    c.arc(256, 256, 212, 0, Math.PI * 2);
    c.stroke();
  });

  // Dashed inner aiming ring
  paintGlow((c) => {
    c.strokeStyle = c === rCtx ? '#9a9a9a' : '#e2e8f0';
    c.lineWidth = 7;
    c.setLineDash([24, 16]);
    c.beginPath();
    c.arc(256, 256, 166, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  });

  // Stenciled H emblem
  paintGlow((c) => {
    c.fillStyle = c === rCtx ? '#969696' : '#f1f5f9';
    c.fillRect(182, 156, 30, 200);
    c.fillRect(300, 156, 30, 200);
    c.fillRect(182, 240, 148, 32);
  });

  // Aviation stencil label
  paintGlow((c) => {
    c.fillStyle = c === rCtx ? '#909090' : accentHex;
    c.font = 'bold 26px "Chakra Petch", sans-serif';
    c.textAlign = 'center';
    c.fillText(label, 256, 444);
  });

  // Subtle weathered concrete chipping over paint so it doesn't look flat vector
  const paintedImg = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const chip = heights[i];
    if (chip < 0.28) {
      const p4 = i * 4;
      const wear = (0.28 - chip) * 1.1;
      paintedImg.data[p4] = clampByte(lerp(paintedImg.data[p4], 90, wear));
      paintedImg.data[p4 + 1] = clampByte(lerp(paintedImg.data[p4 + 1], 93, wear));
      paintedImg.data[p4 + 2] = clampByte(lerp(paintedImg.data[p4 + 2], 97, wear));
    }
  }
  ctx.putImageData(paintedImg, 0, 0);

  // Normal map from concrete slab heightfield
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heights[y * size + xm] - heights[y * size + xp]) * 3.2;
      const dy = (heights[ym * size + x] - heights[yp * size + x]) * 3.2;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);
      const p4 = (y * size + x) * 4;
      normal.img.data[p4] = clampByte((dx * invLen * 0.5 + 0.5) * 255);
      normal.img.data[p4 + 1] = clampByte((dy * invLen * 0.5 + 0.5) * 255);
      normal.img.data[p4 + 2] = clampByte((dz * invLen * 0.5 + 0.5) * 255);
      normal.img.data[p4 + 3] = 255;
    }
  }
  normal.ctx.putImageData(normal.img, 0, 0);

  return {
    map: finalizeTexture(albedo.canvas, true, maxAniso, 1, 1, true),
    normalMap: finalizeTexture(normal.canvas, false, maxAniso, 1, 1, true),
    roughnessMap: finalizeTexture(rough.canvas, false, maxAniso, 1, 1, true),
  };
}

function createConcreteWeatheredPbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 3.6, 1, 1, (u, v) => {
    const grain = fbmPeriodic(u, v, 8, 4, 21.1);
    const streak = fbmPeriodic(u * 3.0, v * 0.5, 6, 3, 51.7);
    const micro = valueNoisePeriodic(u, v, 48, 84.3);
    const panelX = (u * 2) % 1;
    const panelY = (v * 2) % 1;
    const seam = panelX < 0.016 || panelY < 0.016 ? 1 : 0;

    // Formwork tie holes
    const tx = ((u * 2) % 1) - 0.5;
    const ty = ((v * 2) % 1) - 0.5;
    const tieHole = Math.hypot(Math.abs(tx) - 0.28, Math.abs(ty) - 0.28) < 0.035 ? 1 : 0;

    const h = grain * 0.55 + micro * 0.45 - seam * 0.45 - tieHole * 0.55;
    const dirt = 0.78 + 0.26 * streak;
    const base = (122 + grain * 30 + micro * 12) * dirt * (1 - seam * 0.35 - tieHole * 0.45);

    return {
      r: base,
      g: base + 2,
      b: base + 4,
      height: h,
      roughness: 0.8 + (1 - grain) * 0.14 + seam * 0.08,
    };
  });
}

function createBrickRuinPbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 5.2, 1, 1, (u, v) => {
    const rows = 8;
    const cols = 4;
    const row = Math.floor(v * rows);
    const rowV = (v * rows) % 1;
    const shiftedU = (u * cols + (row % 2) * 0.5) % cols;
    const col = Math.floor(shiftedU);
    const colU = shiftedU % 1;

    const mortar = rowV < 0.11 || colU < 0.065 ? 1 : 0;
    const brickNoise = fbmPeriodic(u, v, 10, 3, 19.4);
    const micro = valueNoisePeriodic(u, v, 56, 37.9);
    const brickId = hash2Periodic(col, row, cols * 2, 13.7);
    const soot = fbmPeriodic(u, v, 3, 3, 66.2);

    const h = mortar ? 0.15 + micro * 0.1 : 0.65 + brickNoise * 0.25 + micro * 0.1;
    if (mortar > 0) {
      const mTone = (146 + micro * 22) * (0.78 + 0.25 * soot);
      return { r: mTone, g: mTone - 4, b: mTone - 12, height: h, roughness: 0.94 };
    }

    const r = lerp(128, 174, brickId) * (0.76 + 0.3 * brickNoise) * (0.74 + 0.28 * soot);
    const g = lerp(62, 92, brickId) * (0.76 + 0.3 * brickNoise) * (0.74 + 0.28 * soot);
    const b = lerp(44, 66, brickId) * (0.76 + 0.3 * brickNoise) * (0.74 + 0.28 * soot);
    return { r, g, b, height: h, roughness: 0.84 + (1 - brickNoise) * 0.12 };
  });
}

function createWoodAgedPbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 4.4, 1, 1, (u, v) => {
    const planks = 6;
    const plankId = Math.floor(v * planks);
    const plankV = (v * planks) % 1;
    const gap = plankV < 0.055 ? 1 : 0;
    const idSeed = hash2Periodic(plankId, 0, planks, 48.2);
    const grain = fbmPeriodic(u * 0.5, v * 10, 6, 4, 17.3 + plankId * 3.1);
    const ring = 0.5 + 0.5 * Math.sin((plankV * 14 + grain * 4.5) * Math.PI);

    const h = gap ? 0.1 : 0.55 + ring * 0.25 + grain * 0.2;
    const shade = (0.72 + 0.32 * idSeed) * (0.75 + 0.25 * ring) * (gap ? 0.35 : 1);
    return {
      r: 118 * shade,
      g: 88 * shade,
      b: 62 * shade,
      height: h,
      roughness: 0.78 + (1 - ring) * 0.16,
    };
  });
}

function createStoneAncientPbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 5.8, 1, 1, (u, v) => {
    const rows = 5;
    const row = Math.floor(v * rows);
    const rowV = (v * rows) % 1;
    const cols = 3;
    const shiftedU = (u * cols + (row % 2) * 0.48) % cols;
    const col = Math.floor(shiftedU);
    const colU = shiftedU % 1;

    const joint = rowV < 0.08 || colU < 0.05 ? 1 : 0;
    const pit = fbmPeriodic(u, v, 10, 4, 91.5);
    const lichen = Math.max(0, fbmPeriodic(u, v, 4, 3, 12.8) - 0.58) * 2.2;
    const idTone = lerp(0.84, 1.14, hash2Periodic(col, row, cols * 2, 7.1));

    const h = joint ? 0.18 : 0.55 + pit * 0.45;
    const base = (146 * pit + 32) * idTone * (joint ? 0.58 : 1);
    return {
      r: base - lichen * 18,
      g: base + 2 + lichen * 8,
      b: base - 10 - lichen * 24,
      height: h,
      roughness: 0.86 + (1 - pit) * 0.12,
    };
  });
}

function createPlasterRuinPbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 4.4, 1, 1, (u, v) => {
    const spallField = fbmPeriodic(u, v, 3, 4, 29.3);
    const trowel = fbmPeriodic(u, v, 10, 3, 47.6);
    const micro = valueNoisePeriodic(u, v, 48, 72.1);
    const rainStreak = fbmPeriodic(u * 2.8, v * 0.45, 5, 3, 88.4);
    const crackVor = voronoiPeriodic(u, v, 5, 19.2);
    const crack = crackVor.edge < 0.022 ? 1 - crackVor.edge / 0.022 : 0;

    // Spalled patches reveal recessed warm sandstone/fieldstone masonry underneath peeling stucco
    const spallRaw = (spallField - 0.56) * 14.0;
    const spallMask = spallRaw <= 0 ? 0 : spallRaw >= 1 ? 1 : spallRaw * spallRaw * (3 - 2 * spallRaw);
    const edgeLip = spallMask > 0.04 && spallMask < 0.88 ? Math.sin(spallMask * Math.PI) : 0;

    const rubble = voronoiPeriodic(u, v, 9, 63.7);
    const mortarGap = rubble.edge < 0.065 ? 1 : 0;
    const rubbleShade = lerp(0.84, 1.14, rubble.cellId) * (mortarGap ? 0.64 : 1.0);

    const plasterShade = (0.82 + 0.22 * trowel + 0.08 * micro) * (0.78 + 0.24 * rainStreak) * (1 - crack * 0.38);
    const pR = 194 * plasterShade;
    const pG = 175 * plasterShade;
    const pB = 141 * plasterShade;

    const stoneBase = (132 + micro * 22) * rubbleShade;
    const sR = stoneBase * 1.06;
    const sG = stoneBase * 0.94;
    const sB = stoneBase * 0.78;

    const hPlaster = 0.76 + trowel * 0.14 + micro * 0.08 - crack * 0.35;
    const hStone = mortarGap ? 0.16 + micro * 0.08 : 0.38 + (1 - rubble.f1) * 0.18 + micro * 0.08;
    const h = lerp(hPlaster, hStone, spallMask);

    return {
      r: lerp(pR, sR, spallMask) * (1 - edgeLip * 0.24),
      g: lerp(pG, sG, spallMask) * (1 - edgeLip * 0.26),
      b: lerp(pB, sB, spallMask) * (1 - edgeLip * 0.28),
      height: h,
      roughness: lerp(0.88 + (1 - trowel) * 0.08, 0.94, spallMask),
    };
  });
}

function createSteelPbr(maxAniso: number, baseRgb: [number, number, number], rusty: boolean): PbrTextureSet {
  return buildPbrSet(256, maxAniso, rusty ? 4.4 : 2.6, 1, 1, (u, v) => {
    const brushed = fbmPeriodic(u * 4, v * 0.6, 8, 3, 55.2);
    const patina = fbmPeriodic(u, v, 5, 4, 31.8);
    const rustMask = rusty ? Math.min(1, Math.max(0, (patina - 0.34) * 2.2)) : Math.max(0, (patina - 0.72) * 1.4);

    const h = brushed * 0.5 + patina * 0.5 - rustMask * 0.25;
    const r = lerp(baseRgb[0] * (0.82 + 0.3 * brushed), 142, rustMask);
    const g = lerp(baseRgb[1] * (0.82 + 0.3 * brushed), 68, rustMask);
    const b = lerp(baseRgb[2] * (0.82 + 0.3 * brushed), 42, rustMask);

    return {
      r,
      g,
      b,
      height: h,
      roughness: lerp(rusty ? 0.44 : 0.36, 0.88, rustMask),
    };
  });
}

function createCorrugatedContainerPbr(
  maxAniso: number,
  paintRgb: [number, number, number],
  hasStencil: boolean
): PbrTextureSet {
  const size = 256;
  const set = buildPbrSet(size, maxAniso, 6.5, 1, 1, (u, v) => {
    // Classic trapezoidal ISO shipping container corrugation ribs
    const phase = (u * 12) % 1;
    const rib = phase < 0.25 ? phase * 4 : phase < 0.5 ? 1 : phase < 0.75 ? 1 - (phase - 0.5) * 4 : 0;
    const paintWear = fbmPeriodic(u, v, 5, 4, 77.4);
    const scratch = valueNoisePeriodic(u * 2, v * 8, 12, 19.8);
    const edgeRust = v < 0.06 || v > 0.94 ? 0.45 : Math.max(0, (paintWear - 0.68) * 2.5);

    const h = rib * 0.82 + paintWear * 0.18;
    const ao = 0.74 + 0.26 * rib;
    const r = lerp(paintRgb[0] * ao, 122, edgeRust * 0.75) * (0.86 + 0.2 * scratch);
    const g = lerp(paintRgb[1] * ao, 62, edgeRust * 0.75) * (0.86 + 0.2 * scratch);
    const b = lerp(paintRgb[2] * ao, 44, edgeRust * 0.75) * (0.86 + 0.2 * scratch);

    return {
      r,
      g,
      b,
      height: h,
      roughness: lerp(0.38, 0.84, edgeRust),
    };
  });

  if (hasStencil) {
    const ctx = (set.map.image as HTMLCanvasElement).getContext('2d')!;
    ctx.save();
    ctx.fillStyle = 'rgba(241, 245, 249, 0.62)';
    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.fillText('AERO-40G1', 26, 54);
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText('MAX 30.4T', 26, 70);
    ctx.restore();
    set.map.needsUpdate = true;
  }

  return set;
}

function createMetalRoofPbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 5.4, 1, 1, (u, v) => {
    const wave = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 16);
    const patina = fbmPeriodic(u, v, 6, 4, 43.2);
    const rust = Math.max(0, (patina - 0.6) * 1.9);
    const h = wave * 0.75 + patina * 0.25;
    const shade = 0.76 + 0.28 * wave;

    return {
      r: lerp(96 * shade, 128, rust),
      g: lerp(104 * shade, 72, rust),
      b: lerp(114 * shade, 48, rust),
      height: h,
      roughness: lerp(0.42, 0.85, rust),
    };
  });
}

function createPineBarkPbr(maxAniso: number): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 5.8, 1, 2, (u, v) => {
    const furrow = fbmPeriodic(u * 2.5, v * 0.45, 8, 4, 14.4);
    const plate = voronoiPeriodic(u * 2, v * 0.5, 6, 61.9);
    const crack = Math.min(1, plate.edge * 4.0);
    const h = furrow * 0.5 + crack * 0.5;
    const tone = (0.45 + 0.55 * crack) * (0.75 + 0.35 * furrow);

    return {
      r: 92 * tone,
      g: 64 * tone,
      b: 46 * tone,
      height: h,
      roughness: 0.92,
    };
  });
}

function createPineBoughTextures(maxAniso: number): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext('2d')!;

  const normCanvas = document.createElement('canvas');
  normCanvas.width = size;
  normCanvas.height = size;
  const nCtx = normCanvas.getContext('2d')!;

  // Transparent background
  ctx.clearRect(0, 0, size, size);
  nCtx.fillStyle = 'rgb(128,128,255)';
  nCtx.fillRect(0, 0, size, size);

  // Helper draws both rich evergreen needles and directional tangent normals
  const drawNeedle = (x1: number, y1: number, x2: number, y2: number, width: number, col: string, nx: number, ny: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    nCtx.strokeStyle = `rgb(${clampByte(128 + nx * 90)},${clampByte(128 + ny * 90)},235)`;
    nCtx.lineWidth = width;
    nCtx.lineCap = 'round';
    nCtx.beginPath();
    nCtx.moveTo(x1, y1);
    nCtx.lineTo(x2, y2);
    nCtx.stroke();
  };

  // Draw central woody branch spine + 5 lateral sub-twigs
  const drawBranchlet = (sx: number, sy: number, angle: number, length: number, needles: number) => {
    const ex = sx + Math.cos(angle) * length;
    const ey = sy + Math.sin(angle) * length;

    for (let i = 0; i < needles; i++) {
      const t = i / needles;
      const bx = lerp(sx, ex, t);
      const by = lerp(sy, ey, t);
      const nLen = (16 + ((i * 7) % 10)) * (1 - t * 0.42);

      for (const side of [-1, 1]) {
        const na = angle + side * (0.58 + ((i * 13) % 10) * 0.03);
        const nx = Math.cos(na);
        const ny = Math.sin(na);
        // Darker needles inside, bright sunlit conifer green toward tips
        const shade = t > 0.6 ? '#3f6a34' : t > 0.3 ? '#2d5226' : '#1f3b1b';
        drawNeedle(bx, by, bx + nx * nLen, by + ny * nLen, 2.6, shade, nx * 0.6, ny * 0.6);

        if (i % 2 === 0) {
          const tipCol = '#4f7d3e';
          drawNeedle(
            bx + nx * nLen * 0.45,
            by + ny * nLen * 0.45,
            bx + nx * (nLen + 4),
            by + ny * (nLen + 4),
            1.6,
            tipCol,
            nx,
            ny
          );
        }
      }
    }

    // Inner woody twig
    drawNeedle(sx, sy, ex, ey, 3.2, '#4a3525', 0, -0.4);
  };

  // Main spine from bottom-center (128, 246) upward to apex (128, 18)
  drawBranchlet(128, 246, -Math.PI / 2, 210, 42);
  // Lateral fanned sub-branches for thick natural pine bough silhouette
  const subBranches: Array<[number, number, number, number]> = [
    [128, 214, -Math.PI / 2 - 0.72, 108],
    [128, 214, -Math.PI / 2 + 0.72, 108],
    [128, 174, -Math.PI / 2 - 0.64, 96],
    [128, 174, -Math.PI / 2 + 0.64, 96],
    [128, 134, -Math.PI / 2 - 0.56, 82],
    [128, 134, -Math.PI / 2 + 0.56, 82],
    [128, 92, -Math.PI / 2 - 0.46, 62],
    [128, 92, -Math.PI / 2 + 0.46, 62],
    [128, 56, -Math.PI / 2 - 0.34, 40],
    [128, 56, -Math.PI / 2 + 0.34, 40],
  ];
  for (const [bx, by, ba, bl] of subBranches) {
    drawBranchlet(bx, by, ba, bl, 22);
  }

  return {
    map: finalizeTexture(albedoCanvas, true, maxAniso, 1, 1, true),
    normalMap: finalizeTexture(normCanvas, false, maxAniso, 1, 1, true),
  };
}

function createGrassTuftTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  // Organic varied-height arched sedge/reed blades (thin tapered tips, wide natural spray)
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const baseX = 36 + t * 56;
    const spread = (t - 0.5) * 86;
    const tipX = 64 + spread + Math.sin(i * 3.7) * 10;
    const tipY = 18 + Math.abs(t - 0.5) * 46 + ((i * 7) % 18);
    const grad = ctx.createLinearGradient(baseX, 128, tipX, tipY);
    grad.addColorStop(0, '#23331b');
    grad.addColorStop(0.5, i % 3 === 0 ? '#4e6830' : '#355023');
    grad.addColorStop(1, i % 4 === 0 ? '#9c924b' : '#5f7a38');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.6 - Math.abs(t - 0.5) * 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(baseX, 128);
    ctx.quadraticCurveTo(baseX + spread * 0.38, 76, tipX, tipY);
    ctx.stroke();
  }

  return finalizeTexture(canvas, true, maxAniso, 1, 1, true);
}

function createCloudLayerTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx, img } = makeCanvas(size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const base = fbmPeriodic(u, v, 3, 5, 19.7);
      const detail = fbmPeriodic(u, v, 9, 3, 64.1);
      const density = Math.max(0, (base * 0.7 + detail * 0.3 - 0.43) * 2.5);
      const alpha = clampByte(Math.min(1, density) * 242);
      const lit = clampByte(lerp(218, 255, Math.min(1, detail * 0.8 + base * 0.4)));
      const p4 = (y * size + x) * 4;
      img.data[p4] = lit;
      img.data[p4 + 1] = lit;
      img.data[p4 + 2] = Math.min(255, lit + 4);
      img.data[p4 + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTexture(canvas, true, maxAniso, 2, 2);
}

export function createSmokeSpriteTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx, img } = makeCanvas(size);

  for (let y = 0; y < size; y++) {
    const ny = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      const dist = Math.hypot(nx, ny);
      const wisp = fbmPeriodic(x / size, y / size, 4, 4, 83.4);
      const radial = Math.max(0, 1 - dist);
      const alpha = Math.pow(radial, 1.5) * (0.45 + 0.55 * wisp);
      const shade = clampByte(lerp(130, 215, wisp * radial + 0.25));
      const p4 = (y * size + x) * 4;
      img.data[p4] = shade;
      img.data[p4 + 1] = shade + 2;
      img.data[p4 + 2] = shade + 6;
      img.data[p4 + 3] = clampByte(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTexture(canvas, true, 1, 1, 1, true);
}

export function createCarbonWeavePbr(maxAniso: number, repeat = 6): PbrTextureSet {
  return buildPbrSet(256, maxAniso, 1.35, repeat, repeat, (_u, _v, x, y) => {
    const cell = 6;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    // Authentic 2x2 twill diagonal step pattern
    const diag = ((cx + cy) % 4) < 2;
    const lx = (x % cell) / cell;
    const ly = (y % cell) / cell;
    const fiber = diag ? Math.sin(lx * Math.PI) : Math.sin(ly * Math.PI);
    const h = 0.42 + fiber * 0.48;
    const lum = (diag ? 26 : 19) + fiber * 9;
    return {
      r: lum,
      g: lum + 1,
      b: lum + 3,
      height: h,
      roughness: diag ? 0.26 : 0.42,
    };
  });
}

export function createPropBlurTexture(tintRgb: [number, number, number], tipRgb: [number, number, number], maxAniso: number): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx, img } = makeCanvas(size);
  const half = size * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.hypot(dx, dy);
      const p4 = (y * size + x) * 4;
      if (r > 1.0) {
        img.data[p4 + 3] = 0;
        continue;
      }
      const ang = Math.atan2(dy, dx);
      // Subtle swept rotor motion streaks (2 opposite blur lobes)
      const streak = 0.65 + 0.35 * Math.cos(ang * 2.0);
      const tipMask = r > 0.86 && r < 0.96 ? (1 - Math.abs(r - 0.91) / 0.05) : 0;
      const bodyFade = r < 0.14 ? r / 0.14 : Math.max(0, 1 - Math.pow(r, 4));
      const alpha = Math.min(1, (0.26 * streak * bodyFade + tipMask * 0.36));

      img.data[p4] = clampByte(lerp(tintRgb[0], tipRgb[0], tipMask));
      img.data[p4 + 1] = clampByte(lerp(tintRgb[1], tipRgb[1], tipMask));
      img.data[p4 + 2] = clampByte(lerp(tintRgb[2], tipRgb[2], tipMask));
      img.data[p4 + 3] = clampByte(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTexture(canvas, true, maxAniso, 1, 1, true);
}

function createGateChevronTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 64);

  // Aviation safety chevrons along the ring circumference
  ctx.fillStyle = '#f8fafc';
  for (let x = -32; x < 288; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 16, 0);
    ctx.lineTo(x + 32, 64);
    ctx.lineTo(x + 16, 64);
    ctx.closePath();
    ctx.fill();
  }

  return finalizeTexture(canvas, true, maxAniso, 8, 1);
}

function disposePbrSet(set: PbrTextureSet) {
  set.map.dispose();
  set.normalMap.dispose();
  set.roughnessMap.dispose();
}

export function createWorldTextureBundle(maxAniso: number): WorldTextureBundle {
  const terrain = {
    grass: createGrassPbr(maxAniso),
    gravel: createGravelPbr(maxAniso),
    rock: createRockPbr(maxAniso),
    shore: createShorePbr(maxAniso),
  };

  const asphalt = createAsphaltPbr(maxAniso);
  const helipadMain = createHelipadPbr('DECOLAGEM', '#f59e0b', maxAniso);
  const helipadElevated = createHelipadPbr('ALVO B', '#38bdf8', maxAniso);
  const pineBark = createPineBarkPbr(maxAniso);
  const bough = createPineBoughTextures(maxAniso);
  const grassTuftMap = createGrassTuftTexture(maxAniso);
  const cloudMap = createCloudLayerTexture(maxAniso);
  const smokeMap = createSmokeSpriteTexture();
  const carbon = createCarbonWeavePbr(maxAniso, 4);
  const gateChevronMap = createGateChevronTexture(maxAniso);

  const structures = {
    concrete_weathered: createConcreteWeatheredPbr(maxAniso),
    brick_ruin: createBrickRuinPbr(maxAniso),
    plaster_ruin: createPlasterRuinPbr(maxAniso),
    wood_aged: createWoodAgedPbr(maxAniso),
    stone_ancient: createStoneAncientPbr(maxAniso),
    steel_dark: createSteelPbr(maxAniso, [56, 65, 78], false),
    steel_rust: createSteelPbr(maxAniso, [106, 64, 48], true),
    container_blue: createCorrugatedContainerPbr(maxAniso, [36, 86, 168], true),
    container_red: createCorrugatedContainerPbr(maxAniso, [158, 38, 38], true),
    container_amber: createCorrugatedContainerPbr(maxAniso, [196, 114, 24], false),
    metal_roof: createMetalRoofPbr(maxAniso),
  };

  return {
    terrain,
    asphalt,
    helipadMain,
    helipadElevated,
    pineBark,
    pineBoughMap: bough.map,
    pineBoughNormal: bough.normalMap,
    grassTuftMap,
    cloudMap,
    smokeMap,
    carbon,
    gateChevronMap,
    structures,
    dispose: () => {
      disposePbrSet(terrain.grass);
      disposePbrSet(terrain.gravel);
      disposePbrSet(terrain.rock);
      disposePbrSet(terrain.shore);
      disposePbrSet(asphalt);
      disposePbrSet(helipadMain);
      disposePbrSet(helipadElevated);
      disposePbrSet(pineBark);
      bough.map.dispose();
      bough.normalMap.dispose();
      grassTuftMap.dispose();
      cloudMap.dispose();
      smokeMap.dispose();
      disposePbrSet(carbon);
      gateChevronMap.dispose();
      Object.values(structures).forEach(disposePbrSet);
    },
  };
}
