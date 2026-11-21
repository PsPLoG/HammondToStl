import test from 'node:test';
import assert from 'node:assert/strict';
import { ENCLOSURES, DEFAULT_SETTINGS } from '../src/presets.js';
import { COMPACT_SCREW, getFastenerLayout, getCornerWebs, outlineClearance, interiorCompliance } from '../src/fasteners.js';
import { assemblyIssues } from '../src/layout.js';

const screw = { ...DEFAULT_SETTINGS, closure: 'screw' };
const close = (a,b,tolerance=0.005) => assert.ok(Math.abs(a-b)<tolerance, `${a} is not close to ${b}`);

test('M3 small-boss dimensions preserve a 1.775 mm printable ring', () => {
  close(COMPACT_SCREW.postRadius * 2, 6.0);
  close(COMPACT_SCREW.postRadius - COMPACT_SCREW.pilot / 2, 1.775);
});

test('1590A uses Hammond drawing X and Z mounting pitches', () => {
  const m = getFastenerLayout(ENCLOSURES['1590A'], screw);
  close(m.centers[1][0] - m.centers[0][0], 28.5);
  close(m.centers[2][1] - m.centers[0][1], 82.6);
  close(m.cornerClearWidth, 22.5);
  close(m.cornerClearLength, 76.6);
  close(m.insideWidth, 33.7);
  close(m.insideLength, 87.8);
});

test('1590B restores factory drawing screw-boss clear space', () => {
  const m = getFastenerLayout(ENCLOSURES['1590B'], screw);
  close(m.centers[1][0] - m.centers[0][0], 50.5);
  close(m.centers[2][1] - m.centers[0][1], 102.1);
  close(m.cornerClearWidth, 44.5);
  close(m.cornerClearLength, 96.1);
  assert.ok(m.insideWidth >= 55.45);
  assert.ok(m.insideLength >= 107.05);
});

test('every fastener cylinder fits rounded outer profile without protrusion', () => {
  for (const p of Object.values(ENCLOSURES)) {
    for (const s of [screw, { ...screw, closure:'magnet', magnetDiameter:8, magnetTolerance:0.8 }]) {
      const m = getFastenerLayout(p, s);
      assert.equal(m.centers.length, 4);
      for (const [x,z] of m.centers) {
        assert.ok(outlineClearance(p,x,z) >= m.radius + 1.19, `${p.code} boss protrudes outside`);
      }
      assert.ok(m.cornerClearWidth > 0);
      assert.ok(m.cornerClearLength > 0);
    }
  }
});

test('bigger wall thickness flags missing Hammond internal XY space', () => {
  assert.equal(interiorCompliance(ENCLOSURES['1590B'], screw).passes, true);
  const tooThick = { ...screw, wall:3.2 };
  assert.equal(interiorCompliance(ENCLOSURES['1590B'], tooThick).passes, false);
  assert.ok(assemblyIssues(tooThick).some(i=>i.id === 'inside-size'));
});

test('125B profile is explicitly approximate and not falsely certified', () => {
  const fit = interiorCompliance(ENCLOSURES['125B'], screw);
  assert.equal(fit.measured, false);
  assert.equal(fit.passes, true);
});


test('full-height corner pillars reach the roof and bottom plane', () => {
  for (const preset of Object.values(ENCLOSURES)) {
    for (const closure of ['screw', 'magnet']) {
      const settings = { ...screw, closure };
      const m = getFastenerLayout(preset, settings);
      close(m.bossHeight, preset.h - settings.wall + 0.45);
      assert.ok(m.bossHeight > preset.h * 0.7);
    }
  }
});

test('solid corner polygons overlap both walls without enlarging outside outline', () => {
  for (const preset of Object.values(ENCLOSURES)) {
    for (const wall of [2, 2.4, 5]) {
      for (const closure of ['screw', 'magnet']) {
        const settings = { ...screw, wall, closure };
        const mount = getFastenerLayout(preset, settings);
        const webs = getCornerWebs(preset, settings);
        assert.equal(webs.length, 4);
        for (let i = 0; i < 4; i++) {
          const web = webs[i];
          const [x,z] = mount.centers[i];
          assert.ok(web.points.length >= 20);
          assert.ok(web.startX < Math.abs(x) && web.startZ < Math.abs(z));
          assert.ok(web.width > 0 && web.length > 0);
          // The web must enter BOTH existing straight walls: no gap remains.
          assert.ok(web.points.some(([px]) => Math.abs(px) > preset.w/2 - settings.wall),
            preset.code + ' web fails to enter X wall');
          assert.ok(web.points.some(([,pz]) => Math.abs(pz) > preset.l/2 - settings.wall),
            preset.code + ' web fails to enter Z wall');
          for (const [px,pz] of web.points) {
            assert.ok(outlineClearance(preset, px, pz) >= web.exteriorSkin - 0.03,
              preset.code + ' web protrudes outside exterior profile: ' + px + ',' + pz);
          }
        }
      }
    }
  }
});
