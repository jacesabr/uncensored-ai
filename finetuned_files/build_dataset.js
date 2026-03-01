#!/usr/bin/env node
/**
 * build_dataset.js — Combines all phase files into a single SFT-ready JSONL.
 *
 * Reads:
 *   1. golden_sft.jsonl     (1,615 base records — updates system prompt to full CHARACTER_DEFAULT_PROMPT)
 *   2. phases/phase_01.jsonl through phases/phase_10.jsonl (compact conversation format)
 *
 * Outputs:
 *   golden_sft_final.jsonl  — standard SFT format: { messages: [{role,content}...] }
 *
 * Compact phase format (what you write in each phase file):
 *   { "id":"p01_001", "cat":"record_store", "trust_level":1, "scenario":"...",
 *     "inner_thought":false, "turns":[{"u":"user msg","a":"morrigan response"},...] }
 *
 * Usage:
 *   node finetuned_files/build_dataset.js
 *   node finetuned_files/build_dataset.js --stats   (show count by phase, no write)
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const { CHARACTER_DEFAULT_PROMPT } = require('../shared/morrigan.js');

const DIR           = __dirname;
const PHASES_DIR    = path.join(DIR, 'phases');
const BASE_RAW      = path.join(DIR, 'golden_sft.jsonl');
const BASE_RESTYLED = path.join(DIR, 'golden_sft_restyled.jsonl'); // Phase 00 output (preferred)
const BASE_FILE     = fs.existsSync(BASE_RESTYLED) ? BASE_RESTYLED : BASE_RAW;
const OUTPUT_FILE   = path.join(DIR, 'golden_sft_final.jsonl');

const STATS_ONLY = process.argv.includes('--stats');

// ─── CONVERT COMPACT PHASE RECORD → SFT FORMAT ───────────────────────────────

function compactToSFT(record) {
  if (!record.turns || !record.turns.length) return null;

  const messages = [
    { role: 'system', content: CHARACTER_DEFAULT_PROMPT },
  ];

  for (const turn of record.turns) {
    if (!turn.u || !turn.a) continue;
    messages.push({ role: 'user',      content: turn.u });
    messages.push({ role: 'assistant', content: turn.a });
  }

  // Must have at least one user and one assistant
  if (!messages.find(m => m.role === 'user') || !messages.find(m => m.role === 'assistant')) {
    return null;
  }

  return {
    source:            record.cat || 'generated',
    category:          record.cat || 'generated',
    scenario:          record.scenario || '',
    trust_level:       record.trust_level || 0,
    inner_thought:     record.inner_thought || false,
    phase:             record.phase || record.id?.split('_')[0] || 'unknown',
    quality_score:     record.quality_score || 92,
    golden:            true,
    messages,
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const counts = { base: 0, phases: {}, total: 0, skipped: 0 };
  const seen   = new Set(); // dedup by first user message

  let out;
  if (!STATS_ONLY) {
    out = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf8' });
  }

  function writeRecord(record) {
    // Dedup by first user message ONLY (not source) — so phase rewrites beat base originals
    const firstUser = record.messages?.find(m => m.role === 'user')?.content?.slice(0, 80) || '';
    if (seen.has(firstUser)) { counts.skipped++; return; }
    seen.add(firstUser);
    if (!STATS_ONLY) out.write(JSON.stringify(record) + '\n');
    counts.total++;
  }

  // ── 1. Phase files (processed FIRST — rewrites beat base originals on dedup) ──
  const phaseFiles = [];
  if (fs.existsSync(PHASES_DIR)) {
    for (const f of fs.readdirSync(PHASES_DIR).sort()) {
      if (f.endsWith('.jsonl')) phaseFiles.push(path.join(PHASES_DIR, f));
    }
  }

  for (const file of phaseFiles) {
    const label = path.basename(file, '.jsonl');
    counts.phases[label] = 0;
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        r.phase = label;
        const sft = compactToSFT(r);
        if (sft) {
          writeRecord(sft);
          counts.phases[label]++;
        }
      } catch {}
    }
    console.log(`  ${label}: ${counts.phases[label]} records`);
  }

  // ── 2. Base records (golden_sft.jsonl / golden_sft_restyled.jsonl) — AFTER phases ──
  // Any base record whose first user message was already seen from a phase file is skipped.
  // This means phase rewrites take precedence; unrewritten base records fill the gaps.
  if (fs.existsSync(BASE_FILE)) {
    const baseName = path.basename(BASE_FILE);
    let baseCount = 0;
    const rl = readline.createInterface({ input: fs.createReadStream(BASE_FILE, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (!r.messages) continue;
        const msgs = r.messages.map(m =>
          m.role === 'system' ? { ...m, content: CHARACTER_DEFAULT_PROMPT } : m
        );
        if (!msgs.find(m => m.role === 'system')) {
          msgs.unshift({ role: 'system', content: CHARACTER_DEFAULT_PROMPT });
        }
        writeRecord({ ...r, messages: msgs, golden: true });
        baseCount++;
      } catch {}
    }
    console.log(`  ${baseName}: ${baseCount} records (${counts.skipped} total deduped)`);
    counts.base = baseCount;
  } else {
    console.log(`  Base file: NOT FOUND`);
  }

  if (!STATS_ONLY) out.end();

  console.log('\n──────────────────────────────────────');
  console.log(`  TOTAL: ${counts.total} records  (${counts.skipped} duplicates skipped)`);
  if (!STATS_ONLY) console.log(`  Output: ${OUTPUT_FILE}`);
  console.log('──────────────────────────────────────');
}

main().catch(console.error);
