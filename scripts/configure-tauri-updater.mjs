#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const configPath = path.join(repoRoot, 'apps', 'desktop', 'src-tauri', 'tauri.conf.json');
const pubkey = (process.env.TAURI_UPDATER_PUBKEY || process.env.TAURI_UPDATER_PUBLIC_KEY || '').trim();
const privateKey = (process.env.TAURI_SIGNING_PRIVATE_KEY || '').trim();
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

if (!pubkey) {
  console.error('Missing TAURI_UPDATER_PUBKEY. Generate a Tauri updater key and store its public key in GitHub Secrets.');
  process.exit(1);
}

if (!privateKey) {
  console.error('Missing TAURI_SIGNING_PRIVATE_KEY. Store the private key printed by `tauri signer generate` in GitHub Secrets.');
  process.exit(1);
}

if (!base64Pattern.test(privateKey) || privateKey.length % 4 !== 0) {
  console.error(
    [
      'Invalid TAURI_SIGNING_PRIVATE_KEY format.',
      'Copy only the base64 private key value printed by `tauri signer generate`.',
      'Do not include labels, quotes, code fences, spaces, or line breaks.',
      'Keep any trailing "=" padding characters.',
    ].join('\n'),
  );
  process.exit(1);
}

try {
  Buffer.from(privateKey, 'base64');
} catch {
  console.error('Invalid TAURI_SIGNING_PRIVATE_KEY: failed to decode the base64 private key.');
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
