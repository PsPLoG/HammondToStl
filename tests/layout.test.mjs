import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARTS, DEFAULT_SETTINGS, ENCLOSURES } from '../src/presets.js';
import { faceSize, edgeDistances, layoutIssues, moveWithSnap, distribute, partWorld, safePosition, issueForPart, assemblyIssues } from '../src/layout.js';

const settings = { ...DEFAULT_SETTINGS };

test('all five faces have correct editable physical dimensions', () => {
  assert.deepEqual(faceSize('1590B', 'top').width, 60.5);
  assert.deepEqual(faceSize('1590B', 'top').height, 112.4);
  assert.equal(faceSize('1590B', 'front').width, 60.5);
  assert.equal(faceSize('1590B', 'left').width, 112.4);
  assert.equal(faceSize('1590B', 'right').height, 27.8);
});

test('default example is clear on all five faces', () => {
  assert.deepEqual(layoutIssues(DEFAULT_PARTS, settings), []);
});

test('wall clearance is measured from the keepout edge', () => {
  const p = { id:'a', type:'led', face:'top', hole:5, keepout:10, u:0, v:0 };
  assert.deepEqual(edgeDistances(p, settings), { left:25.3, right:25.3, top:51.2, bottom:51.2 });
});

test('collision and enclosure bounds both reject invalid placement', () => {
  const p = { id:'a', type:'led', face:'top', hole:5, keepout:10, u:0, v:0 };
  const q = { ...p, id:'b', u:9 };
  assert.ok(issueForPart(p, [p, q], settings));
  const outside = { ...p, u:29 };
  assert.ok(issueForPart(outside, [outside], settings));
});

test('drag snaps to a peer centre but Shift bypasses it', () => {
  const p = { id:'a', type:'led', face:'top', hole:5, keepout:10, u:0, v:10 };
  const q = { ...p, id:'b', u:12, v:17 };
  assert.equal(moveWithSnap(p, 12.6, 17.5, [p,q], settings).u, 12);
  assert.equal(moveWithSnap(p, 12.6, 17.5, [p,q], settings, true).u, 12.6);
});

test('equal distribution accounts for different part footprints', () => {
  const arr = [
    { id:'a',face:'top',hole:7,keepout:16,u:-15,v:0 },
    { id:'b',face:'top',hole:5,keepout:9,u:0,v:0 },
    { id:'c',face:'top',hole:7,keepout:16,u:15,v:0 },
  ];
  const outcome = distribute(arr, 'top', 'u', settings);
  assert.equal(outcome.error, undefined);
  assert.deepEqual(layoutIssues(outcome.parts, settings), []);
  const [a,b,c] = outcome.parts;
  const g1 = b.u-a.u-(a.keepout+b.keepout)/2;
  const g2 = c.u-b.u-(b.keepout+c.keepout)/2;
  assert.ok(Math.abs(g1-g2) < 0.15);
});

test('rejects impossible auto-spacing and supports safe boundaries', () => {
  const tooLarge = [
    {id:'a',face:'front',hole:12,keepout:25,u:0,v:0},
    {id:'b',face:'front',hole:12,keepout:25,u:0,v:0},
  ];
  const outcome = distribute(tooLarge,'front','v',settings);
  assert.ok(outcome.error);
  const boundary = safePosition({id:'a',face:'top',hole:5,keepout:10,u:900,v:-900},settings);
  assert.ok(Math.abs(boundary.u) < 28);
  assert.ok(Math.abs(boundary.v) < 54);
});

test('face-to-world transforms agree with exported geometry axes', () => {
  const p = {u:7,v:11,face:'top'};
  assert.deepEqual(partWorld(p, ENCLOSURES['1590B'], 2.6).position, [7,26.5,11]);
  assert.deepEqual(partWorld({...p,face:'front'},ENCLOSURES['1590B'],2.6).position,[7,2.9000000000000004,54.900000000000006]);
  assert.deepEqual(partWorld({...p,face:'right'},ENCLOSURES['1590B'],2.6).position,[28.95,2.9000000000000004,7]);
});

test('magnet pocket depth must leave a printable floor', () => {
  assert.equal(assemblyIssues(settings).length, 0);
  assert.equal(assemblyIssues({...settings, closure:'magnet', lidThickness:2.6, magnetDepth:2.5}).length, 1);
});

test('rounded top corners reject otherwise in-bounds hole footprints', () => {
  const p = {id:'corner',face:'top',hole:3,keepout:5,u:24.75,v:50.7};
  assert.ok(issueForPart(p, [p], settings));
});
