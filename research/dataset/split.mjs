#!/usr/bin/env node
// Held-out split by session (docs/dataset.md "Splits"): node split.mjs [samples.jsonl]
// A session goes to held-out when sha1(session id) mod 100 < 20, so rebuilding the dataset keeps every session on its side.
// Writes samples-tune.jsonl and samples-heldout.jsonl next to the input.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const HELDOUT_PCT = 20;
export const isHeldout = sid => parseInt(crypto.createHash('sha1').update(String(sid)).digest('hex').slice(0, 8), 16) % 100 < HELDOUT_PCT;

export function writeSplit(file) {
  file ||= path.join(path.dirname(new URL(import.meta.url).pathname), 'samples.jsonl');
  const dir = path.dirname(file);
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());
  const tune = [], held = [];
  const sess = { tune: new Set(), held: new Set() };
  for (const l of lines) {
    const sid = JSON.parse(l).session;
    if (!sid) throw new Error(`sample without session: ${l.slice(0, 80)}`);
    if (isHeldout(sid)) { held.push(l); sess.held.add(sid); } else { tune.push(l); sess.tune.add(sid); }
  }
  fs.writeFileSync(path.join(dir, 'samples-tune.jsonl'), tune.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'samples-heldout.jsonl'), held.join('\n') + '\n');
  const all = sess.tune.size + sess.held.size;
  console.log(`sessions: ${all} -> tune ${sess.tune.size}, held-out ${sess.held.size} (${(100 * sess.held.size / all).toFixed(1)}%)`);
  console.log(`samples:  ${lines.length} -> tune ${tune.length}, held-out ${held.length} (${(100 * held.length / lines.length).toFixed(1)}%)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) writeSplit(process.argv[2]);
