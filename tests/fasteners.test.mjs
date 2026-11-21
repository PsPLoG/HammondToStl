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

test('corner webs bridge each boss to the adjacent walls without protruding', () => {
  for (const preset of Object.values(ENCLOSURES)) {
    for (const wall of [2, 2.4, 5]) {
      for (const closure of ['screw', 'magnet']) {
        const settings = { ...screw, wall, closure };
        const m = getFastenerLayout(preset, settings);
        const webs = getCornerWebs(preset, settings);
        assert.equal(webs.length, 4);
        webs.forEach((web, i) => {
          const [x,z] = m.centers[i];
          assert.ok(web.width > 0 && web.length > 0);
          assert.equal(Math.sign(web.x), Math.sign(x));
          assert.equal(Math.sign(web.z), Math.sign(z));
          const farX = Math.abs(web.x) + web.width / 2;
          const farZ = Math.abs(web.z) + web.length / 2;
          close(farX, preset.w / 2 - wall - 0.35);
          close(farZ, preset.l / 2 - wall - 0.35);
          assert.ok(outlineClearance(preset, farX, farZ) >= -0.01,
            preset.code + ' reinforcement extends outside rounded enclosure');
          assert.ok(Math.abs(web.x) - web.width / 2 < Math.abs(x),
            'reinforcement must overlap its round boss');
        });
      }
    }
  }
});
