import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { WorldTextureBundle } from './proceduralTextures';

export interface OutdoorEnvironmentHandle {
  envMap: THREE.Texture;
  sunDirection: THREE.Vector3;
  dispose: () => void;
}

/**
 * Generates an outdoor HDRI-style IBL environment map using the procedural atmospheric Sky,
 * sun highlight disc, and valley ground bounce so metals, water, glass, and drone canopies
 * reflect authentic sky blue, warm sun glints, and natural valley terrain.
 */
export function createOutdoorEnvironment(renderer: THREE.WebGLRenderer): OutdoorEnvironmentHandle {
  const envScene = new THREE.Scene();

  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  const skyUniforms = envSky.material.uniforms;
  skyUniforms['turbidity'].value = 1.6;
  skyUniforms['rayleigh'].value = 3.0;
  skyUniforms['mieCoefficient'].value = 0.0012;
  skyUniforms['mieDirectionalG'].value = 0.76;
  skyUniforms['cloudCoverage'].value = 0.38;
  skyUniforms['cloudDensity'].value = 0.48;
  skyUniforms['cloudElevation'].value = 0.48;
  skyUniforms['showSunDisc'].value = 0;

  const sunDirection = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(90 - 32); // 32 deg crisp golden-afternoon key elevation
  const theta = THREE.MathUtils.degToRad(42); // Shines from SE over camera shoulder onto north valley (-Z)
  sunDirection.setFromSphericalCoords(1, phi, theta).normalize();
  skyUniforms['sunPosition'].value.copy(sunDirection);
  envScene.add(envSky);

  // Lower hemisphere valley ground bounce sphere so downward normals don't reflect black void
  const groundGeo = new THREE.SphereGeometry(480, 24, 12, 0, Math.PI * 2, Math.PI * 0.505, Math.PI * 0.495);
  const groundMat = new THREE.MeshBasicMaterial({
    color: 0x3b4d30,
    side: THREE.BackSide,
  });
  const groundBowl = new THREE.Mesh(groundGeo, groundMat);
  envScene.add(groundBowl);

  // Subtle horizon warm mist ring for smooth sky-to-ground IBL transition
  const mistGeo = new THREE.CylinderGeometry(475, 475, 45, 32, 1, true);
  const mistMat = new THREE.MeshBasicMaterial({
    color: 0xc8d9e6,
    transparent: true,
    opacity: 0.65,
    side: THREE.BackSide,
  });
  const mistRing = new THREE.Mesh(mistGeo, mistMat);
  mistRing.position.y = -4;
  envScene.add(mistRing);

  // Bright solar reflection disc in sun direction for crisp clearcoat/lens specular glints
  const sunDiscGeo = new THREE.CircleGeometry(20, 24);
  const sunDiscMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.6, 2.25, 1.75),
    side: THREE.DoubleSide,
  });
  const sunDisc = new THREE.Mesh(sunDiscGeo, sunDiscMat);
  sunDisc.position.copy(sunDirection).multiplyScalar(420);
  sunDisc.lookAt(0, 0, 0);
  envScene.add(sunDisc);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const renderTarget = pmrem.fromScene(envScene, 0.025);
  const envMap = renderTarget.texture;

  // Clean up temporary geometry & PMREM generator immediately
  groundGeo.dispose();
  groundMat.dispose();
  mistGeo.dispose();
  mistMat.dispose();
  sunDiscGeo.dispose();
  sunDiscMat.dispose();
  envSky.geometry.dispose();
  (envSky.material as THREE.Material).dispose();
  pmrem.dispose();

  return {
    envMap,
    sunDirection,
    dispose: () => {
      renderTarget.dispose();
    },
  };
}

/**
 * Multi-biome PBR terrain material with custom GLSL world-space splatting:
 * - Blends Grass, Gravel/Trail, Alpine Rock (slope + altitude), and Damp Shore Silt
 * - Dual-octave UV sampling + macro FBM modulation eliminates visible texture tiling
 * - Perturbs surface normals and roughness per-biome
 */
export function createRealisticTerrainMaterial(textures: WorldTextureBundle): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.26,
    normalMap: textures.terrain.grass.normalMap,
    roughnessMap: textures.terrain.grass.roughnessMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassMap = { value: textures.terrain.grass.map };
    shader.uniforms.uGrassNorm = { value: textures.terrain.grass.normalMap };
    shader.uniforms.uGrassRough = { value: textures.terrain.grass.roughnessMap };

    shader.uniforms.uGravelMap = { value: textures.terrain.gravel.map };
    shader.uniforms.uGravelNorm = { value: textures.terrain.gravel.normalMap };
    shader.uniforms.uGravelRough = { value: textures.terrain.gravel.roughnessMap };

    shader.uniforms.uRockMap = { value: textures.terrain.rock.map };
    shader.uniforms.uRockNorm = { value: textures.terrain.rock.normalMap };
    shader.uniforms.uRockRough = { value: textures.terrain.rock.roughnessMap };

    shader.uniforms.uShoreMap = { value: textures.terrain.shore.map };
    shader.uniforms.uShoreNorm = { value: textures.terrain.shore.normalMap };
    shader.uniforms.uShoreRough = { value: textures.terrain.shore.roughnessMap };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aSplat;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec3 vSplat;
        `
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        vSplat = aSplat;
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uGrassMap;
        uniform sampler2D uGrassNorm;
        uniform sampler2D uGrassRough;
        uniform sampler2D uGravelMap;
        uniform sampler2D uGravelNorm;
        uniform sampler2D uGravelRough;
        uniform sampler2D uRockMap;
        uniform sampler2D uRockNorm;
        uniform sampler2D uRockRough;
        uniform sampler2D uShoreMap;
        uniform sampler2D uShoreNorm;
        uniform sampler2D uShoreRough;

        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec3 vSplat;

        float terrainHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float terrainNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), u.x),
            mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float terrainFbm(vec2 p) {
          float s = 0.0;
          s += 0.55 * terrainNoise(p);
          s += 0.30 * terrainNoise(p * 2.13 + vec2(17.3, 9.2));
          s += 0.15 * terrainNoise(p * 4.47 + vec2(5.1, 23.7));
          return s;
        }
        `
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 tUvNear = vWorldPos.xz * 0.34;
        vec2 tUvFar = vWorldPos.xz * 0.048 + vec2(0.37, 0.71);
        float macroVar = terrainFbm(vWorldPos.xz * 0.024);
        float detailBreak = terrainNoise(vWorldPos.xz * 0.12);
        float microBlade = 0.88 + 0.24 * terrainNoise(vWorldPos.xz * 2.1);

        vec3 gNear = texture2D(uGrassMap, tUvNear).rgb;
        vec3 gFar = texture2D(uGrassMap, tUvFar).rgb;
        vec3 grassCol = mix(gNear, gFar, 0.34) * (0.80 + 0.36 * macroVar) * microBlade;
        vec3 turfCol = grassCol * vec3(0.96, 1.05, 0.92);
        grassCol = mix(grassCol, turfCol, vSplat.y);

        vec3 gravelCol = mix(
          texture2D(uGravelMap, tUvNear * 1.15).rgb,
          texture2D(uGravelMap, tUvFar * 1.4).rgb,
          0.26
        ) * (0.86 + 0.26 * detailBreak);

        vec3 rockCol = mix(
          texture2D(uRockMap, tUvNear * 0.55).rgb,
          texture2D(uRockMap, tUvFar * 0.65).rgb,
          0.42
        ) * (0.78 + 0.36 * macroVar);

        vec3 shoreCol = texture2D(uShoreMap, tUvNear * 1.1).rgb * (0.84 + 0.28 * detailBreak);

        float slope = 1.0 - clamp(normalize(vWorldNormal).y, 0.0, 1.0);
        float rockMask = clamp(
          max(
            smoothstep(0.18, 0.40, slope + (macroVar - 0.5) * 0.1),
            smoothstep(18.5, 32.0, vWorldPos.y + (macroVar - 0.5) * 5.0)
          ),
          0.0,
          1.0
        );
        float shoreMask = clamp(vSplat.z, 0.0, 1.0) * (1.0 - rockMask * 0.55);
        float roadMask = clamp(vSplat.x * (1.0 - rockMask * 0.7), 0.0, 1.0);

        vec3 blendedAlbedo = grassCol;
        blendedAlbedo = mix(blendedAlbedo, shoreCol, shoreMask);
        blendedAlbedo = mix(blendedAlbedo, gravelCol, roadMask);
        blendedAlbedo = mix(blendedAlbedo, rockCol, rockMask);

        diffuseColor.rgb *= blendedAlbedo;
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `
        float roughnessFactor = roughness;
        vec2 rUvNear = vWorldPos.xz * 0.34;
        float gRough = texture2D(uGrassRough, rUvNear).g;
        float grRough = texture2D(uGravelRough, rUvNear * 1.15).g;
        float rkRough = texture2D(uRockRough, rUvNear * 0.55).g;
        float shRough = texture2D(uShoreRough, rUvNear * 1.1).g;

        float rSlope = 1.0 - clamp(normalize(vWorldNormal).y, 0.0, 1.0);
        float rRockMask = clamp(max(smoothstep(0.18, 0.40, rSlope), smoothstep(18.5, 32.0, vWorldPos.y)), 0.0, 1.0);
        float rShoreMask = clamp(vSplat.z, 0.0, 1.0) * (1.0 - rRockMask * 0.55);
        float rRoadMask = clamp(vSplat.x * (1.0 - rRockMask * 0.7), 0.0, 1.0);

        float blendedRough = gRough;
        blendedRough = mix(blendedRough, shRough, rShoreMask);
        blendedRough = mix(blendedRough, grRough, rRoadMask);
        blendedRough = mix(blendedRough, rkRough, rRockMask);

        roughnessFactor *= clamp(blendedRough, 0.82, 0.98);
        `
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
        vec2 nUv = vWorldPos.xz * 0.34;
        vec3 nGrass = texture2D(uGrassNorm, nUv).xyz * 2.0 - 1.0;
        vec3 nGravel = texture2D(uGravelNorm, nUv * 1.15).xyz * 2.0 - 1.0;
        vec3 nRock = texture2D(uRockNorm, nUv * 0.55).xyz * 2.0 - 1.0;
        vec3 nShore = texture2D(uShoreNorm, nUv * 1.1).xyz * 2.0 - 1.0;

        float nSlope = 1.0 - clamp(normalize(vWorldNormal).y, 0.0, 1.0);
        float nRockMask = clamp(max(smoothstep(0.18, 0.40, nSlope), smoothstep(18.5, 32.0, vWorldPos.y)), 0.0, 1.0);
        float nShoreMask = clamp(vSplat.z, 0.0, 1.0) * (1.0 - nRockMask * 0.55);
        float nRoadMask = clamp(vSplat.x * (1.0 - nRockMask * 0.7), 0.0, 1.0);

        vec3 mapN = nGrass;
        mapN = mix(mapN, nShore, nShoreMask);
        mapN = mix(mapN, nGravel, nRoadMask);
        mapN = mix(mapN, nRock, nRockMask);
        mapN.xy *= mix(0.85, 1.35, nRockMask);

        mat3 worldTbn = getTangentFrame(-vViewPosition, normal, nUv);
        normal = normalize(worldTbn * mapN);
        `
      );
  };

  mat.customProgramCacheKey = () => 'realistic-terrain-splat-v1';
  return mat;
}

export interface RealisticWaterUniforms {
  uTime: { value: number };
  uWindStrength: { value: number };
}

/**
 * Animated lake water shader with multi-octave wave normals, deep sapphire-to-teal
 * absorption, bounded sky-blue Fresnel reflection (prevents horizon-mist white blowout
 * at grazing angles), focused solar glints, and exponential distance fog.
 */
export function createRealisticWaterMaterial(
  lakeCenterX: number,
  lakeCenterZ: number,
  waterRadius: number,
  sunDirection: THREE.Vector3,
  fogColorHex = 0x6e9bc8,
  fogDensity = 0.00048
): { material: THREE.ShaderMaterial; uniforms: RealisticWaterUniforms } {
  const uTime = { value: 0 };
  const uWindStrength = { value: 0.45 };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uWindStrength,
      uLakeCenter: { value: new THREE.Vector2(lakeCenterX, lakeCenterZ) },
      uWaterRadius: { value: waterRadius },
      uSunDir: { value: sunDirection.clone().normalize() },
      uFogColor: { value: new THREE.Color(fogColorHex) },
      uFogDensity: { value: fogDensity },
    },
    vertexShader: `
      varying vec3 vWaterWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWaterWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uWindStrength;
      uniform vec2 uLakeCenter;
      uniform float uWaterRadius;
      uniform vec3 uSunDir;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vWaterWorldPos;

      float waveHeight(vec2 p, float t) {
        float w = 0.0;
        w += sin(dot(p, vec2(0.85, 0.52)) * 1.45 + t * 1.8) * 0.40;
        w += sin(dot(p, vec2(-0.62, 0.78)) * 2.35 - t * 2.2) * 0.28;
        w += sin(dot(p, vec2(0.32, -0.94)) * 4.10 + t * 2.9) * 0.18;
        w += sin(dot(p, vec2(-0.91, -0.41)) * 7.20 - t * 3.6) * 0.10;
        return w;
      }

      void main() {
        float tMove = uTime * (0.85 + uWindStrength * 0.75);
        float eps = 0.18;
        float hC = waveHeight(vWaterWorldPos.xz, tMove);
        float hX = waveHeight(vWaterWorldPos.xz + vec2(eps, 0.0), tMove);
        float hZ = waveHeight(vWaterWorldPos.xz + vec2(0.0, eps), tMove);
        float amp = 0.052 + uWindStrength * 0.042;
        vec3 wNormal = normalize(vec3((hC - hX) * amp / eps, 1.0, (hC - hZ) * amp / eps));

        float radialNorm = clamp(length(vWaterWorldPos.xz - uLakeCenter) / uWaterRadius, 0.0, 1.0);
        float shallowMask = smoothstep(0.66, 0.99, radialNorm);

        vec3 deepWater = vec3(0.032, 0.155, 0.275);
        vec3 midWater = vec3(0.048, 0.245, 0.345);
        vec3 shallowWater = vec3(0.115, 0.325, 0.335);
        vec3 bodyTone = mix(deepWater, midWater, smoothstep(0.0, 0.72, radialNorm));
        bodyTone = mix(bodyTone, shallowWater, shallowMask);

        float sunDiff = 0.52 + 0.48 * max(dot(wNormal, uSunDir), 0.0);
        vec3 litBody = bodyTone * sunDiff * 1.38;

        vec3 viewDir = normalize(cameraPosition - vWaterWorldPos);
        float ndotv = clamp(dot(wNormal, viewDir), 0.04, 1.0);
        // Bounded Fresnel ensures shallow viewing angles reflect rich sky blue instead of washing white
        float fresnel = 0.06 + 0.34 * pow(1.0 - ndotv, 3.6);
        vec3 skyReflect = mix(vec3(0.13, 0.36, 0.64), vec3(0.24, 0.52, 0.82), clamp(wNormal.y * 0.5 + 0.45, 0.0, 1.0));

        vec3 halfVec = normalize(uSunDir + viewDir);
        float spec = pow(max(dot(wNormal, halfVec), 0.0), 190.0);
        vec3 specGlint = vec3(1.0, 0.92, 0.76) * spec * 0.72;

        float foamNoise = 0.5 + 0.5 * sin(vWaterWorldPos.x * 2.4 + vWaterWorldPos.z * 2.1 + uTime * 2.0);
        float shoreFoam = smoothstep(0.935, 0.994, radialNorm + hC * 0.013) * (0.45 + 0.55 * foamNoise);

        vec3 col = mix(litBody, skyReflect, fresnel) + specGlint;
        col = mix(col, vec3(0.76, 0.86, 0.90), shoreFoam * 0.38);

        float viewDist = length(cameraPosition - vWaterWorldPos);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * viewDist * viewDist);
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

        float alpha = mix(0.94, 0.62, smoothstep(0.88, 1.0, radialNorm));
        gl_FragColor = vec4(col, alpha);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: true,
  });

  return { material, uniforms: { uTime, uWindStrength } };
}

export interface WindFoliageUniforms {
  uTime: { value: number };
  uWindStrength: { value: number };
}

/**
 * Alpha-tested evergreen pine foliage material with tangent normal map and subtle wind sway.
 */
export function createWindSwayFoliageMaterial(
  textures: WorldTextureBundle
): { material: THREE.MeshStandardMaterial; uniforms: WindFoliageUniforms } {
  const uniforms: WindFoliageUniforms = {
    uTime: { value: 0 },
    uWindStrength: { value: 0.4 },
  };

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.pineBoughMap,
    normalMap: textures.pineBoughNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    alphaTest: 0.36,
    side: THREE.DoubleSide,
    roughness: 0.84,
    metalness: 0.02,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWindStrength;
        `
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float crownHeight = max(0.0, transformed.y - 2.0);
        float instSeed = 0.0;
        #ifdef USE_INSTANCING
          instSeed = instanceMatrix[3][0] * 0.13 + instanceMatrix[3][2] * 0.17;
        #endif
        float gust = sin(uTime * 1.85 + instSeed + transformed.y * 0.55)
                   + 0.4 * cos(uTime * 3.1 + instSeed * 1.7);
        float swayAmp = (0.022 + uWindStrength * 0.048) * crownHeight * 0.25;
        transformed.x += gust * swayAmp;
        transformed.z += cos(uTime * 1.45 + instSeed) * swayAmp * 0.65;
        `
      );
  };

  material.customProgramCacheKey = () => 'wind-sway-pine-bough-v1';
  return { material, uniforms };
}

/**
 * Alpha-tested grass & lakeside reed tuft material with tip-only wind flutter.
 */
export function createGrassTuftMaterial(
  textures: WorldTextureBundle
): { material: THREE.MeshStandardMaterial; uniforms: WindFoliageUniforms } {
  const uniforms: WindFoliageUniforms = {
    uTime: { value: 0 },
    uWindStrength: { value: 0.4 },
  };

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.grassTuftMap,
    alphaTest: 0.32,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0.0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWindStrength;
        `
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float tipWeight = smoothstep(0.15, 0.95, uv.y);
        float instPhase = 0.0;
        #ifdef USE_INSTANCING
          instPhase = instanceMatrix[3][0] * 0.24 + instanceMatrix[3][2] * 0.19;
        #endif
        float bend = sin(uTime * 2.4 + instPhase) * (0.06 + uWindStrength * 0.12) * tipWeight;
        transformed.x += bend;
        transformed.z += cos(uTime * 1.9 + instPhase) * bend * 0.5;
        `
      );
  };

  material.customProgramCacheKey = () => 'wind-sway-grass-tuft-v1';
  return { material, uniforms };
}

/**
 * Dual-layer drifting sky cloud canopy with golden sun-scatter rims and smooth horizon fadeout.
 */
export function createCloudCanopyMaterial(
  cloudMap: THREE.CanvasTexture,
  sunDirection: THREE.Vector3
): { material: THREE.ShaderMaterial; uTime: { value: number } } {
  const uTime = { value: 0 };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCloudMap: { value: cloudMap },
      uTime,
      uSunDir: { value: sunDirection.clone().normalize() },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldDir;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform sampler2D uCloudMap;
      uniform float uTime;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying vec3 vWorldDir;

      void main() {
        vec2 uv1 = vUv * 2.2 + vec2(uTime * 0.0028, uTime * 0.0012);
        vec2 uv2 = vUv * 4.1 + vec2(-uTime * 0.0016, uTime * 0.0021);
        vec4 c1 = texture2D(uCloudMap, uv1);
        vec4 c2 = texture2D(uCloudMap, uv2);

        float alpha = clamp(c1.a * 0.78 + c2.a * 0.44, 0.0, 0.90);
        // Smooth fade near low horizon so clouds never clip harshly against hills or fog
        float horizonFade = smoothstep(0.06, 0.30, vWorldDir.y);
        alpha *= horizonFade;
        if (alpha < 0.01) discard;

        float sunAlign = max(0.0, dot(normalize(vWorldDir), uSunDir));
        vec3 shadowTint = vec3(0.56, 0.65, 0.77);
        vec3 litTint = mix(vec3(0.99, 0.98, 0.96), vec3(1.0, 0.90, 0.74), pow(sunAlign, 3.5) * 0.65);
        vec3 col = mix(shadowTint, litTint, clamp(c1.r * 0.65 + c2.r * 0.35, 0.0, 1.0));

        gl_FragColor = vec4(col, alpha * 0.88);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
  });

  return { material, uTime };
}
