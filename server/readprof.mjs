/**
 * Read a V8 .cpuprofile.
 *   node readprof.mjs                 → self time per function
 *   node readprof.mjs --callers NAME  → who spends the time inside NAME
 */
import { readFileSync, readdirSync } from 'node:fs';

const args = process.argv.slice(2);
const callersOf = args.includes('--callers') ? args[args.indexOf('--callers') + 1] : null;
const file = args.find((a) => a.endsWith('.cpuprofile')) ?? readdirSync('.').find((f) => f.endsWith('.cpuprofile'));
const prof = JSON.parse(readFileSync(file, 'utf8'));

const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);

const selfUs = new Map();
for (let i = 0; i < prof.samples.length; i++) {
  const id = prof.samples[i];
  selfUs.set(id, (selfUs.get(id) ?? 0) + (prof.timeDeltas[i] ?? 0));
}

const name = (n) => n.callFrame.functionName || '(anonymous)';
const where = (n) => (n.callFrame.url ? n.callFrame.url.split(/[\\/]/).pop() : '');
const totalUs = prof.endTime - prof.startTime;

if (!callersOf) {
  const agg = new Map();
  for (const [id, us] of selfUs) {
    const n = byId.get(id);
    if (!n) continue;
    const key = `${name(n)}  ${where(n)}`;
    agg.set(key, (agg.get(key) ?? 0) + us);
  }
  console.log(`\ntotal ${(totalUs / 1000).toFixed(0)}ms sampled\n`);
  for (const [key, us] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 28)) {
    const p = (us / totalUs) * 100;
    if (p < 0.4) continue;
    console.log(`  ${p.toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(0).padStart(6)}ms  ${key}`);
  }
} else {
  // Every subtree rooted at a node named `callersOf`, attributed to the nearest
  // enclosing frame with a different name — i.e. who called it.
  const subtree = (id) => {
    let sum = selfUs.get(id) ?? 0;
    for (const c of byId.get(id).children ?? []) sum += subtree(c);
    return sum;
  };
  const agg = new Map();
  let grand = 0;
  for (const n of prof.nodes) {
    if (name(n) !== callersOf) continue;
    // Skip nodes whose parent is also the same function (recursion/inlining).
    const p = byId.get(parent.get(n.id));
    if (p && name(p) === callersOf) continue;
    const us = subtree(n.id);
    grand += us;
    const key = p ? `${name(p)}  ${where(p)}:${p.callFrame.lineNumber + 1}` : '(root)';
    agg.set(key, (agg.get(key) ?? 0) + us);
  }
  console.log(`\n${callersOf}: ${(grand / 1000).toFixed(0)}ms total (${((grand / totalUs) * 100).toFixed(1)}% of ${(totalUs / 1000).toFixed(0)}ms)\n`);
  for (const [key, us] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${((us / grand) * 100).toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(0).padStart(6)}ms  ← ${key}`);
  }
}
