import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION } from 'three-bvh-csg';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { zipSync } from 'fflate';
import { strToU8 } from 'fflate';
import { partWorld } from './layout.js';
import { COMPACT_SCREW, getFastenerLayout, getCornerWebs } from './fasteners.js';


function roundedRectangle(w, l, radius) {
  const r = Math.min(Math.max(radius, 0.5), w / 2 - 0.1, l / 2 - 0.1);
  const x = w / 2;
  const y = l / 2;
  const s = new THREE.Shape();
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  s.closePath();
  return s;
}

// Extrusion's normal +Z is rotated to world +Y; the visible top is +Y.
function roundedPlate(w, l, radius, depth, baseY) {
  const geo = new THREE.ExtrudeGeometry(roundedRectangle(w, l, radius), {
    depth, steps: 1, curveSegments: 10, bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, baseY, 0);
  // The CSG library requires geometry with matching attribute sets.
  geo.deleteAttribute('uv');
  return geo;
}

function brush(geometry, position = null, rotation = null) {
  geometry.deleteAttribute('uv');
  const b = new Brush(geometry);
  if (position) b.position.set(...position);
  if (rotation) b.rotation.set(...rotation);
  b.updateMatrixWorld(true);
  return b;
}

class CSGBuilder {
  constructor(geometry) {
    this.evaluator = new Evaluator();
    this.evaluator.useGroups = false;
    this.evaluator.attributes = ['position', 'normal'];
    this.result = brush(geometry);
  }
  apply(geometry, operation, position = null, rotation = null) {
    const operand = brush(geometry, position, rotation);
    this.result.updateMatrixWorld(true);
    const next = this.evaluator.evaluate(this.result, operand, operation);
    if (this.result.geometry !== next.geometry) this.result.geometry.dispose();
    operand.geometry.dispose();
    next.position.set(0, 0, 0);
    next.rotation.set(0, 0, 0);
    next.scale.set(1, 1, 1);
    next.updateMatrixWorld(true);
    this.result = next;
  }
  finish() {
    const out = this.result;
    // Preserve CSG draw ranges in preview; STL output separately trims them.
    out.geometry.computeVertexNormals();
    return out;
  }
}

// Single source of truth for CSG reinforcement and the visible inspection overlay.
export function makeCornerWebGeometry(web, height) {
  const contour = new THREE.Shape();
  // ExtrudeGeometry uses XY. After rotating -90° around X, local -Y becomes world +Z.
  web.points.forEach(([px, pz], index) => index === 0 ?
    contour.moveTo(px, -pz) : contour.lineTo(px, -pz));
  contour.closePath();
  const solid = new THREE.ExtrudeGeometry(contour, {
    depth: height, steps: 1, bevelEnabled: false, curveSegments: 6,
  });
  solid.rotateX(-Math.PI / 2);
  return solid;
}

export function buildShell(preset, settings, parts = []) {
  const { w, l, h, radius } = preset;
  const t = settings.wall;
  const shell = new CSGBuilder(roundedPlate(w, l, radius, h, 0));
  // The cavity extends below the base so it is genuinely open at the bottom.
  shell.apply(roundedPlate(w - 2 * t, l - 2 * t, Math.max(0.7, radius - t), h - t + 3.5, -3.5), SUBTRACTION);

  const mounting = getFastenerLayout(preset, settings);
  const posts = mounting.centers;
  const isScrew = settings.closure === 'screw';
  const height = mounting.bossHeight;
  // Union cylindrical posts first. Each corner web then overlaps BOTH the
  // established post and the existing outer wall, avoiding disconnected or
  // near-coplanar CSG islands on rounded enclosures.
  for (const [x, z] of posts) {
    shell.apply(new THREE.CylinderGeometry(mounting.radius, mounting.radius, height, 40), ADDITION, [x, height / 2, z]);
  }
  // Same solid web geometry is also used by the optional visual overlay.
  // Actual STL geometry receives these full-volume pieces through CSG union.
  for (const web of getCornerWebs(preset, settings)) {
    shell.apply(makeCornerWebGeometry(web, height), ADDITION);
  }
  for (const [x, z] of posts) {
    if (isScrew) {
      // Blind pilot bore. Keep >=1.5 mm of solid material at its upper end.
      const depth = Math.min(8.4, height - 1.5);
      shell.apply(new THREE.CylinderGeometry(COMPACT_SCREW.pilot / 2, COMPACT_SCREW.pilot / 2, depth + 0.2, 40), SUBTRACTION, [x, depth / 2 - 0.1, z]);
    } else {
      const radiusWithTolerance = (settings.magnetDiameter + settings.magnetTolerance) / 2;
      const pocketDepth = settings.magnetDepth + 0.2;
      shell.apply(new THREE.CylinderGeometry(radiusWithTolerance, radiusWithTolerance, pocketDepth + 0.3, 48), SUBTRACTION, [x, pocketDepth / 2 - 0.15, z]);
    }
  }

  for (const p of parts) {
    const xform = partWorld(p, preset, t);
    // Overshooting the wall prevents coplanar CSG seams and through-wall plugs.
    shell.apply(new THREE.CylinderGeometry(p.hole / 2, p.hole / 2, t + 5, 48), SUBTRACTION,
      xform.position, xform.rotation);
  }
  return shell.finish();
}

export function buildLid(preset, settings) {
  const { w, l, radius } = preset;
  const t = settings.lidThickness;
  const lid = new CSGBuilder(roundedPlate(w, l, radius, t, -t));
  const posts = getFastenerLayout(preset, settings).centers;
  if (settings.closure === 'screw') {
    for (const [x, z] of posts) {
      lid.apply(new THREE.CylinderGeometry(COMPACT_SCREW.clearance / 2, COMPACT_SCREW.clearance / 2, t + 2, 36), SUBTRACTION,
        [x, -t / 2, z]);
    }
  } else {
    const d = (settings.magnetDiameter + settings.magnetTolerance) / 2;
    const depth = settings.magnetDepth + 0.2;
    for (const [x, z] of posts) {
      // Mouth on the TOP of the lid faces the case's corresponding pocket.
      lid.apply(new THREE.CylinderGeometry(d, d, depth + 0.35, 48), SUBTRACTION,
        [x, -depth / 2 + 0.15, z]);
    }
  }

  // Four short inward tabs register the plate against the shell's inner walls.
  // They avoid corner fastening posts and retain ~0.35 mm fitting clearance.
  const tongueHeight = 1.7;
  const tongueWidth = 1.2;
  const fit = 0.35;
  const xPos = w / 2 - settings.wall - fit - tongueWidth / 2;
  const zPos = l / 2 - settings.wall - fit - tongueWidth / 2;
  const yPos = tongueHeight / 2 - 0.2;
  for (const sign of [-1, 1]) {
    lid.apply(new THREE.BoxGeometry(tongueWidth, tongueHeight + 0.2, 10), ADDITION, [sign * xPos, yPos, 0]);
    lid.apply(new THREE.BoxGeometry(10, tongueHeight + 0.2, tongueWidth), ADDITION, [0, yPos, sign * zPos]);
  }
  return lid.finish();
}

// STLExporter does not consistently respect the drawRange produced by BVH CSG.
// Explicitly create a triangle-only geometry using only the *drawn* vertices.
export function trimForSTL(mesh) {
  const source = mesh.geometry;
  const pos = source.attributes.position;
  const index = source.index;
  const total = index ? index.count : pos.count;
  const start = Math.min(Math.max(source.drawRange.start || 0, 0), total);
  const count = Math.max(0, Math.min(Number.isFinite(source.drawRange.count) ? source.drawRange.count : total, total - start));
  if (count % 3 !== 0) throw new Error('Malformed CSG triangle range');
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const srcI = index ? index.getX(start + i) : start + i;
    arr[i * 3] = pos.getX(srcI);
    arr[i * 3 + 1] = pos.getY(srcI);
    arr[i * 3 + 2] = pos.getZ(srcI);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo);
}

// Printable M3-ish threaded thumb screw mesh (4 per STL) intended for test prints.
// True fit depends on printer, resin, nozzle, material and slicer calibration.
export function makePrintedScrew() {
  const segments = 48;
  const headR = COMPACT_SCREW.headRadius;
  const headH = COMPACT_SCREW.headHeight;
  const shaftLength = COMPACT_SCREW.shaftLength;
  const pitch = COMPACT_SCREW.pitch;
  const knurled = theta => headR + 0.13 * Math.cos(theta * 12);
  const rings = [
    { y: 0, radius: knurled },
    { y: headH, radius: knurled },
    { y: headH, radius: () => 1.23 },
  ];
  const rowCount = 144;
  for (let j = 0; j <= rowCount; j++) {
    const along = shaftLength * j / rowCount;
    rings.push({
      y: headH + along,
      radius: theta => {
        const fraction = ((along / pitch - theta / (2 * Math.PI)) % 1 + 1) % 1;
        const distance = Math.min(fraction, 1 - fraction);
        const ridge = Math.max(0, 1 - distance / 0.32);
        const tip = Math.min(1, Math.max(0.15, (shaftLength - along) / 0.8));
        return 1.23 + 0.27 * ridge * tip;
      },
    });
  }
  const vertices = [];
  const indices = [];
  for (const ring of rings) {
    for (let i = 0; i < segments; i++) {
      const th = 2 * Math.PI * i / segments;
      const r = ring.radius(th);
      vertices.push(r * Math.cos(th), ring.y, r * Math.sin(th));
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * segments + i;
      const b = j * segments + (i + 1) % segments;
      const c = (j + 1) * segments + i;
      const d = (j + 1) * segments + (i + 1) % segments;
      indices.push(a, c, b, b, c, d);
    }
  }
  const bottomCenter = vertices.length / 3;
  vertices.push(0, 0, 0);
  const topCenter = vertices.length / 3;
  vertices.push(0, headH + shaftLength, 0);
  const last = (rings.length - 1) * segments;
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(bottomCenter, i, next);
    indices.push(topCenter, last + next, last + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo);
}

export function makeFourScrews() {
  const group = new THREE.Group();
  const template = makePrintedScrew();
  for (let i = 0; i < 4; i++) {
    const copy = template.clone();
    copy.position.set((i - 1.5) * 10, 0, 0);
    group.add(copy);
  }
  return group;
}

export function exportBinarySTL(object) {
  const exporter = new STLExporter();
  const data = exporter.parse(object, { binary: true });
  return new Blob([data], { type: 'model/stl' });
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function toBytes(data) {
  if (data instanceof DataView) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new Error('Unsupported STL exporter result');
}

export function modelToSTL(shell, lid, mode, prefix, lidThickness) {
  const shellMesh = trimForSTL(shell);
  const lidMesh = trimForSTL(lid);
  const files = {};
  try {
    files[`${prefix}_body.stl`] = toBytes(new STLExporter().parse(shellMesh, { binary: true }));
    // Move the separate bottom plate upward so its underside sits on Y=0.
    lidMesh.position.y = lidThickness;
    lidMesh.updateMatrixWorld(true);
    files[`${prefix}_bottom_lid.stl`] = toBytes(new STLExporter().parse(lidMesh, { binary: true }));
    if (mode === 'screw') {
      const printed = makeFourScrews();
      files[`${prefix}_M3_printable_screw_x4_TEST.stl`] = toBytes(new STLExporter().parse(printed, { binary: true }));
      printed.children[0].geometry.dispose(); // cloned meshes share the same template geometry
    }
    const archive = zipSync(files, { level: 0 });
    downloadBlob(new Blob([archive], { type: 'application/zip' }), `${prefix}_STL_bundle.zip`);
  } finally {
    shellMesh.geometry.dispose();
    lidMesh.geometry.dispose();
  }
}

export const FASTENER_SPEC = {
  screwMajor: COMPACT_SCREW.major,
  screwPilot: COMPACT_SCREW.pilot,
  screwClearance: COMPACT_SCREW.clearance,
  postRadius: COMPACT_SCREW.postRadius,
};

function meshXml(mesh, id, mat) {
  const g = mesh.geometry, p = g.attributes.position, idx = g.index;
  const count = idx ? idx.count : p.count, vertices = [], triangles = [], indices = [], unique = new Map();
  for (let i=0; i<count; i++) {
    const n = idx ? idx.getX(i) : i;
    const xyz = [p.getX(n), -p.getZ(n), p.getY(n)];
    const key = xyz.map(v=>v.toFixed(5)).join(',');
    let index = unique.get(key);
    if (index === undefined) {
      index = vertices.length;
      unique.set(key,index);
      vertices.push('<vertex x="'+xyz[0]+'" y="'+xyz[1]+'" z="'+xyz[2]+'"/>');
    }
    indices.push(index);
  }
  for (let i=0; i+2<indices.length; i+=3) {
    const [a,b,c] = indices.slice(i,i+3);
    if(a!==b&&b!==c&&a!==c) triangles.push('<triangle v1="'+a+'" v2="'+b+'" v3="'+c+'"/>');
  }
  return '<object id="'+id+'" type="model" pid="1" pindex="'+mat+'"><mesh><vertices>'+vertices.join('')+'</vertices><triangles>'+triangles.join('')+'</triangles></mesh></object>';
}

export function export3MF(shell, lid, prefix, lidThickness) {
  const body = trimForSTL(shell), plate = trimForSTL(lid);
  try {
    // Keep the actual assembly coordinates in the 3MF, unlike separate STL
    // files which are arranged independently for printing.
    const model = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<model unit="millimeter" xml:lang="ko-KR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
      '<metadata name="Title">PEDALFORM enclosure assembly</metadata><resources>' +
      '<basematerials id="1"><base name="Enclosure" displaycolor="#8CA4A5FF"/><base name="Bottom lid" displaycolor="#6B888BFF"/></basematerials>' +
      meshXml(body,2,0)+meshXml(plate,3,1) +
      '</resources><build><item objectid="2"/><item objectid="3"/></build></model>';
    const files = {
      '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/></Relationships>'),
      '3D/3dmodel.model': strToU8(model),
    };
    const archive = zipSync(files,{level:6});
    downloadBlob(new Blob([archive],{type:'model/3mf'}),prefix+'_Bambu_Studio.3mf');
  } finally {
    body.geometry.dispose();plate.geometry.dispose();
  }
}
