import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLLoader } from 'three/addons/loaders/VRMLLoader.js';
import { partWorld } from './layout.js';

// These are links to original CAD files, not copies bundled with PEDALFORM.
// They are specific commercial components, not universal replacements for a category.
const ROOT = 'https://raw.githubusercontent.com/whbeers/noise_floor/master/hardware/noise_floor.pretty/';
export const CAD_CATALOG = Object.freeze({
  footswitch: [{
    id: 'alpha-sf17020',
    label: 'Alpha SF17020F-0302-21R-L (3PDT / STEP)',
    name: 'SF17020F-0302-21R-L.step',
    url: ROOT + 'SF17020F-0302-21R-L.step',
    axis: '+z',
    outside: 19,
    note: 'Alpha 3PDT solder-lug footswitch. M12 x 0.75.',
  }],
  audioJack: [{
    id: 'amphenol-acjs-mhom',
    jackType: 'box-amphenol',
    label: '박스형 Amphenol ACJS-MHOM · 실물 STEP (PJ-612A 아님)',
    name: 'ACJS-MHOM.stp',
    url: ROOT + 'ACJS-MHOM.stp',
    axis: '+z',
    // STEP cylindrical surfaces place the connector and nut axis at X=Y=0,
    // with the outer washer/nut at Z=0 (not at the bounding-box centre).
    mountPoint: [0, 0, 0],
    outside: 8.7,
    fallbackUrl: 'https://cdn.jsdelivr.net/gh/whbeers/noise_floor@master/hardware/noise_floor.pretty/ACJS-MHOM.stp',
    note: 'Amphenol 6.35mm closed plastic housing and threaded metal bushing; original external STEP. This is NOT PJ-612A.',
  }, {
    id: 'hooya-pj609ba',
    jackType: 'turtle-pj609ba',
    label: '거북형 HOOYA PJ-609BA 6핀 · 실물 KiCad VRML (RPJ-303 아님)',
    name: 'jack_6.35mm_female.wrl',
    url: 'https://raw.githubusercontent.com/dvhx/perfect-pedal-layout/master/kicad/footprints/wrl/jack_6.35mm_female.wrl',
    axis: '+y', outside: 5,
    note: 'Public pedal PCB model of 6.35mm HOOYA PJ-609BA six-pin stereo jack. GPL-3.0 source. Not the RPJ-303 SKU.',
  }],
  potentiometer: [{
    id: 'alpha-rv16af-41-15r1',
    label: 'Alpha RV16AF-41-15R1 16mm (공개 FreeCAD STEP)',
    name: 'th-potentiometer-rv16af-41-15r1.step',
    url: 'https://raw.githubusercontent.com/ygn-effects/library-eda-3d-models/main/electromechanicals/potentiometers/th-potentiometer-rv16af-41-15r1/th-potentiometer-rv16af-41-15r1.step',
    axis: '+z',
    // The actual shaft cylinder is centred at X=0,Y=0, extends to Z=24.1;
    // its 15 mm exposed shaft defines a panel reference plane at Z=9.1.
    mountPoint: [0, 0, 9.1],
    outside: 15,
    note: 'YGN Effects 공개 CAD: FreeCAD 원본+STEP, Alpha RV16AF-41-15R1 PCB 타입. CC0로 공개된 제품별 3D 모델입니다.',
  }, {
    id: 'alpha-rd901f',
    label: 'Alpha RD901F 9mm (기본 16mm 모델과 다름)',
    name: 'RD901F-40-15R1.step',
    url: ROOT + 'RD901F-40-15R1.step',
    axis: '+z',
    outside: 14,
    note: '9mm PCB 포텐셔미터의 실제 STEP. RV16 16mm 제품에는 적용하지 마세요.',
  }],
  toggle: [{
    id: 'spdt-switch',
    label: 'SPDT Toggle Switch (STEP)',
    name: 'SPDT_Toggle_Switch.stp',
    url: ROOT + 'SPDT_Toggle_Switch.stp',
    axis: '+z',
    outside: 13,
    note: 'Reference SPDT switch, exact SKU unspecified.',
  }],
  dcJack: [{
    id: 'ds-210',
    label: 'DS-210 DC jack (STEP — 실물 확인 필요)',
    name: 'DS-210.step',
    url: ROOT + 'DS-210.step',
    axis: '+z',
    outside: 4,
    note: 'Check mounting style and panel cutout against your actual connector.',
  }],
  led: [],
});
const OCCT_BASE = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
let occtPromise = null;
const urlCache = new Map();
const axisDirections = {
  '+x': new THREE.Vector3(1, 0, 0),
  '-x': new THREE.Vector3(-1, 0, 0),
  '+y': new THREE.Vector3(0, 1, 0),
  '-y': new THREE.Vector3(0, -1, 0),
  '+z': new THREE.Vector3(0, 0, 1),
  '-z': new THREE.Vector3(0, 0, -1),
};

function getOcct() {
  if (occtPromise) return occtPromise;
  occtPromise = new Promise((resolve, reject) => {
    function start() {
      if (typeof window.occtimportjs !== 'function') {
        reject(new Error('STEP 변환 엔진을 불러오지 못했습니다.'));
        return;
      }
      window.occtimportjs({ locateFile: name => OCCT_BASE + name }).then(resolve, reject);
    }
    if (typeof window.occtimportjs === 'function') {
      start();
    } else {
      const script = document.createElement('script');
      script.src = OCCT_BASE + 'occt-import-js.js';
      script.async = true;
      script.onload = start;
      script.onerror = () => reject(new Error('STEP 변환 엔진 CDN을 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));
      document.head.appendChild(script);
    }
  }).catch(error => {
    occtPromise = null;
    throw error;
  });
  return occtPromise;
}

function stepToGroup(result) {
  if (!result?.success || !Array.isArray(result.meshes) || result.meshes.length === 0) {
    throw new Error('STEP 형상을 변환할 수 없습니다.');
  }
  const group = new THREE.Group();
  for (const source of result.meshes) {
    const positions = source.attributes?.position?.array;
    if (!positions?.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat ? positions.flat(Infinity) : positions, 3));
    const normals = source.attributes?.normal?.array;
    if (normals?.length) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals.flat ? normals.flat(Infinity) : normals, 3));
    }
    const indices = source.index?.array;
    if (indices?.length) {
      geometry.setIndex(indices.flat ? indices.flat(Infinity) : indices);
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const color = Array.isArray(source.color) && source.color.length >= 3
      ? new THREE.Color().setRGB(source.color[0], source.color[1], source.color[2])
      : new THREE.Color('#aab5bd');
    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.24, roughness: 0.53, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(geometry, material));
  }
  if (!group.children.length) throw new Error('변환된 STEP 모델에 메시가 없습니다.');
  return group;
}

export async function importCadBuffer(buffer, filename) {
  const extension = String(filename).split('.').pop().toLowerCase();
  if (['step', 'stp', 'iges', 'igs', 'brep'].includes(extension)) {
    const occt = await getOcct();
    const bytes = new Uint8Array(buffer);
    const triangulation = { linearUnit: 'millimeter', linearDeflectionType: 'absolute_value', linearDeflection: 0.12, angularDeflection: 0.35 };
    const result = ['step', 'stp'].includes(extension)
      ? occt.ReadStepFile(bytes, triangulation)
      : ['iges', 'igs'].includes(extension)
        ? occt.ReadIgesFile(bytes, triangulation)
        : occt.ReadBrepFile(bytes, triangulation);
    return stepToGroup(result);
  }
  if (extension === 'stl') {
    const geometry = new STLLoader().parse(buffer);
    return new THREE.Group().add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: '#b7c5c8', metalness: 0.2, roughness: 0.55, side: THREE.DoubleSide,
    })));
  }
  if (extension === 'obj') {
    return new OBJLoader().parse(new TextDecoder().decode(buffer));
  }
  if (extension === 'wrl' || extension === 'vrml') {
    // Source footprint rescales the raw VRML 0.3937 in KiCad, cancelling
    // its 2.54 unit multiplier; raw coordinates are mm-sized.
    const root = new VRMLLoader().parse(new TextDecoder().decode(buffer));
    if (!root?.children?.length) throw new Error('VRML에서 모델을 읽지 못했습니다.');
    return root;
  }
  if (extension === 'glb') {
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    return gltf.scene;
  }
  throw new Error('지원 형식: STEP/STP, IGES/IGS, BREP, STL, OBJ, GLB, WRL/VRML');
}
function readyAsset(group, id, label, config = {}) {
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.length()) || size.length() < 0.01 || size.length() > 10000) {
    throw new Error('CAD 모델의 크기를 확인할 수 없습니다.');
  }
  return {
    id, label, group,
    axis: config.axis || '+z',
    outside: config.outside ?? 5,
    offsetX: 0, offsetY: 0, offsetZ: 0,
    dimensions: [size.x, size.y, size.z],
    url: config.url || null,
    note: config.note || '',
    mountPoint: Array.isArray(config.mountPoint) ? [...config.mountPoint] : null,
  };
}
export async function loadCatalogCad(type, id) {
  const item = (CAD_CATALOG[type] || []).find(entry => entry.id === id);
  if (!item) throw new Error('CAD 목록에서 모델을 찾을 수 없습니다.');
  if (!urlCache.has(item.url)) {
    const task = (async () => {
      let primaryError = null;
      for (const source of [item.url, item.fallbackUrl].filter(Boolean)) {
        try {
          const response = await fetch(source);
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const buffer = await response.arrayBuffer();
          if (!buffer.byteLength) throw new Error('빈 CAD 파일');
          return await importCadBuffer(buffer, item.name);
        } catch (error) {
          primaryError = error;
        }
      }
      throw new Error('CAD 파일 다운로드 또는 변환 실패: ' + (primaryError?.message || '원인 불명'));
    })();
    urlCache.set(item.url, task);
    task.catch(() => urlCache.delete(item.url));
  }
  const group = await urlCache.get(item.url);
  return readyAsset(group, item.id, item.label, item);
}
export async function loadLocalCad(file) {
  if (file.size > 35 * 1024 * 1024) throw new Error('CAD 파일은 35MB 이하여야 합니다.');
  const group = await importCadBuffer(await file.arrayBuffer(), file.name);
  return readyAsset(group, 'local', file.name, { note: '브라우저에서만 불러온 개인용 CAD 파일' });
}
export function makeMountedCadPart(part, preset, wall, asset) {
  const holder = new THREE.Group();
  const source = asset.group.clone(true);
  const transform = new THREE.Group();
  transform.add(source);
  transform.quaternion.setFromUnitVectors(axisDirections[asset.axis] || axisDirections['+z'], new THREE.Vector3(0, 1, 0));
  transform.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(transform);
  // Product CAD has an explicit mounting/shaft origin. Never centre its
  // entire AABB: asymmetric solder lugs and housings shift the box centre
  // away from the actual panel hole axis.
  if (Array.isArray(asset.mountPoint) && asset.mountPoint.length === 3) {
    const mount = new THREE.Vector3(...asset.mountPoint).applyQuaternion(transform.quaternion);
    const defaultOutside = bounds.max.y - mount.y;
    transform.position.set(
      -mount.x + (asset.offsetX || 0),
      -mount.y + ((asset.outside ?? defaultOutside) - defaultOutside) + (asset.offsetY || 0),
      -mount.z + (asset.offsetZ || 0),
    );
  } else {
    const center = bounds.getCenter(new THREE.Vector3());
    transform.position.set(-center.x + (asset.offsetX || 0), asset.outside - bounds.max.y + (asset.offsetY || 0), -center.z + (asset.offsetZ || 0));
  }
  holder.add(transform);
  const world = partWorld(part, preset, wall, wall / 2);
  holder.position.set(...world.position);
  holder.rotation.set(...world.rotation);
  // partWorld supplies the outward normal for each of the five faces.
  holder.userData.linkedCad = true;
  return holder;
}
// Broad-phase check of actual imported CAD triangles' world-space bounds against PCB.
// Conservative by design: overlap is a possible collision, not proof of mesh intersection.
export function checkImportedCadBoards(parts, boards, preset, wall, assets) {
  const warnings = [];
  for (const part of parts) {
    const asset = assets[part.id];
    if (!asset) continue;
    const model = makeMountedCadPart(part, preset, wall, asset);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    for (const board of boards) {
      const pcb = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(board.x, board.bottomY + board.thickness / 2, board.z),
        new THREE.Vector3(board.width, board.thickness, board.length),
      );
      if (bounds.intersectsBox(pcb)) warnings.push({
        id: part.id,
        error: part.id + ' / ' + board.name + ': 불러온 CAD 외형이 PCB와 겹칠 가능성이 있습니다. (AABB 경고)',
      });
    }
  }
  return warnings;
}
export function disposeCadGroup(group) {
  group.traverse(node => {
    if (node.isMesh) {
      node.geometry?.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) material?.dispose();
    }
  });
}
