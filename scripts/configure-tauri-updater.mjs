#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const configPath = path.join(repoRoot, 'apps', 'desktop', 'src-tauri', 'tauri.conf.json');
const pubkey = (process.env.TAURI_UPDATER_PUBKEY || process.env.TAURI_UPDATER_PUBLIC_KEY || '').trim();

if (!pubkey) {
  console.error('Missing TAURI_UPDATER_PUBKEY. Generate a Tauri updater key and store its public key in GitHub Secrets.');
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.bundle = config.bundle || {};
config.bundle.createUpdaterArtifacts = true;
config.plugins = config.plugins || {};
config.plugins.updater = config.plugins.updater || {};
config.plugins.updater.pubkey = pubkey;

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log('Configured Tauri updater public key and updater artifacts.');
