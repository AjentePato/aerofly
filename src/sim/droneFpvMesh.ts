import * as THREE from 'three';
import { createCarbonWeavePbr, createPropBlurTexture } from './proceduralTextures';
import type { DroneRig } from './droneMesh';
import type { GraphicsMode } from './types';

interface DisposableEntry {
  dispose: () => void;
}

function createLipoWrapTexture(maxAnisotropy: number, disposables: DisposableEntry[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 256, 128);
  grad.addColorStop(0, '#f59e0b');
  grad.addColorStop(0.5, '#fbbf24');
  grad.addColorStop(1, '#ea580c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = '#181b20';
  ctx.fillRect(36, 34, 184, 60);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 22px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('4S 1500mAh', 128, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  disposables.push(tex);
  return tex;
}

function createCyanBlurDiscTexture(maxAnisotropy: number, disposables: DisposableEntry[]): THREE.CanvasTexture {
  const tex = createPropBlurTexture([42, 175, 240], [125, 211, 252], maxAnisotropy);
  disposables.push(tex);
  return tex;
}

/**
 * Builds a swept 5-inch freestyle airfoil blade spanning x = 0..0.168m.
 */
function createFpvSweptBladeGeometry(): THREE.ExtrudeGeometry {
  const len = 0.168;
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.008);
  shape.bezierCurveTo(0.036, -0.022, 0.108, -0.02, len, -0.007);
  shape.lineTo(len, 0.009);
  shape.bezierCurveTo(0.112, 0.022, 0.038, 0.02, 0, 0.008);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0032,
    bevelEnabled: false,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function createFpvFreestyleDroneMesh(
  maxAnisotropy: number,
  createContactShadow: (disposables: DisposableEntry[]) => THREE.Mesh,
  graphicsMode: GraphicsMode = 'realistic'
): DroneRig {
  const isLowPoly = graphicsMode === 'low_poly';
  const disposables: DisposableEntry[] = [];
  const root = new THREE.Group();

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const lipoTex = createLipoWrapTexture(maxAnisotropy, disposables);
  const blurTex = createCyanBlurDiscTexture(maxAnisotropy, disposables);

  let carbonMat: THREE.MeshStandardMaterial;
  let purpleAnodMat: THREE.Material;
  let redMotorMat: THREE.Material;
  let chromeMat: THREE.Material;
  let cyanPropMat: THREE.Material;
  let lensGlassMat: THREE.Material;

  if (isLowPoly) {
    carbonMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x222731, roughness: 0.78, metalness: 0.2, flatShading: true })
    );
    purpleAnodMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x9333ea, roughness: 0.38, metalness: 0.55, flatShading: true })
    );
    redMotorMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.38, metalness: 0.55, flatShading: true })
    );
    chromeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.35, metalness: 0.7, flatShading: true })
    );
    cyanPropMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.38,
        metalness: 0.08,
        transparent: true,
        opacity: 0.9,
        flatShading: true,
      })
    );
    lensGlassMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.35, flatShading: true })
    );
  } else {
    const carbonPbr = createCarbonWeavePbr(maxAnisotropy, 6);
    disposables.push(carbonPbr.map, carbonPbr.normalMap, carbonPbr.roughnessMap);

    carbonMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: carbonPbr.map,
        normalMap: carbonPbr.normalMap,
        roughnessMap: carbonPbr.roughnessMap,
        roughness: 0.9,
        metalness: 0.22,
      })
    );
    purpleAnodMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x9333ea,
        roughness: 0.22,
        metalness: 0.86,
        anisotropy: 0.55,
      })
    );
    redMotorMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xdc2626,
        roughness: 0.22,
        metalness: 0.86,
        anisotropy: 0.65,
      })
    );
    chromeMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xd1d5db,
        roughness: 0.2,
        metalness: 0.92,
        anisotropy: 0.7,
      })
    );
    cyanPropMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        roughness: 0.22,
        metalness: 0.08,
        transparent: true,
        opacity: 0.9,
        clearcoat: 0.65,
        clearcoatRoughness: 0.18,
      })
    );
    lensGlassMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x061320,
        roughness: 0.04,
        metalness: 0.16,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        iridescence: 0.85,
        iridescenceIOR: 1.38,
      })
    );
  }

  const matteBlackMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x171a20,
      roughness: 0.68,
      metalness: 0.08,
      flatShading: isLowPoly,
    })
  );

  const copperCoilMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc27038,
      roughness: 0.33,
      metalness: 0.86,
      flatShading: isLowPoly,
    })
  );

  const orangeCamMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xea580c,
      roughness: 0.38,
      metalness: 0.2,
      flatShading: isLowPoly,
    })
  );

  const tpuBrownOrangeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc25a24,
      roughness: 0.6,
      metalness: 0.04,
      flatShading: isLowPoly,
    })
  );

  const yellowStrapMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.78,
      metalness: 0.04,
      flatShading: isLowPoly,
    })
  );

  const lipoMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: isLowPoly ? null : lipoTex,
      color: isLowPoly ? 0xf59e0b : 0xffffff,
      roughness: 0.44,
      metalness: 0.08,
      flatShading: isLowPoly,
    })
  );

  const redWireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.45,
      metalness: 0.1,
      flatShading: isLowPoly,
    })
  );

  const yellowWireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.45,
      metalness: 0.1,
      flatShading: isLowPoly,
    })
  );

  const cyanCapMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.25,
      metalness: 0.78,
      flatShading: isLowPoly,
    })
  );

  const blurMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: blurTex,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );

  const frontLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    })
  );

  const rearLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff453a,
      emissive: 0xef4444,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    })
  );

  // Low-slung freestyle chassis seated inside root so authentic thin foam motor pads sit flush at y = -0.22
  const frameGroup = new THREE.Group();
  frameGroup.position.set(0, -0.178, 0);

  // 1. Stacked Carbon Plates (Bottom plate, middle stack electronics, top deck plate)
  const bottomPlate = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.118, 0.008, 0.365)),
    carbonMat
  );
  bottomPlate.position.set(0, -0.025, 0);
  bottomPlate.castShadow = true;
  frameGroup.add(bottomPlate);

  // Low-profile belly TPU skid strips reaching ground level (-0.178 - 0.035 = -0.213)
  const bellySkidGeo = trackGeo(new THREE.BoxGeometry(0.088, 0.014, 0.032));
  for (const bz of [-0.11, 0.11]) {
    const skid = new THREE.Mesh(bellySkidGeo, matteBlackMat);
    skid.position.set(0, -0.035, bz);
    frameGroup.add(skid);
  }

  // Electronics Stack (Red 4-in-1 ESC PCB + Black FC + Brass Stand-off Nuts)
  const escBoard = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.095, 0.01, 0.098)),
    redMotorMat
  );
  escBoard.position.set(0, -0.006, 0.0);
  frameGroup.add(escBoard);

  const fcBoard = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.088, 0.012, 0.09)),
    matteBlackMat
  );
  fcBoard.position.set(0, 0.012, 0.0);
  frameGroup.add(fcBoard);

  // Anodized Purple Aluminum Vertical Standoffs (signature detail in both reference photos)
  const standoffGeo = trackGeo(new THREE.CylinderGeometry(0.0065, 0.0065, 0.072, 10));
  const screwCapGeo = trackGeo(new THREE.CylinderGeometry(0.009, 0.009, 0.005, 10));
  const standoffCoords: Array<[number, number]> = [
    [-0.044, -0.168],
    [0.044, -0.168],
    [-0.044, -0.095],
    [0.044, -0.095],
    [-0.044, 0.075],
    [0.044, 0.075],
    [-0.044, 0.155],
    [0.044, 0.155],
  ];
  for (const [sx, sz] of standoffCoords) {
    const post = new THREE.Mesh(standoffGeo, purpleAnodMat);
    post.position.set(sx, 0.014, sz);
    frameGroup.add(post);

    const topScrew = new THREE.Mesh(screwCapGeo, purpleAnodMat);
    topScrew.position.set(sx, 0.053, sz);
    frameGroup.add(topScrew);
  }

  // Carbon Top Plate
  const topPlate = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.11, 0.007, 0.345)),
    carbonMat
  );
  topPlate.position.set(0, 0.05, 0.0);
  topPlate.castShadow = true;
  frameGroup.add(topPlate);

  // Front Carbon Camera Side Plates framing the inner FPV micro camera
  const camPlateGeo = trackGeo(new THREE.BoxGeometry(0.006, 0.072, 0.082));
  for (const side of [-1, 1]) {
    const sidePlate = new THREE.Mesh(camPlateGeo, carbonMat);
    sidePlate.position.set(side * 0.048, 0.012, -0.132);
    frameGroup.add(sidePlate);
  }

  // 2. Inner Orange/Black Micro FPV Barrel Camera inside the front cage
  const innerFpvGroup = new THREE.Group();
  innerFpvGroup.position.set(0, 0.012, -0.148);
  innerFpvGroup.rotation.x = 0.22;

  const innerCamCube = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.058, 0.048, 0.044)),
    orangeCamMat
  );
  innerFpvGroup.add(innerCamCube);

  const innerBarrel = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.018, 0.02, 0.032, 16)),
    matteBlackMat
  );
  innerBarrel.rotation.x = Math.PI / 2;
  innerBarrel.position.z = -0.03;
  innerFpvGroup.add(innerBarrel);

  const innerLens = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.014, 14, 12)),
    lensGlassMat
  );
  innerLens.scale.set(1, 1, 0.45);
  innerLens.position.z = -0.044;
  innerFpvGroup.add(innerLens);

  frameGroup.add(innerFpvGroup);

  // 3. Uptilted Top Action Cam + Burnt-Orange TPU Cradle + Yellow Velcro Strap
  const gimbalHead = new THREE.Group();
  gimbalHead.position.set(0, 0.09, -0.095);
  gimbalHead.rotation.x = 0.4; // ~23 deg freestyle uptilt

  const tpuCradle = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.098, 0.026, 0.084)),
    tpuBrownOrangeMat
  );
  tpuCradle.position.set(0, -0.034, 0.002);
  tpuCradle.castShadow = true;
  gimbalHead.add(tpuCradle);

  const actionCamBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.092, 0.086, 0.076)),
    matteBlackMat
  );
  actionCamBody.castShadow = true;
  gimbalHead.add(actionCamBody);

  // Yellow velcro strap wrapping around the action cam mount
  const yellowStrapLoop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.102, 0.074, 0.034)),
    yellowStrapMat
  );
  yellowStrapLoop.position.set(0, -0.004, 0.016);
  gimbalHead.add(yellowStrapLoop);

  const topVelcroBand = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.034, 0.092, 0.082)),
    matteBlackMat
  );
  topVelcroBand.position.set(0, 0.002, 0);
  gimbalHead.add(topVelcroBand);

  const actionCamBezel = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.074, 0.07, 0.012)),
    carbonMat
  );
  actionCamBezel.position.set(0, 0, -0.041);
  gimbalHead.add(actionCamBezel);

  const actionCamRing = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.025, 0.027, 0.014, 18)),
    matteBlackMat
  );
  actionCamRing.rotation.x = Math.PI / 2;
  actionCamRing.position.set(0, 0, -0.047);
  gimbalHead.add(actionCamRing);

  const actionCamGlass = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.02, 16, 12)),
    lensGlassMat
  );
  actionCamGlass.scale.set(1, 1, 0.45);
  actionCamGlass.position.set(0, 0, -0.051);
  gimbalHead.add(actionCamGlass);

  frameGroup.add(gimbalHead);

  // 4. Top-Mounted Golden-Orange LiPo Battery + Double Black Velcro Straps + XT60 Lead
  const batteryPack = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.084, 0.064, 0.165)),
    lipoMat
  );
  batteryPack.position.set(0, 0.086, 0.056);
  batteryPack.castShadow = true;
  frameGroup.add(batteryPack);

  const strapGeo = trackGeo(new THREE.BoxGeometry(0.09, 0.07, 0.028));
  for (const sz of [0.014, 0.098]) {
    const strap = new THREE.Mesh(strapGeo, matteBlackMat);
    strap.position.set(0, 0.086, sz);
    frameGroup.add(strap);
  }

  const xt60Curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.026, 0.105, -0.018),
    new THREE.Vector3(0.052, 0.095, -0.024),
    new THREE.Vector3(0.054, 0.032, 0.012),
    new THREE.Vector3(0.036, 0.005, 0.018),
  ]);
  const xt60Wire = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(xt60Curve, 14, 0.0065, 8, false)),
    redWireMat
  );
  frameGroup.add(xt60Wire);

  // 5. Rear Dual V-Whisker RX Antennas + Mushroom Stubby VTX Antenna
  const rxWhipGeo = trackGeo(new THREE.CylinderGeometry(0.0032, 0.0038, 0.185, 8));
  for (const side of [-1, 1]) {
    const whip = new THREE.Mesh(rxWhipGeo, matteBlackMat);
    whip.position.set(side * 0.055, 0.115, 0.195);
    whip.rotation.z = side * -0.45;
    whip.rotation.x = -0.35;
    frameGroup.add(whip);
  }

  const vtxStem = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 10)),
    matteBlackMat
  );
  vtxStem.rotation.x = Math.PI / 2 - 0.35;
  vtxStem.position.set(0, 0.072, 0.19);
  frameGroup.add(vtxStem);

  const vtxMushroom = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.022, 0.014, 0.026, 16)),
    tpuBrownOrangeMat
  );
  vtxMushroom.rotation.x = Math.PI / 2 - 0.35;
  vtxMushroom.position.set(0, 0.082, 0.218);
  frameGroup.add(vtxMushroom);

  root.add(frameGroup);

  // FPV camera anchor mounted cleanly ahead of front camera lens
  const fpvMount = new THREE.Object3D();
  fpvMount.position.set(0, -0.128, -0.25);
  root.add(fpvMount);

  // 6. Carbon X-Arms, Heat-Shrunk Arm ESCs + Motor Wires, Candy Red Motor Bells & Cyan 3-Blade Props
  const armSpecs = [
    {
      rootPos: new THREE.Vector3(-0.045, -0.198, -0.105),
      motorPos: new THREE.Vector3(-0.335, -0.191, -0.295),
      isFront: true,
      spinDir: 1,
    },
    {
      rootPos: new THREE.Vector3(0.045, -0.198, -0.105),
      motorPos: new THREE.Vector3(0.335, -0.191, -0.295),
      isFront: true,
      spinDir: -1,
    },
    {
      rootPos: new THREE.Vector3(-0.045, -0.198, 0.105),
      motorPos: new THREE.Vector3(-0.335, -0.191, 0.295),
      isFront: false,
      spinDir: -1,
    },
    {
      rootPos: new THREE.Vector3(0.045, -0.198, 0.105),
      motorPos: new THREE.Vector3(0.335, -0.191, 0.295),
      isFront: false,
      spinDir: 1,
    },
  ];

  const propellers: THREE.Group[] = [];
  const propBlurDiscs: THREE.Mesh[] = [];
  const frontLeds: THREE.Mesh[] = [];
  const rearLeds: THREE.Mesh[] = [];

  const bladeGeo = trackGeo(createFpvSweptBladeGeometry());
  const statorBaseGeo = trackGeo(new THREE.CylinderGeometry(0.031, 0.031, 0.008, 16));
  const copperCoreGeo = trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.011, 14));
  const redBellGeo = trackGeo(new THREE.CylinderGeometry(0.031, 0.033, 0.02, 18));
  const bellTrimGeo = trackGeo(new THREE.CylinderGeometry(0.026, 0.031, 0.005, 18));
  const locknutGeo = trackGeo(new THREE.CylinderGeometry(0.009, 0.013, 0.013, 12));
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.018, 0.018, 0.011, 14));
  const foamPadGeo = trackGeo(new THREE.CylinderGeometry(0.022, 0.024, 0.016, 14));
  const escPodGeo = trackGeo(new THREE.BoxGeometry(0.046, 0.014, 0.078));
  const wireStrutGeo = trackGeo(new THREE.BoxGeometry(0.005, 0.005, 0.145));
  const blurGeo = trackGeo(new THREE.CircleGeometry(0.175, 24));
  blurGeo.rotateX(-Math.PI / 2);

  for (const spec of armSpecs) {
    const delta = new THREE.Vector3().subVectors(spec.motorPos, spec.rootPos);
    const armLen = delta.length();
    const armMid = new THREE.Vector3().addVectors(spec.rootPos, spec.motorPos).multiplyScalar(0.5);

    const armGroup = new THREE.Group();
    armGroup.position.copy(armMid);
    armGroup.lookAt(spec.motorPos);

    const armMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.044, 0.01, armLen)),
      carbonMat
    );
    armMesh.castShadow = true;
    armGroup.add(armMesh);

    // Heat-shrunk individual ESC + colorful parallel wires on top of arm
    const escPod = new THREE.Mesh(escPodGeo, matteBlackMat);
    escPod.position.set(0, 0.01, -armLen * 0.14);
    armGroup.add(escPod);

    for (let w = -1; w <= 1; w++) {
      const wireMat = w === -1 ? redWireMat : w === 0 ? yellowWireMat : matteBlackMat;
      const wire = new THREE.Mesh(wireStrutGeo, wireMat);
      wire.position.set(w * 0.011, 0.008, armLen * 0.15);
      armGroup.add(wire);
    }

    root.add(armGroup);

    // Authentic thin foam motor landing pad reaching y = -0.214 (flush at DRONE_SKID_HEIGHT = 0.22)
    const foamPad = new THREE.Mesh(foamPadGeo, matteBlackMat);
    foamPad.position.set(spec.motorPos.x, -0.207, spec.motorPos.z);
    foamPad.castShadow = true;
    root.add(foamPad);

    // Motor Assembly: carbon mount pad -> copper windings -> crimson red bell -> chrome chamfer
    const statorBase = new THREE.Mesh(statorBaseGeo, carbonMat);
    statorBase.position.set(spec.motorPos.x, spec.motorPos.y + 0.006, spec.motorPos.z);
    root.add(statorBase);

    const copperCore = new THREE.Mesh(copperCoreGeo, copperCoilMat);
    copperCore.position.set(spec.motorPos.x, spec.motorPos.y + 0.014, spec.motorPos.z);
    root.add(copperCore);

    const redBell = new THREE.Mesh(redBellGeo, redMotorMat);
    redBell.position.set(spec.motorPos.x, spec.motorPos.y + 0.025, spec.motorPos.z);
    redBell.castShadow = true;
    root.add(redBell);

    const bellTrim = new THREE.Mesh(bellTrimGeo, chromeMat);
    bellTrim.position.set(spec.motorPos.x, spec.motorPos.y + 0.036, spec.motorPos.z);
    root.add(bellTrim);

    // Translucent Cyan Tri-Blade (3-blade) Freestyle Propeller
    const propGroup = new THREE.Group();
    propGroup.position.set(spec.motorPos.x, spec.motorPos.y + 0.044, spec.motorPos.z);
    propGroup.userData.spinDir = spec.spinDir;

    const hub = new THREE.Mesh(hubGeo, cyanPropMat);
    propGroup.add(hub);

    const locknut = new THREE.Mesh(locknutGeo, spec.isFront ? cyanCapMat : redMotorMat);
    locknut.position.y = 0.008;
    propGroup.add(locknut);

    for (let b = 0; b < 3; b++) {
      const bladeWrap = new THREE.Group();
      bladeWrap.rotation.y = (b * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(bladeGeo, cyanPropMat);
      blade.position.set(0.01, 0.001, 0);
      blade.rotation.x = 0.16 * spec.spinDir;
      bladeWrap.add(blade);
      propGroup.add(bladeWrap);
    }

    root.add(propGroup);
    propellers.push(propGroup);

    const blurDisc = new THREE.Mesh(blurGeo, blurMat);
    blurDisc.position.set(spec.motorPos.x, spec.motorPos.y + 0.045, spec.motorPos.z);
    blurDisc.visible = false;
    root.add(blurDisc);
    propBlurDiscs.push(blurDisc);

    // Subtle under-arm orientation LEDs (cyan front, red rear)
    const led = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.011, 10, 10)),
      spec.isFront ? frontLedMat : rearLedMat
    );
    led.position.set(
      spec.motorPos.x,
      spec.motorPos.y - 0.016,
      spec.isFront ? spec.motorPos.z - 0.022 : spec.motorPos.z + 0.022
    );
    root.add(led);
    if (spec.isFront) frontLeds.push(led);
    else rearLeds.push(led);
  }

  const contactShadow = createContactShadow(disposables);

  return {
    root,
    propellers,
    propBlurDiscs,
    frontLeds,
    rearLeds,
    frontLedMat,
    rearLedMat,
    gimbalHead,
    fpvMount,
    contactShadow,
    dispose: () => {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
