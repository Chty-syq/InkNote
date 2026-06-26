#!/usr/bin/env node
import { createHash } from 'node:crypto';
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
import { basename, extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

await import('./fetch-konachan-gallery-v2.mjs');
process.exit(process.exitCode ?? 0);

const KONACHAN_API = 'https://konachan.net/post.json';
const DEFAULT_CONFIG_PATH = 'scripts/konachan-gallery.config.example.json';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function parseArgs(argv) {
  const args = {
    config: DEFAULT_CONFIG_PATH,
    dryRun: false
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
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Konachan 本地图库拉取脚本

用法：
  node scripts/fetch-konachan-gallery.mjs
  node scripts/fetch-konachan-gallery.mjs --config scripts/konachan-gallery.config.json
  node scripts/fetch-konachan-gallery.mjs --per-topic 40 --total 1000

常用参数：
  --config <path>      配置文件路径，默认 scripts/konachan-gallery.config.json
  --out <dir>          输出目录，默认读取配置 outDir
  --total <number>     全局最多下载数量
  --per-topic <number> 每个主题最多下载数量
  --min-width <number> 最小宽度
  --min-height <number> 最小高度
  --rating <safe|questionable|explicit> 默认 safe
  --order <score|date|random> 默认 score
  --variant <sample|jpeg|file> 默认 sample
  --delay <ms>         请求间隔，默认 1200
  --dry-run            只查询不下载
`);
}

async function loadConfig(cliArgs) {
  const configPath = resolve(cliArgs.config);
  let config;

  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    throw error;
  }

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
    dryRun: cliArgs.dryRun,
    topics: Array.isArray(config.topics) ? config.topics : []
  };
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
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function buildTags(topic, config) {
  const tags = [
    `rating:${config.rating}`,
    `order:${config.order}`,
    ...(topic.tags ?? []),
    ...(topic.extraTags ?? [])
  ]
    .map((tag) => String(tag).trim())
    .filter(Boolean);

  return tags.join(' ');
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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'InkNote gallery fetcher/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function downloadFile(url, targetPath) {
  const response = await fetch(url, {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'User-Agent': 'InkNote gallery fetcher/1.0'
    }
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  await mkdir(resolve(targetPath, '..'), { recursive: true });
  await pipeline(response.body, createWriteStream(targetPath));
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

async function fetchTopicPosts(topic, config, downloadedPostIds) {
  const posts = [];
  const limit = Math.min(100, Math.max(config.perTopicLimit * 3, 20));
  const tags = buildTags(topic, config);
  let page = 1;

  while (posts.length < config.perTopicLimit && page <= 20) {
    const url = new URL(KONACHAN_API);
    url.searchParams.set('tags', tags);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('page', String(page));

    console.log(`查询：${topic.name} / page ${page}`);
    const pagePosts = await fetchJson(url);

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
      if (!isLargeEnough(post, config)) {
        continue;
      }

      const imageUrl = pickImageUrl(post, config.imageVariant);
      if (!imageUrl) {
        continue;
      }

      posts.push({ post, imageUrl });
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
  const outDir = resolve(config.outDir);

  if (config.topics.length === 0) {
    throw new Error('配置中没有 topics。');
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
    const posts = await fetchTopicPosts({ ...topic, limit: topicLimit }, { ...config, perTopicLimit: topicLimit }, postIds);

    if (posts.length === 0) {
      console.log(`跳过：${topic.name} 没有找到符合条件的图片。`);
      continue;
    }

    const topicDir = join(outDir, topicSlug);
    await mkdir(topicDir, { recursive: true });

    for (const { post, imageUrl } of posts) {
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
        console.log(`已存在：${relativePath}`);
        continue;
      }

      if (config.dryRun) {
        console.log(`[dry-run] ${topic.name} -> ${imageUrl}`);
        continue;
      }

      try {
        console.log(`下载：${topic.name} -> ${basename(finalPath)}`);
        await downloadFile(imageUrl, tempPath);

        const fileStat = await stat(tempPath);
        if (fileStat.size < 1024) {
          throw new Error(`文件过小：${fileStat.size} bytes`);
        }

        const sha256 = await sha256File(tempPath);
        if (hashes.has(sha256)) {
          await rm(tempPath, { force: true });
          console.log(`去重：${topic.name} / ${postId}`);
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
          source: `https://konachan.net/post/show/${postId}`,
          imageUrl,
          sha256
        });
        downloaded += 1;
        await writeManifest(outDir, images, config.topics);
      } catch (error) {
        await rm(tempPath, { force: true });
        console.warn(`失败：${topic.name} / ${postId} / ${error.message}`);
      }

      await sleep(config.delayMs);
    }
  }

  await writeManifest(outDir, images, config.topics);
  console.log(`完成：新增 ${downloaded} 张，图库共 ${images.length} 张。`);
  console.log(`目录：${outDir}`);
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
