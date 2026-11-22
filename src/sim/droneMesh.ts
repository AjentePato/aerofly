import * as THREE from 'three';

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
}

export function createDroneMesh(): DroneRig {
  const root = new THREE.Group();

  // Calibrated PBR materials with distinct roughness/metalness contrast
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x1c222d,
    roughness: 0.58,
    metalness: 0.28,
  });

  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0xf97316, // High-visibility safety orange for real-world orientation cues
    roughness: 0.16,
    metalness: 0.08,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
  });

  const titaniumMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.22,
    metalness: 0.9,
  });

  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.88,
    metalness: 0.05,
  });

  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b132b,
    roughness: 0.08,
    metalness: 0.2,
    clearcoat: 1.0,
  });

  const propMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.35,
    metalness: 0.15,
  });

  const blurMat = new THREE.MeshBasicMaterial({
    color: 0x94a3b8,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // 1. Primary silhouette: Beveled extruded fuselage chassis
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-0.14, -0.26);
  hullShape.lineTo(0.14, -0.26);
  hullShape.lineTo(0.19, -0.08);
  hullShape.lineTo(0.15, 0.24);
  hullShape.lineTo(-0.15, 0.24);
  hullShape.lineTo(-0.19, -0.08);
  hullShape.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.075,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.016,
    bevelSegments: 2,
  });
  hullGeo.rotateX(Math.PI / 2);
  const hullMesh = new THREE.Mesh(hullGeo, carbonMat);
  hullMesh.position.y = 0.04;
  hullMesh.castShadow = true;
  root.add(hullMesh);

  // 2. Secondary read: Sculpted aerodynamic top canopy & battery pack
  const canopyGeo = new THREE.BoxGeometry(0.22, 0.06, 0.34);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, 0.078, -0.01);
  canopy.castShadow = true;
  root.add(canopy);

  const batteryGeo = new THREE.BoxGeometry(0.15, 0.055, 0.22);
  const battery = new THREE.Mesh(batteryGeo, rubberMat);
  battery.position.set(0, 0.09, 0.07);
  battery.castShadow = true;
  root.add(battery);

  // 3. Front 2-axis Camera Gimbal Assembly (-Z is forward nose)
  const gimbalHead = new THREE.Group();
  gimbalHead.position.set(0, -0.02, -0.24);

  const gimbalBracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), titaniumMat);
  gimbalHead.add(gimbalBracket);

  const camHousing = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.068, 0.075), carbonMat);
  camHousing.position.set(0, -0.01, -0.03);
  gimbalHead.add(camHousing);

  const lensRing = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.028, 16), titaniumMat);
  lensRing.rotation.x = Math.PI / 2;
  lensRing.position.set(0, -0.01, -0.072);
  gimbalHead.add(lensRing);

  const lensGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.01, 16), lensMat);
  lensGlass.rotation.x = Math.PI / 2;
  lensGlass.position.set(0, -0.01, -0.084);
  gimbalHead.add(lensGlass);

  root.add(gimbalHead);

  // FPV camera anchor mounted right in front of the gimbal lens
  const fpvMount = new THREE.Object3D();
  fpvMount.position.set(0, 0.01, -0.34);
  root.add(fpvMount);

  // 4. Landing Skids (left & right rails + vertical struts)
  const skidOffsets = [-0.17, 0.17];
  for (const sx of skidOffsets) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.44, 10), rubberMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(sx, -0.2, 0);
    rail.castShadow = true;
    root.add(rail);

    for (const sz of [-0.14, 0.14]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.21, 8), carbonMat);
      strut.position.set(sx * 0.85, -0.1, sz);
      strut.rotation.z = sx > 0 ? 0.22 : -0.22;
      root.add(strut);
    }
  }

  // 5. Four X-Arms, Brushless Motors, Propellers, Blur Discs & Orientation LEDs
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

  const frontLedMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x38bdf8,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });
  const rearLedMat = new THREE.MeshStandardMaterial({
    color: 0xff3b30,
    emissive: 0xef4444,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });

  const armLength = Math.hypot(0.34, 0.34);
  const armGeo = new THREE.BoxGeometry(0.042, 0.024, armLength);
  const motorGeo = new THREE.CylinderGeometry(0.042, 0.045, 0.055, 16);
  const hubGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.025, 12);
  const bladeGeo = new THREE.BoxGeometry(0.36, 0.006, 0.036);
  const blurGeo = new THREE.CircleGeometry(0.185, 24);
  blurGeo.rotateX(-Math.PI / 2);

  for (const cfg of armPositions) {
    const arm = new THREE.Mesh(armGeo, carbonMat);
    arm.position.set(cfg.x * 0.5, 0.015, cfg.z * 0.5);
    arm.rotation.y = Math.atan2(cfg.x, cfg.z);
    arm.castShadow = true;
    root.add(arm);

    const motor = new THREE.Mesh(motorGeo, titaniumMat);
    motor.position.set(cfg.x, 0.04, cfg.z);
    motor.castShadow = true;
    root.add(motor);

    const propGroup = new THREE.Group();
    propGroup.position.set(cfg.x, 0.075, cfg.z);
    propGroup.userData.spinDir = cfg.spinDir;

    const hub = new THREE.Mesh(hubGeo, canopyMat);
    propGroup.add(hub);

    const bladeA = new THREE.Mesh(bladeGeo, propMat);
    bladeA.rotation.x = 0.12 * cfg.spinDir;
    propGroup.add(bladeA);

    root.add(propGroup);
    propellers.push(propGroup);

    const blurDisc = new THREE.Mesh(blurGeo, blurMat);
    blurDisc.position.set(cfg.x, 0.076, cfg.z);
    blurDisc.visible = false;
    root.add(blurDisc);
    propBlurDiscs.push(blurDisc);

    // Orientation LED pod underneath motor mount
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 10, 10),
      cfg.isFront ? frontLedMat : rearLedMat
    );
    led.position.set(cfg.x, -0.012, cfg.z);
    root.add(led);
    if (cfg.isFront) frontLeds.push(led);
    else rearLeds.push(led);
  }

  // Ground contact shadow disc (managed independently in world space by canvas loop)
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.22)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);

  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  shadowTex.colorSpace = THREE.SRGBColorSpace;
  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 24),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;

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
  };
}
