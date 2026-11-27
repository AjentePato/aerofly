import * as THREE from 'three';
import { createFpvFreestyleDroneMesh } from './droneFpvMesh';
import { createLito1DroneMesh } from './droneLito1Mesh';
import { createCarbonWeavePbr, createPropBlurTexture } from './proceduralTextures';
import type { DroneSkinId, GraphicsMode } from './types';

export interface DroneRig {
  root: THREE.Group;
  propellers: THREE.Group[];
  propBlurDiscs: THREE.Mesh[];
  frontLeds: THREE.Mesh[];
  rearLeds: THREE.Mesh[];
  frontLedMat: THREE.MeshStandardMaterial;
  rearLedMat: THREE.MeshStandardMaterial;
  gimbalHead: THREE.Group;
  fpvMount: THREE.Object3D;
  contactShadow: THREE.Mesh;
  dispose: () => void;
}

interface DisposableEntry {
  dispose: () => void;
}

export function createDroneContactShadow(disposables: DisposableEntry[]): THREE.Mesh {
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
  grad.addColorStop(0.58, 'rgba(0, 0, 0, 0.24)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);

  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  shadowTex.colorSpace = THREE.SRGBColorSpace;
  disposables.push(shadowTex);

  const shadowGeo = new THREE.CircleGeometry(0.76, 28);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.78,
  });
  disposables.push(shadowGeo, shadowMat);

  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  return contactShadow;
}

function createDefaultAirfoilBladeGeo(): THREE.ExtrudeGeometry {
  const len = 0.178;
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.008);
  shape.bezierCurveTo(0.04, -0.019, 0.12, -0.017, len, -0.008);
  shape.lineTo(len, 0.009);
  shape.bezierCurveTo(0.12, 0.018, 0.04, 0.016, 0, 0.008);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0038,
    bevelEnabled: false,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function applyBoxProjectedUvs(geo: THREE.BufferGeometry, uvScale = 2.6) {
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  if (!pos || !norm || !uv) return;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ny >= nx && ny >= nz) {
      uv.setXY(i, x * uvScale, z * uvScale);
    } else if (nx >= ny && nx >= nz) {
      uv.setXY(i, z * uvScale, y * uvScale);
    } else {
      uv.setXY(i, x * uvScale, y * uvScale);
    }
  }
  uv.needsUpdate = true;
}

function createDefaultDroneMesh(maxAnisotropy: number, graphicsMode: GraphicsMode): DroneRig {
  const isLowPoly = graphicsMode === 'low_poly';
  const disposables: DisposableEntry[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    disposables.push(t);
    return t;
  };

  const root = new THREE.Group();

  const blurTex = trackTex(createPropBlurTexture([48, 56, 70], [249, 115, 22], maxAnisotropy));

  let carbonMat: THREE.MeshStandardMaterial;
  let canopyMat: THREE.Material;
  let titaniumMat: THREE.Material;
  let copperMat: THREE.MeshStandardMaterial;
  let rubberMat: THREE.MeshStandardMaterial;
  let lensMat: THREE.Material;
  let propMat: THREE.MeshStandardMaterial;

  if (isLowPoly) {
    carbonMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x262e3d, roughness: 0.72, metalness: 0.25, flatShading: true })
    );
    canopyMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.42, metalness: 0.12, flatShading: true })
    );
    titaniumMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.35, metalness: 0.72, flatShading: true })
    );
    copperMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xd97736, roughness: 0.42, metalness: 0.72, flatShading: true })
    );
    rubberMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x11151d, roughness: 0.9, metalness: 0.04, flatShading: true })
    );
    lensMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.4, flatShading: true })
    );
    propMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.48, metalness: 0.15, flatShading: true })
    );
  } else {
    const carbonPbr = createCarbonWeavePbr(maxAnisotropy, 1);
    trackTex(carbonPbr.map);
    trackTex(carbonPbr.normalMap);
    trackTex(carbonPbr.roughnessMap);

    carbonMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: carbonPbr.map,
        normalMap: carbonPbr.normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: carbonPbr.roughnessMap,
        roughness: 0.78,
        metalness: 0.3,
      })
    );
    canopyMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xd9480f,
        roughness: 0.22,
        metalness: 0.16,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
      })
    );
    titaniumMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xd1d8e0,
        roughness: 0.22,
        metalness: 0.92,
        anisotropy: 0.72,
      })
    );
    copperMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc27038,
        roughness: 0.32,
        metalness: 0.88,
      })
    );
    rubberMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x11151d,
        roughness: 0.88,
        metalness: 0.05,
      })
    );
    lensMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x091324,
        roughness: 0.04,
        metalness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        iridescence: 0.82,
        iridescenceIOR: 1.38,
      })
    );
    propMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x262e3a,
        roughness: 0.32,
        metalness: 0.16,
      })
    );
  }

  const blurMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: blurTex,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );

  // 1. Primary silhouette: Beveled 3K Carbon Fuselage Chassis
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, -0.265);
  hullShape.bezierCurveTo(0.11, -0.26, 0.175, -0.16, 0.185, -0.06);
  hullShape.bezierCurveTo(0.19, 0.06, 0.165, 0.19, 0.12, 0.245);
  hullShape.lineTo(-0.12, 0.245);
  hullShape.bezierCurveTo(-0.165, 0.19, -0.19, 0.06, -0.185, -0.06);
  hullShape.bezierCurveTo(-0.175, -0.16, -0.11, -0.26, 0, -0.265);

  const hullGeo = trackGeo(
    new THREE.ExtrudeGeometry(hullShape, {
      depth: 0.062,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.016,
      bevelSegments: 3,
      curveSegments: 14,
    })
  );
  hullGeo.rotateX(Math.PI / 2);
  applyBoxProjectedUvs(hullGeo, 3.6);
  const hullMesh = new THREE.Mesh(hullGeo, carbonMat);
  hullMesh.position.y = 0.038;
  hullMesh.castShadow = true;
  root.add(hullMesh);

  // 2. Sculpted Aerodynamic Top Canopy Cowling & Recessed Battery Pack
  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(0, -0.21);
  canopyShape.bezierCurveTo(0.088, -0.2, 0.118, -0.1, 0.114, 0.02);
  canopyShape.bezierCurveTo(0.11, 0.12, 0.082, 0.175, 0, 0.185);
  canopyShape.bezierCurveTo(-0.082, 0.175, -0.11, 0.12, -0.114, 0.02);
  canopyShape.bezierCurveTo(-0.118, -0.1, -0.088, -0.2, 0, -0.21);

  const canopyGeo = trackGeo(
    new THREE.ExtrudeGeometry(canopyShape, {
      depth: 0.036,
      bevelEnabled: true,
      bevelThickness: 0.016,
      bevelSize: 0.014,
      bevelSegments: 3,
      curveSegments: 14,
    })
  );
  canopyGeo.rotateX(Math.PI / 2);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, 0.072, -0.02);
  canopy.castShadow = true;
  root.add(canopy);

  // Carbon center aero spine + cooling vent intake + telemetry battery housing
  const spineTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.044, 0.012, 0.24)), carbonMat);
  spineTrim.position.set(0, 0.086, -0.04);
  root.add(spineTrim);

  const ventMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.016, 0.045)), rubberMat);
  ventMesh.position.set(0, 0.085, -0.11);
  root.add(ventMesh);

  const battery = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.135, 0.052, 0.2)), rubberMat);
  battery.position.set(0, 0.082, 0.085);
  battery.castShadow = true;
  root.add(battery);

  const strap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.145, 0.058, 0.034)), canopyMat);
  strap.position.set(0, 0.082, 0.09);
  root.add(strap);

  // 3. Front 2-axis Rubber-Damped Camera Gimbal Assembly (-Z forward)
  const gimbalHead = new THREE.Group();
  gimbalHead.position.set(0, -0.025, -0.245);

  const gimbalBracket = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.082, 0.044, 0.046)), titaniumMat);
  gimbalHead.add(gimbalBracket);

  const camHousing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.082, 0.066, 0.072)), carbonMat);
  camHousing.position.set(0, -0.012, -0.028);
  camHousing.castShadow = true;
  gimbalHead.add(camHousing);

  const lensRing = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.026, 0.028, 0.026, 18)), titaniumMat);
  lensRing.rotation.x = Math.PI / 2;
  lensRing.position.set(0, -0.012, -0.07);
  gimbalHead.add(lensRing);

  const lensGlass = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.019, 16, 12)), lensMat);
  lensGlass.scale.set(1, 1, 0.45);
  lensGlass.position.set(0, -0.012, -0.082);
  gimbalHead.add(lensGlass);

  root.add(gimbalHead);

  const fpvMount = new THREE.Object3D();
  fpvMount.position.set(0, 0.01, -0.34);
  root.add(fpvMount);

  // 4. Landing Skids (left & right rails + angled carbon struts)
  const railGeo = trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.44, 12));
  const strutGeo = trackGeo(new THREE.CylinderGeometry(0.01, 0.011, 0.21, 10));
  for (const sx of [-0.17, 0.17]) {
    const rail = new THREE.Mesh(railGeo, rubberMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(sx, -0.2, 0);
    rail.castShadow = true;
    root.add(rail);

    for (const sz of [-0.14, 0.14]) {
      const strut = new THREE.Mesh(strutGeo, carbonMat);
      strut.position.set(sx * 0.85, -0.1, sz);
      strut.rotation.z = sx > 0 ? 0.22 : -0.22;
      root.add(strut);
    }
  }

  // 5. Four 3K Carbon X-Arms, Copper-Wound Brushless Motors, Airfoil Blades & Orientation LEDs
  const armPositions: Array<{ x: number; z: number; isFront: boolean; spinDir: number }> = [
    { x: -0.34, z: -0.34, isFront: true, spinDir: 1 },
    { x: 0.34, z: -0.34, isFront: true, spinDir: -1 },
    { x: -0.34, z: 0.34, isFront: false, spinDir: -1 },
    { x: 0.34, z: 0.34, isFront: false, spinDir: 1 },
  ];

  const propellers: THREE.Group[] = [];
  const propBlurDiscs: THREE.Mesh[] = [];
  const frontLeds: THREE.Mesh[] = [];
  const rearLeds: THREE.Mesh[] = [];

  const frontLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x38bdf8,
      emissiveIntensity: 2.0,
      roughness: 0.18,
    })
  );
  const rearLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff3b30,
      emissive: 0xef4444,
      emissiveIntensity: 2.0,
      roughness: 0.18,
    })
  );

  const armLength = Math.hypot(0.34, 0.34);
  const armGeo = trackGeo(new THREE.BoxGeometry(0.038, 0.022, armLength));
  const statorBaseGeo = trackGeo(new THREE.CylinderGeometry(0.042, 0.045, 0.016, 18));
  const copperCoilGeo = trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 16));
  const motorBellGeo = trackGeo(new THREE.CylinderGeometry(0.041, 0.043, 0.028, 20));
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.017, 0.022, 0.022, 14));
  const bladeGeo = trackGeo(createDefaultAirfoilBladeGeo());
  const blurGeo = trackGeo(new THREE.CircleGeometry(0.185, 28));
  blurGeo.rotateX(-Math.PI / 2);
  const ledGeo = trackGeo(new THREE.SphereGeometry(0.014, 10, 10));

  for (const cfg of armPositions) {
    const arm = new THREE.Mesh(armGeo, carbonMat);
    arm.position.set(cfg.x * 0.5, 0.015, cfg.z * 0.5);
    arm.rotation.y = Math.atan2(cfg.x, cfg.z);
    arm.castShadow = true;
    root.add(arm);

    const statorBase = new THREE.Mesh(statorBaseGeo, carbonMat);
    statorBase.position.set(cfg.x, 0.02, cfg.z);
    statorBase.castShadow = true;
    root.add(statorBase);

    const copper = new THREE.Mesh(copperCoilGeo, copperMat);
    copper.position.set(cfg.x, 0.035, cfg.z);
    root.add(copper);

    const bell = new THREE.Mesh(motorBellGeo, titaniumMat);
    bell.position.set(cfg.x, 0.052, cfg.z);
    bell.castShadow = true;
    root.add(bell);

    const propGroup = new THREE.Group();
    propGroup.position.set(cfg.x, 0.074, cfg.z);
    propGroup.userData.spinDir = cfg.spinDir;

    const hub = new THREE.Mesh(hubGeo, canopyMat);
    propGroup.add(hub);

    const blade1 = new THREE.Mesh(bladeGeo, propMat);
    blade1.position.set(0.008, 0.002, 0);
    blade1.rotation.x = 0.14 * cfg.spinDir;
    propGroup.add(blade1);

    const blade2 = new THREE.Mesh(bladeGeo, propMat);
    blade2.position.set(-0.008, 0.002, 0);
    blade2.rotation.y = Math.PI;
    blade2.rotation.x = -0.14 * cfg.spinDir;
    propGroup.add(blade2);

    root.add(propGroup);
    propellers.push(propGroup);

    const blurDisc = new THREE.Mesh(blurGeo, blurMat);
    blurDisc.position.set(cfg.x, 0.077, cfg.z);
    blurDisc.visible = false;
    root.add(blurDisc);
    propBlurDiscs.push(blurDisc);

    const led = new THREE.Mesh(ledGeo, cfg.isFront ? frontLedMat : rearLedMat);
    led.position.set(cfg.x, -0.01, cfg.z);
    root.add(led);
    if (cfg.isFront) frontLeds.push(led);
    else rearLeds.push(led);
  }

  const contactShadow = createDroneContactShadow(disposables);

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

export function createDroneMesh(
  skin: DroneSkinId = 'default',
  maxAnisotropy = 4,
  graphicsMode: GraphicsMode = 'realistic'
): DroneRig {
  if (skin === 'dji_lito_1') {
    return createLito1DroneMesh(maxAnisotropy, createDroneContactShadow, graphicsMode);
  }
  if (skin === 'fpv_freestyle') {
    return createFpvFreestyleDroneMesh(maxAnisotropy, createDroneContactShadow, graphicsMode);
  }
  return createDefaultDroneMesh(maxAnisotropy, graphicsMode);
}
