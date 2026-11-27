import * as THREE from 'three';
import { createPropBlurTexture } from './proceduralTextures';
import type { DroneRig } from './droneMesh';
import type { GraphicsMode } from './types';

interface DisposableEntry {
  dispose: () => void;
}

function createLitoShellTexture(maxAnisotropy: number, disposables: DisposableEntry[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Authentic DJI Lito 1 matte cool-neutral aero gray (resists chalky washout in direct sun)
  ctx.fillStyle = '#bcc2c8';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4200; i++) {
    const x = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 512;
    const y = ((Math.sin(i * 78.233) * 19341.231) % 1 + 1) % 1 * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)';
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = 'rgba(51, 65, 85, 0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 472, 472);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  disposables.push(tex);
  return tex;
}

function createLitoTopDeckTexture(maxAnisotropy: number, disposables: DisposableEntry[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 512);

  // Stylized white emblem matching rear top deck (lito_1_costas)
  ctx.save();
  ctx.translate(256, 155);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
  ctx.shadowBlur = 4;
  ctx.font = 'italic 900 62px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('dji', 0, 0);
  ctx.restore();

  // 4 green battery indicator LED dots above power button
  const dotXs = [204, 238, 272, 306];
  for (let i = 0; i < dotXs.length; i++) {
    ctx.beginPath();
    ctx.arc(dotXs[i], 238, 9, 0, Math.PI * 2);
    ctx.fillStyle = i < 3 ? '#22c55e' : '#86efac';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.stroke();
  }

  // Flush rounded-rectangle power button
  ctx.fillStyle = '#bfc5ca';
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.roundRect(206, 278, 100, 58, 18);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(256, 307, 11, -Math.PI * 0.35, Math.PI * 1.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(256, 291);
  ctx.lineTo(256, 305);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  disposables.push(tex);
  return tex;
}

function createLitoBladeTexture(maxAnisotropy: number, disposables: DisposableEntry[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const bodyGrad = ctx.createLinearGradient(0, 0, 222, 0);
  bodyGrad.addColorStop(0, '#1e2229');
  bodyGrad.addColorStop(0.55, '#2d333d');
  bodyGrad.addColorStop(1, '#232830');
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(0, 0, 256, 64);

  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, 0, 224, 14);

  // Signature DJI Lito 1 safety orange tip (outer 13%)
  ctx.fillStyle = '#f97316';
  ctx.fillRect(220, 0, 36, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  disposables.push(tex);
  return tex;
}

function createLitoBlurDiscTexture(maxAnisotropy: number, disposables: DisposableEntry[]): THREE.CanvasTexture {
  const tex = createPropBlurTexture([48, 56, 68], [249, 115, 22], maxAnisotropy);
  disposables.push(tex);
  return tex;
}

/**
 * Builds a tapered airfoil propeller blade spanning x = 0..0.168m with normalized 0..1 U along X
 * so the blade texture maps the orange tip cleanly onto the outer 13% of the airfoil.
 */
function createTaperedBladeGeometry(): THREE.ExtrudeGeometry {
  const bladeLen = 0.168;
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.008);
  shape.bezierCurveTo(0.04, -0.017, 0.115, -0.015, bladeLen, -0.009);
  shape.lineTo(bladeLen, 0.009);
  shape.bezierCurveTo(0.115, 0.016, 0.04, 0.015, 0, 0.008);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0035,
    bevelEnabled: false,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);

  // Normalize UVs across [0..bladeLen] along X so orange tip always sits at the outer tip
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  if (pos && uv) {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      uv.setXY(i, Math.max(0, Math.min(1, x / bladeLen)), (z + 0.018) / 0.036);
    }
    uv.needsUpdate = true;
  }

  return geo;
}

export function createLito1DroneMesh(
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

  const shellTex = isLowPoly ? null : createLitoShellTexture(maxAnisotropy, disposables);
  const topDeckTex = createLitoTopDeckTexture(maxAnisotropy, disposables);
  const bladeTex = createLitoBladeTexture(maxAnisotropy, disposables);
  const blurTex = createLitoBlurDiscTexture(maxAnisotropy, disposables);

  const shellMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isLowPoly ? 0xd2d7dd : 0xc8ced4,
      map: shellTex,
      roughness: isLowPoly ? 0.68 : 0.5,
      metalness: 0.04,
      flatShading: isLowPoly,
    })
  );

  const batteryShellMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb7bcc1,
      roughness: 0.56,
      metalness: 0.05,
      flatShading: isLowPoly,
    })
  );

  const darkTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x20242b,
      roughness: 0.5,
      metalness: 0.14,
      flatShading: isLowPoly,
    })
  );

  const rubberMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x15181e,
      roughness: 0.88,
      metalness: 0.04,
      flatShading: isLowPoly,
    })
  );

  const brushedAlumMat = trackMat(
    isLowPoly
      ? new THREE.MeshStandardMaterial({
          color: 0xc8cfd8,
          roughness: 0.35,
          metalness: 0.72,
          flatShading: true,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xc8cfd8,
          roughness: 0.22,
          metalness: 0.9,
          anisotropy: 0.68,
        })
  );

  const copperCoilMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb96c36,
      roughness: 0.32,
      metalness: 0.86,
      flatShading: isLowPoly,
    })
  );

  const opticalLensMat = trackMat(
    isLowPoly
      ? new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.15,
          metalness: 0.35,
          flatShading: true,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x0a1726,
          roughness: 0.04,
          metalness: 0.16,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          iridescence: 0.82,
          iridescenceIOR: 1.38,
        })
  );

  const bladeMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: bladeTex,
      roughness: 0.36,
      metalness: 0.14,
    })
  );

  const blurMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: blurTex,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );

  const topDeckDecalMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: topDeckTex,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );

  // 1. Sleek Rounded Aerodynamic Fuselage (compact low center-of-mass so front drop legs look proportional)
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, -0.215);
  hullShape.bezierCurveTo(0.064, -0.215, 0.084, -0.14, 0.082, -0.04);
  hullShape.bezierCurveTo(0.086, 0.06, 0.088, 0.14, 0.07, 0.195);
  hullShape.bezierCurveTo(0.046, 0.215, -0.046, 0.215, -0.07, 0.195);
  hullShape.bezierCurveTo(-0.088, 0.14, -0.086, 0.06, -0.082, -0.04);
  hullShape.bezierCurveTo(-0.084, -0.14, -0.064, -0.215, 0, -0.215);

  const hullGeo = trackGeo(
    new THREE.ExtrudeGeometry(hullShape, {
      depth: 0.046,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.018,
      bevelSegments: 4,
      curveSegments: 16,
    })
  );
  hullGeo.rotateX(Math.PI / 2);

  // Shift fuselage slightly lower inside root so front drop legs are sleek ~0.135m (not stilt-like)
  const fuselageGroup = new THREE.Group();
  fuselageGroup.position.set(0, -0.055, 0);

  const mainHull = new THREE.Mesh(hullGeo, shellMat);
  mainHull.position.y = 0.018;
  mainHull.castShadow = true;
  fuselageGroup.add(mainHull);

  // Smooth curved upper aero dome sloping organically toward the nose (no separate hat bump)
  const domeGeo = trackGeo(new THREE.SphereGeometry(1, 28, 18));
  const upperDome = new THREE.Mesh(domeGeo, shellMat);
  upperDome.scale.set(0.084, 0.046, 0.218);
  upperDome.position.set(0, 0.015, -0.014);
  upperDome.castShadow = true;
  fuselageGroup.add(upperDome);

  // Twin subtle longitudinal top aero ridges flanking center sensor channel (image 3)
  const ridgeGeo = trackGeo(new THREE.CapsuleGeometry(0.011, 0.175, 6, 10));
  ridgeGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const ridge = new THREE.Mesh(ridgeGeo, shellMat);
    ridge.position.set(side * 0.045, 0.045, 0.01);
    ridge.rotation.y = side * -0.08;
    fuselageGroup.add(ridge);
  }

  // Top front circular dark optical/ToF sensor dot clearly sitting proud on the crown
  const topSensorRing = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.016, 0.018, 0.008, 16)),
    darkTrimMat
  );
  topSensorRing.position.set(0, 0.058, -0.068);
  fuselageGroup.add(topSensorRing);

  const topSensorLens = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.01, 0.01, 0.009, 16)),
    opticalLensMat
  );
  topSensorLens.position.set(0, 0.059, -0.068);
  fuselageGroup.add(topSensorLens);

  // Seamless sloping nose overhang + molded gray cowls around twin recessed binocular "cat-eye" sensors
  const browGeo = trackGeo(new THREE.SphereGeometry(1, 18, 12));
  const brow = new THREE.Mesh(browGeo, shellMat);
  brow.scale.set(0.078, 0.02, 0.046);
  brow.position.set(0, 0.004, -0.188);
  brow.rotation.x = 0.22;
  brow.castShadow = true;
  fuselageGroup.add(brow);

  const eyeCowlGeo = trackGeo(new THREE.TorusGeometry(0.024, 0.007, 10, 20));
  const eyeCupGeo = trackGeo(new THREE.CylinderGeometry(0.022, 0.019, 0.032, 16));
  eyeCupGeo.rotateX(Math.PI / 2);
  const eyeLensGeo = trackGeo(new THREE.SphereGeometry(0.014, 14, 12));

  for (const side of [-1, 1]) {
    const eyePod = new THREE.Group();
    eyePod.position.set(side * 0.047, -0.004, -0.198);
    eyePod.rotation.y = side * -0.26;
    eyePod.rotation.x = 0.14;

    const eyeCowl = new THREE.Mesh(eyeCowlGeo, shellMat);
    eyeCowl.scale.set(1.22, 0.86, 1.0);
    eyeCowl.position.z = -0.008;
    eyePod.add(eyeCowl);

    const eyeCup = new THREE.Mesh(eyeCupGeo, darkTrimMat);
    eyeCup.scale.set(1.2, 0.84, 1.0);
    eyePod.add(eyeCup);

    const eyeLens = new THREE.Mesh(eyeLensGeo, opticalLensMat);
    eyeLens.position.z = -0.01;
    eyeLens.scale.set(1.0, 0.85, 0.6);
    eyePod.add(eyeLens);

    fuselageGroup.add(eyePod);
  }

  // Dark recessed under-chin gimbal cavity
  const chinBay = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.105, 0.042, 0.085)),
    darkTrimMat
  );
  chinBay.position.set(0, -0.036, -0.175);
  fuselageGroup.add(chinBay);

  // Two small downward visual-positioning sensor nubs on belly (visible in airborne photo 2)
  const bellyNubGeo = trackGeo(new THREE.ConeGeometry(0.011, 0.02, 10));
  bellyNubGeo.rotateX(Math.PI);
  for (const bz of [-0.048, 0.012]) {
    const nub = new THREE.Mesh(bellyNubGeo, batteryShellMat);
    nub.position.set(0, -0.062, bz);
    fuselageGroup.add(nub);
  }

  // 2. Rear Upper Deck Markings (DJI emblem, 4 green LEDs, power button) mounted cleanly on top rear slope
  const topRearOverlay = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.135, 0.145)),
    topDeckDecalMat
  );
  topRearOverlay.rotation.x = -Math.PI / 2 + 0.18;
  topRearOverlay.position.set(0, 0.054, 0.132);
  fuselageGroup.add(topRearOverlay);

  // Left & Right 3D angled cooling vent pods with 3 louver slats each
  const ventWellGeo = trackGeo(new THREE.BoxGeometry(0.03, 0.012, 0.062));
  const slatGeo = trackGeo(new THREE.BoxGeometry(0.026, 0.007, 0.007));
  for (const side of [-1, 1]) {
    const ventGroup = new THREE.Group();
    ventGroup.position.set(side * 0.056, 0.038, 0.142);
    ventGroup.rotation.y = side * -0.26;
    ventGroup.rotation.x = 0.22;

    const well = new THREE.Mesh(ventWellGeo, darkTrimMat);
    ventGroup.add(well);

    for (const sz of [-0.016, 0, 0.016]) {
      const slat = new THREE.Mesh(slatGeo, batteryShellMat);
      slat.position.set(0, 0.004, sz);
      ventGroup.add(slat);
    }
    fuselageGroup.add(ventGroup);
  }

  // Rear recessed USB-C + microSD port strip integrated flush into the tail (sleek belly with no hanging box)
  const rearPortStrip = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.088, 0.016, 0.02)),
    darkTrimMat
  );
  rearPortStrip.position.set(0, -0.008, 0.214);
  fuselageGroup.add(rearPortStrip);

  root.add(fuselageGroup);

  // 3. Front 3-Axis Compact Square Camera Gimbal Assembly (-Z forward)
  const gimbalHead = new THREE.Group();
  gimbalHead.position.set(0, -0.098, -0.2);

  const gimbalYoke = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.078, 0.032, 0.032)),
    darkTrimMat
  );
  gimbalYoke.position.set(0, 0.012, 0.012);
  gimbalHead.add(gimbalYoke);

  const camBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.074, 0.068, 0.064)),
    darkTrimMat
  );
  camBody.position.set(0, -0.012, -0.016);
  camBody.castShadow = true;
  gimbalHead.add(camBody);

  const bezel = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.054, 0.052, 0.015)),
    rubberMat
  );
  bezel.position.set(0, -0.012, -0.05);
  gimbalHead.add(bezel);

  const lensRing = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.021, 0.021, 0.012, 18)),
    darkTrimMat
  );
  lensRing.rotation.x = Math.PI / 2;
  lensRing.position.set(0, -0.012, -0.058);
  gimbalHead.add(lensRing);

  const lensGlass = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.016, 16, 12)),
    opticalLensMat
  );
  lensGlass.scale.set(1, 1, 0.45);
  lensGlass.position.set(0, -0.012, -0.062);
  gimbalHead.add(lensGlass);

  root.add(gimbalHead);

  // FPV camera anchor mounted right ahead of the gimbal lens
  const fpvMount = new THREE.Object3D();
  fpvMount.position.set(0, -0.075, -0.31);
  root.add(fpvMount);

  // 4. Asymmetric DJI Folding Arms, Front L-Landing Legs, Silver Motor Bells & Tapered Orange-Tip Props
  const armSpecs = [
    {
      rootPos: new THREE.Vector3(-0.076, -0.072, -0.105),
      motorPos: new THREE.Vector3(-0.345, -0.062, -0.31),
      isFront: true,
      isLeftFront: true,
      spinDir: 1,
    },
    {
      rootPos: new THREE.Vector3(0.076, -0.072, -0.105),
      motorPos: new THREE.Vector3(0.345, -0.062, -0.31),
      isFront: true,
      isLeftFront: false,
      spinDir: -1,
    },
    {
      rootPos: new THREE.Vector3(-0.072, -0.05, 0.14),
      motorPos: new THREE.Vector3(-0.315, -0.072, 0.285),
      isFront: false,
      isLeftFront: false,
      spinDir: -1,
    },
    {
      rootPos: new THREE.Vector3(0.072, -0.05, 0.14),
      motorPos: new THREE.Vector3(0.315, -0.072, 0.285),
      isFront: false,
      isLeftFront: false,
      spinDir: 1,
    },
  ];

  const propellers: THREE.Group[] = [];
  const propBlurDiscs: THREE.Mesh[] = [];
  const frontLeds: THREE.Mesh[] = [];
  const rearLeds: THREE.Mesh[] = [];

  const frontLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    })
  );
  const rearLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff453a,
      emissive: 0xef4444,
      emissiveIntensity: 1.7,
      roughness: 0.2,
    })
  );

  const bladeGeo = trackGeo(createTaperedBladeGeometry());
  const motorSeatGeo = trackGeo(new THREE.CylinderGeometry(0.032, 0.029, 0.02, 16));
  const copperCoreGeo = trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.011, 14));
  const motorBellGeo = trackGeo(new THREE.CylinderGeometry(0.03, 0.032, 0.02, 18));
  const rotorCapGeo = trackGeo(new THREE.CylinderGeometry(0.015, 0.02, 0.014, 14));
  const hingeGeo = trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.032, 12));
  const blurGeo = trackGeo(new THREE.CircleGeometry(0.178, 24));
  blurGeo.rotateX(-Math.PI / 2);

  for (const spec of armSpecs) {
    const delta = new THREE.Vector3().subVectors(spec.motorPos, spec.rootPos);
    const armLen = delta.length();
    const armMid = new THREE.Vector3().addVectors(spec.rootPos, spec.motorPos).multiplyScalar(0.5);

    const armGroup = new THREE.Group();
    armGroup.position.copy(armMid);
    armGroup.lookAt(spec.motorPos);

    const armGeo = trackGeo(new THREE.BoxGeometry(0.032, 0.024, armLen));
    const armMesh = new THREE.Mesh(armGeo, shellMat);
    armMesh.castShadow = true;
    armGroup.add(armMesh);

    const hinge = new THREE.Mesh(hingeGeo, darkTrimMat);
    hinge.position.set(0, 0, -armLen * 0.45);
    armGroup.add(hinge);

    root.add(armGroup);

    // Motor pod assembly
    const seat = new THREE.Mesh(motorSeatGeo, shellMat);
    seat.position.set(spec.motorPos.x, spec.motorPos.y, spec.motorPos.z);
    seat.castShadow = true;
    root.add(seat);

    const copperCore = new THREE.Mesh(copperCoreGeo, copperCoilMat);
    copperCore.position.set(spec.motorPos.x, spec.motorPos.y + 0.012, spec.motorPos.z);
    root.add(copperCore);

    const bell = new THREE.Mesh(motorBellGeo, brushedAlumMat);
    bell.position.set(spec.motorPos.x, spec.motorPos.y + 0.022, spec.motorPos.z);
    bell.castShadow = true;
    root.add(bell);

    // Proportional vertical L-shaped front landing legs matching DJI Lito 1 photos (y = -0.062 down to -0.22)
    if (spec.isFront) {
      const legHeight = spec.motorPos.y - -0.214;
      const legGeo = trackGeo(new THREE.BoxGeometry(0.024, legHeight, 0.03));
      const leg = new THREE.Mesh(legGeo, shellMat);
      leg.position.set(spec.motorPos.x, spec.motorPos.y - legHeight * 0.5 - 0.004, spec.motorPos.z);
      leg.castShadow = true;
      root.add(leg);

      const foot = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.026, 0.011, 0.034)),
        rubberMat
      );
      foot.position.set(spec.motorPos.x, -0.214, spec.motorPos.z);
      root.add(foot);
    }

    // Tapered dual-blade folding propeller with matte hub + bright orange tips
    const propGroup = new THREE.Group();
    propGroup.position.set(spec.motorPos.x, spec.motorPos.y + 0.036, spec.motorPos.z);
    propGroup.userData.spinDir = spec.spinDir;

    const cap = new THREE.Mesh(rotorCapGeo, darkTrimMat);
    propGroup.add(cap);

    const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
    blade1.position.set(0.008, 0.002, 0);
    blade1.rotation.x = 0.14 * spec.spinDir;
    propGroup.add(blade1);

    const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
    blade2.position.set(-0.008, 0.002, 0);
    blade2.rotation.y = Math.PI;
    blade2.rotation.x = -0.14 * spec.spinDir;
    propGroup.add(blade2);

    root.add(propGroup);
    propellers.push(propGroup);

    const blurDisc = new THREE.Mesh(blurGeo, blurMat);
    blurDisc.position.set(spec.motorPos.x, spec.motorPos.y + 0.037, spec.motorPos.z);
    blurDisc.visible = false;
    root.add(blurDisc);
    propBlurDiscs.push(blurDisc);

    const led = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.013, 10, 10)),
      spec.isFront ? frontLedMat : rearLedMat
    );
    led.position.set(
      spec.motorPos.x,
      spec.isFront ? spec.motorPos.y - 0.018 : spec.motorPos.y - 0.015,
      spec.isFront ? spec.motorPos.z - 0.018 : spec.motorPos.z + 0.022
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
