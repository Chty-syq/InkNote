#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

const DEFAULT_CONFIG_PATH = 'scripts/konachan-gallery.config.example.json';
const DEFAULT_HOSTS = ['https://konachan.net', 'https://konachan.com'];
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
let CURRENT_CONFIG = {
  requestMode: process.platform === 'win32' ? 'powershell' : 'fetch'
};

function parseArgs(argv) {
  const args = {
    config: DEFAULT_CONFIG_PATH,
    dryRun: false,
    hosts: [],
    requestMode: undefined,
    topics: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config') {
      args.config = argv[index + 1];
      index += 1;
    } else if (arg === '--out') {
      args.outDir = argv[index + 1];
      index += 1;
    } else if (arg === '--total') {
      args.totalLimit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--per-topic') {
      args.perTopicLimit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--min-width') {
      args.minWidth = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--min-height') {
      args.minHeight = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--rating') {
      args.rating = argv[index + 1];
      index += 1;
    } else if (arg === '--order') {
      args.order = argv[index + 1];
      index += 1;
    } else if (arg === '--variant') {
      args.imageVariant = argv[index + 1];
      index += 1;
    } else if (arg === '--delay') {
      args.delayMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--host') {
      args.hosts.push(argv[index + 1]);
      index += 1;
    } else if (arg === '--topic') {
      args.topics.push(argv[index + 1]);
      index += 1;
    } else if (arg === '--request-mode') {
      args.requestMode = argv[index + 1];
      index += 1;
    } else if (arg === '--retries') {
      args.requestRetries = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--retry-ms') {
      args.retryMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Konachan local gallery fetcher

Usage:
  node scripts/fetch-konachan-gallery-v2.mjs
  npm run gallery:konachan -- --per-topic 40 --total 1000
  npm run gallery:konachan -- --host https://konachan.com

Options:
  --config <path>       Config path. Default: ${DEFAULT_CONFIG_PATH}
  --out <dir>           Output directory.
  --total <number>      Global download limit.
  --per-topic <number>  Max downloads per topic.
  --min-width <number>  Minimum original image width.
  --min-height <number> Minimum original image height.
  --rating <value>      safe, questionable, or explicit. Default: safe.
  --order <value>       score, date, or random. Default: score.
  --variant <value>     sample, jpeg, or file. Default: sample.
  --delay <ms>          Delay between requests. Default: 1200.
  --host <url>          Konachan host. Can be repeated.
  --topic <name|slug>   Only run matched topic. Can be repeated.
  --request-mode <mode> fetch, powershell, or auto. Windows default: powershell.
  --retries <number>    Retry count for transient HTTP/network failures. Default: 3.
  --retry-ms <number>   Base retry delay in milliseconds. Default: 2500.
  --dry-run             Query only, do not download files.
`);
}

async function loadConfig(cliArgs) {
  const configPath = resolve(cliArgs.config);
  const config = JSON.parse(await readFile(configPath, 'utf8'));

  return {
    outDir: cliArgs.outDir ?? config.outDir ?? 'apps/web/public/card-images/anime',
    totalLimit: readPositiveNumber(cliArgs.totalLimit, config.totalLimit, 1000),
    perTopicLimit: readPositiveNumber(cliArgs.perTopicLimit, config.perTopicLimit, 32),
    rating: cliArgs.rating ?? config.rating ?? 'safe',
    order: cliArgs.order ?? config.order ?? 'score',
    imageVariant: cliArgs.imageVariant ?? config.imageVariant ?? 'sample',
    minWidth: readPositiveNumber(cliArgs.minWidth, config.minWidth, 1280),
    minHeight: readPositiveNumber(cliArgs.minHeight, config.minHeight, 720),
    delayMs: readPositiveNumber(cliArgs.delayMs, config.delayMs, 1200),
    requestRetries: readPositiveNumber(cliArgs.requestRetries, config.requestRetries, 3),
    retryMs: readPositiveNumber(cliArgs.retryMs, config.retryMs, 2500),
    dryRun: cliArgs.dryRun,
    hosts: normalizeHosts(cliArgs.hosts.length > 0 ? cliArgs.hosts : config.hosts),
    requestMode: normalizeRequestMode(cliArgs.requestMode ?? config.requestMode),
    topics: filterTopics(Array.isArray(config.topics) ? config.topics : [], cliArgs.topics)
  };
}

function filterTopics(topics, filters) {
  if (!Array.isArray(filters) || filters.length === 0) {
    return topics;
  }

  const normalizedFilters = new Set(filters.map((filter) => normalizeTopicFilter(filter)));
  return topics.filter((topic) => {
    const name = normalizeTopicFilter(topic.name);
    const slug = normalizeTopicFilter(topic.slug);
    return normalizedFilters.has(name) || normalizedFilters.has(slug);
  });
}

function normalizeTopicFilter(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRequestMode(value) {
  if (value === 'fetch' || value === 'powershell' || value === 'auto') {
    return value;
  }
  return process.platform === 'win32' ? 'powershell' : 'fetch';
}

function normalizeHosts(hosts) {
  const values = Array.isArray(hosts) && hosts.length > 0 ? hosts : DEFAULT_HOSTS;
  return values
    .map((host) => String(host || '').trim().replace(/\/+$/g, ''))
    .filter(Boolean);
}

function readPositiveNumber(...values) {
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return values[values.length - 1];
}

function sanitizeSlug(value, fallback = 'topic') {
  return (
    String(value || fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || fallback
  );
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function withRetries(label, action, config = CURRENT_CONFIG) {
  const attempts = Math.max(1, Number(config.requestRetries) || 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const message = formatNetworkError(error);
      if (attempt >= attempts) {
        break;
      }

      const waitMs = Math.max(0, Number(config.retryMs) || 0) * attempt;
      console.warn(`${label} failed (${attempt}/${attempts}): ${message}`);
      console.warn(`Retry in ${waitMs}ms...`);
      await sleep(waitMs);
    }
  }

  throw new Error(formatNetworkError(lastError));
}

function buildTags(topic, config) {
  return [
    `rating:${config.rating}`,
    `order:${config.order}`,
    ...(topic.tags ?? []),
    ...(topic.extraTags ?? [])
  ]
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .join(' ');
}

function getPostTags(post) {
  return new Set(
    String(post.tags || '')
      .split(/\s+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  );
}

function getRequiredTags(topic) {
  const tags = topic.matchTags ?? topic.tags ?? [];
  return tags
    .map((tag) => String(tag).trim())
    .filter((tag) => tag && !isSearchControlTag(tag) && !tag.includes('*'));
}

function isSearchControlTag(tag) {
  return /^(rating|order|width|height|score|date|user|source):/i.test(tag);
}

function postMatchesRequiredTags(post, topic) {
  const requiredTags = getRequiredTags(topic);
  if (requiredTags.length === 0) {
    return true;
  }

  const postTags = getPostTags(post);
  return requiredTags.every((tag) => postTags.has(tag));
}

function createHeaders(accept, referer) {
  return {
    Accept: accept,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7',
    Referer: referer,
    'User-Agent': BROWSER_USER_AGENT
  };
}

function pickImageUrl(post, variant) {
  if (variant === 'file') {
    return post.file_url || post.jpeg_url || post.sample_url;
  }
  if (variant === 'jpeg') {
    return post.jpeg_url || post.sample_url || post.file_url;
  }
  return post.sample_url || post.jpeg_url || post.file_url;
}

function getUrlExtension(url) {
  try {
    const extension = extname(new URL(url).pathname).toLowerCase();
    return IMAGE_EXTENSIONS.has(extension) ? extension : '.jpg';
  } catch {
    return '.jpg';
  }
}

function isLargeEnough(post, config) {
  const width = Number(post.width ?? post.sample_width ?? 0);
  const height = Number(post.height ?? post.sample_height ?? 0);
  return width >= config.minWidth && height >= config.minHeight;
}

async function fetchJson(url, referer) {
  if (CURRENT_CONFIG.requestMode === 'powershell') {
    return fetchJsonPowerShell(url, referer);
  }

  try {
    const response = await fetch(url, {
      headers: createHeaders('application/json,text/plain,*/*', referer)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    if (CURRENT_CONFIG.requestMode === 'auto' && process.platform === 'win32') {
      console.warn(`Node fetch failed, fallback to PowerShell: ${formatNetworkError(error)}`);
      return fetchJsonPowerShell(url, referer);
    }
    throw new Error(formatNetworkError(error));
  }
}

async function downloadFile(url, targetPath) {
  if (CURRENT_CONFIG.requestMode === 'powershell') {
    await downloadFilePowerShell(url, targetPath);
    return;
  }

  const origin = new URL(url).origin;

  try {
    const response = await fetch(url, {
      headers: createHeaders(
        'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        origin
      )
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    await mkdir(dirname(targetPath), { recursive: true });
    await pipeline(response.body, createWriteStream(targetPath));
  } catch (error) {
    if (CURRENT_CONFIG.requestMode === 'auto' && process.platform === 'win32') {
      console.warn(`Node download failed, fallback to PowerShell: ${formatNetworkError(error)}`);
      await downloadFilePowerShell(url, targetPath);
      return;
    }
    throw new Error(formatNetworkError(error));
  }
}

function formatNetworkError(error) {
  const cause = error?.cause;
  const causeMessage = cause ? ` (${cause.code || cause.name || 'cause'}: ${cause.message})` : '';
  return `${cleanPowerShellError(error?.message || String(error))}${causeMessage}`;
}

function cleanPowerShellError(message) {
  const text = String(message || '').trim();
  if (!text.includes('<Objs') && !text.includes('#< CLIXML')) {
    return text;
  }

  const errorLines = [...text.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)]
    .map((match) => decodePowerShellXmlText(match[1]))
    .map((line) => line.trim())
    .filter(Boolean);

  if (errorLines.length > 0) {
    return errorLines.join(' ').replace(/\s+/g, ' ').trim();
  }

  return decodePowerShellXmlText(text.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodePowerShellXmlText(value) {
  return String(value)
    .replace(/_x000D__x000A_/g, '\n')
    .replace(/_x000D_/g, '\r')
    .replace(/_x000A_/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function fetchJsonPowerShell(url, referer) {
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$headers = @{
  'User-Agent' = $env:INKNOTE_USER_AGENT
  'Accept' = 'application/json,text/plain,*/*'
  'Accept-Language' = 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7'
  'Referer' = $env:INKNOTE_REFERER
}
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $env:INKNOTE_URL -Headers $headers -TimeoutSec 60
  [Console]::Out.Write($response.Content)
} catch {
  $status = ''
  $body = ''
  if ($_.Exception.Response) {
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    try {
      $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
      $body = $reader.ReadToEnd()
      $reader.Close()
    } catch {}
  }
  if ($body.Length -gt 600) { $body = $body.Substring(0, 600) }
  [Console]::Error.Write("HTTP $status $($_.Exception.Message) $body")
  exit 1
}
`;
  const output = await runPowerShell(script, {
    INKNOTE_URL: url.toString(),
    INKNOTE_REFERER: referer,
    INKNOTE_USER_AGENT: BROWSER_USER_AGENT
  });
  return JSON.parse(output);
}

async function downloadFilePowerShell(url, targetPath) {
  await mkdir(dirname(targetPath), { recursive: true });
  const origin = new URL(url).origin;
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$headers = @{
  'User-Agent' = $env:INKNOTE_USER_AGENT
  'Accept' = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
  'Accept-Language' = 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7'
  'Referer' = $env:INKNOTE_REFERER
}
try {
  Invoke-WebRequest -UseBasicParsing -Uri $env:INKNOTE_URL -Headers $headers -OutFile $env:INKNOTE_OUT -TimeoutSec 120
} catch {
  $status = ''
  if ($_.Exception.Response) {
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
  }
  [Console]::Error.Write("HTTP $status $($_.Exception.Message)")
  exit 1
}
`;
  await runPowerShell(script, {
    INKNOTE_URL: url.toString(),
    INKNOTE_REFERER: origin,
    INKNOTE_USER_AGENT: BROWSER_USER_AGENT,
    INKNOTE_OUT: targetPath
  });
}

function runPowerShell(script, env) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const powershellPath = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      powershellPath,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      {
        env: { ...process.env, ...env },
        windowsHide: true
      }
    );
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill();
      rejectRun(new Error('PowerShell request timed out'));
    }, 180000);

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString('utf8');
      const err = cleanPowerShellError(Buffer.concat(stderr).toString('utf8').trim());
      if (code === 0) {
        resolveRun(out);
      } else {
        rejectRun(new Error(err || `PowerShell exited with code ${code}`));
      }
    });
  });
}

async function sha256File(filePath) {
  const handle = await open(filePath, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(1024 * 1024);

  try {
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length);
      if (bytesRead === 0) {
        break;
      }
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }

  return hash.digest('hex');
}

async function readExistingManifest(outDir) {
  const manifestPath = join(outDir, 'manifest.json');
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    return Array.isArray(manifest.images) ? manifest.images : [];
  } catch {
    return [];
  }
}

async function writeManifest(outDir, images, topics) {
  const manifestPath = join(outDir, 'manifest.json');
  const payload = {
    updatedAt: new Date().toISOString(),
    count: images.length,
    topics: topics.map((topic) => ({
      name: topic.name,
      slug: sanitizeSlug(topic.slug || topic.name),
      tags: topic.tags ?? []
    })),
    images
  };

  await writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function queryPostsFromHost(host, topic, config, page, limit) {
  const url = new URL('/post.json', host);
  url.searchParams.set('tags', buildTags(topic, config));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('page', String(page));
  return withRetries(`Query ${topic.name} page ${page}`, () => fetchJson(url, host), config);
}

async function fetchTopicPosts(topic, config, downloadedPostIds) {
  const posts = [];
  const limit = Math.min(100, Math.max(config.perTopicLimit * 3, 20));
  let page = 1;

  while (posts.length < config.perTopicLimit && page <= 20) {
    let pagePosts = null;
    let sourceHost = null;
    let lastError = null;

    for (const host of config.hosts) {
      try {
        console.log(`Query: ${topic.name} / page ${page} / ${host}`);
        pagePosts = await queryPostsFromHost(host, topic, config, page, limit);
        sourceHost = host;
        break;
      } catch (error) {
        lastError = error;
        console.warn(`Query failed: ${topic.name} / ${host} / ${error.message}`);
        await sleep(config.delayMs);
      }
    }

    if (!pagePosts) {
      throw lastError ?? new Error(`Query failed: ${topic.name}`);
    }

    if (!Array.isArray(pagePosts) || pagePosts.length === 0) {
      break;
    }

    for (const post of pagePosts) {
      if (posts.length >= config.perTopicLimit) {
        break;
      }
      if (!post?.id || downloadedPostIds.has(String(post.id))) {
        continue;
      }
      if (!postMatchesRequiredTags(post, topic)) {
        continue;
      }
      if (!isLargeEnough(post, config)) {
        continue;
      }

      const imageUrl = pickImageUrl(post, config.imageVariant);
      if (!imageUrl) {
        continue;
      }

      posts.push({ post, imageUrl, sourceHost });
      downloadedPostIds.add(String(post.id));
    }

    page += 1;
    await sleep(config.delayMs);
  }

  return posts;
}

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  const config = await loadConfig(cliArgs);
  CURRENT_CONFIG = config;
  const outDir = resolve(config.outDir);

  if (config.topics.length === 0) {
    throw new Error('No topics found in config.');
  }

  await mkdir(outDir, { recursive: true });

  const existingImages = await readExistingManifest(outDir);
  const postIds = new Set(existingImages.map((image) => String(image.postId)).filter(Boolean));
  const hashes = new Set(existingImages.map((image) => image.sha256).filter(Boolean));
  const images = [...existingImages];

  let downloaded = 0;

  for (const topic of config.topics) {
    if (images.length >= config.totalLimit || downloaded >= config.totalLimit) {
      break;
    }

    const topicSlug = sanitizeSlug(topic.slug || topic.name);
    const topicLimit = Math.min(Number(topic.limit) || config.perTopicLimit, config.perTopicLimit);
    let posts = [];

    try {
      posts = await fetchTopicPosts(
        { ...topic, limit: topicLimit },
        { ...config, perTopicLimit: topicLimit },
        postIds
      );
    } catch (error) {
      console.warn(`Skip: ${topic.name} query failed after retries: ${formatNetworkError(error)}`);
      continue;
    }

    if (posts.length === 0) {
      console.log(`Skip: ${topic.name} has no matched images.`);
      continue;
    }

    const topicDir = join(outDir, topicSlug);
    await mkdir(topicDir, { recursive: true });

    for (const { post, imageUrl, sourceHost } of posts) {
      if (downloaded >= config.totalLimit || images.length >= config.totalLimit) {
        break;
      }

      const extension = getUrlExtension(imageUrl);
      const postId = String(post.id);
      const finalName = `${topicSlug}-${postId}${extension}`;
      const finalPath = join(topicDir, finalName);
      const relativePath = `/${join('card-images', 'anime', topicSlug, finalName).replace(/\\/g, '/')}`;
      const tempPath = join(topicDir, `.${finalName}.download`);

      if (await pathExists(finalPath)) {
        console.log(`Exists: ${relativePath}`);
        continue;
      }

      if (config.dryRun) {
        console.log(`[dry-run] ${topic.name} -> ${imageUrl}`);
        downloaded += 1;
        continue;
      }

      try {
        console.log(`Download: ${topic.name} -> ${basename(finalPath)}`);
        await withRetries(
          `Download ${topic.name} ${postId}`,
          () => downloadFile(imageUrl, tempPath),
          config
        );

        const fileStat = await stat(tempPath);
        if (fileStat.size < 1024) {
          throw new Error(`File is too small: ${fileStat.size} bytes`);
        }

        const sha256 = await sha256File(tempPath);
        if (hashes.has(sha256)) {
          await rm(tempPath, { force: true });
          console.log(`Duplicate: ${topic.name} / ${postId}`);
          continue;
        }

        await rename(tempPath, finalPath);
        hashes.add(sha256);
        images.push({
          topic: topic.name,
          topicSlug,
          postId,
          path: relativePath,
          width: Number(post.width ?? 0),
          height: Number(post.height ?? 0),
          rating: post.rating,
          score: post.score,
          source: `${sourceHost}/post/show/${postId}`,
          imageUrl,
          sha256
        });
        downloaded += 1;
        await writeManifest(outDir, images, config.topics);
      } catch (error) {
        await rm(tempPath, { force: true });
        console.warn(`Failed: ${topic.name} / ${postId} / ${error.message}`);
      }

      await sleep(config.delayMs);
    }
  }

  await writeManifest(outDir, images, config.topics);
  const actionLabel = config.dryRun ? 'matched' : 'added';
  console.log(`Done: ${actionLabel} ${downloaded} images, total ${images.length}.`);
  console.log(`Output: ${outDir}`);
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
