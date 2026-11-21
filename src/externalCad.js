import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
    label: 'Amphenol ACJS-MHOM (6.35 mm / STEP)',
    name: 'ACJS-MHOM.stp',
    url: ROOT + 'ACJS-MHOM.stp',
    axis: '+z',
    outside: 5,
    note: 'Specific 1/4-inch stereo jack, not Cliff CL1227G.',
  }],
  potentiometer: [{
    id: 'alpha-rd901f',
    label: 'Alpha RD901F 9 mm (STEP — RV16 아님)',
    name: 'RD901F-40-15R1.step',
    url: ROOT + 'RD901F-40-15R1.step',
    axis: '+z',
    outside: 14,
    note: '9 mm PCB potentiometer, different from the default RV16-type 16 mm pot.',
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
  if (extension === 'glb') {
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    return gltf.scene;
  }
  throw new Error('지원 형식: STEP/STP, IGES/IGS, BREP, STL, OBJ, GLB');
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
  };
}
export async function loadCatalogCad(type, id) {
  const item = (CAD_CATALOG[type] || []).find(entry => entry.id === id);
  if (!item) throw new Error('CAD 목록에서 모델을 찾을 수 없습니다.');
  if (!urlCache.has(item.url)) {
    const task = fetch(item.url).then(response => {
      if (!response.ok) throw new Error('원본 CAD 요청 실패 (' + response.status + ')');
      return response.arrayBuffer();
    }).then(buffer => importCadBuffer(buffer, item.name));
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
  const center = bounds.getCenter(new THREE.Vector3());
  transform.position.set(-center.x + (asset.offsetX || 0), asset.outside - bounds.max.y + (asset.offsetY || 0), -center.z + (asset.offsetZ || 0));
  holder.add(transform);
  const world = partWorld(part, preset, wall, wall / 2);
  holder.position.set(...world.position);
  holder.rotation.set(...world.rotation);
  if (part.face === 'back') holder.rotation.x = -Math.PI / 2;
  holder.userData.linkedCad = true;
  return holder;
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
