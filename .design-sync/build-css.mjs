#!/usr/bin/env node
// design-sync: regenerate .design-sync/ds-combined.css (the cfg.cssEntry) from the
// app's hand-written source stylesheets. ds-combined.css is DERIVED and gitignored —
// run this before every design-sync build (it is wired as cfg.buildCmd) and on a
// fresh clone, so the bundle never ships stale CSS.
//
//   node .design-sync/build-css.mjs
//
// The scoped UI primitives style themselves with semantic classes + tokens defined
// across these three files; landing.css and globals.css are app-shell only and excluded.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const SOURCES = ['tokens', 'app', 'screens'];

const parts = ['/* design-sync: combined from src/styles/{tokens,app,screens}.css — DERIVED, regenerated each build */'];
for (const name of SOURCES) {
  parts.push(`/* ===== ${name}.css ===== */`);
  parts.push(readFileSync(resolve(repoRoot, 'src/styles', `${name}.css`), 'utf8').replace(/\n+$/, ''));
}
// Bind --font-ui to the brand face shipped by design-sync (cfg.extraFonts → fonts/hanken.css).
// In the app this slot is owned by globals.css via next/font's obfuscated --font-hanken,
// which does not exist in the standalone bundle; pin the real family name here instead.
parts.push("/* ===== design-sync: bind --font-ui to the shipped Hanken Grotesk face ===== */");
parts.push(":root { --font-ui: 'Hanken Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }");

const out = resolve(here, 'ds-combined.css');
writeFileSync(out, parts.join('\n') + '\n');
console.log(`wrote ${out} (${parts.length} sections)`);
