import type { ContentDocument, ContentFrontmatter } from '@inknote/content-schema';

function parseScalarValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalizedRaw = raw.replace(/^\uFEFF/, '');
  const match = normalizedRaw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: {},
      body: normalizedRaw.trim(),
    };
  }

  const [, frontmatterBlock, body] = match;
  const lines = frontmatterBlock.split(/\r?\n/);
  const frontmatter: Record<string, unknown> = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z][\w-]*):(.*)$/);
    if (!keyMatch) {
      continue;
    }

    const [, key, rest] = keyMatch;
    const inlineValue = rest.trim();

    if (!inlineValue) {
      const items: unknown[] = [];

      while (index + 1 < lines.length && /^\s*-\s+/.test(lines[index + 1])) {
        index += 1;
        items.push(parseScalarValue(lines[index].replace(/^\s*-\s+/, '')));
      }

      frontmatter[key] = items;
      continue;
    }

    frontmatter[key] = parseScalarValue(inlineValue);
  }

  return {
    frontmatter,
    body: body.trim(),
  };
}

export function parseMarkdownDocument<T extends ContentFrontmatter = ContentFrontmatter>(
  raw: string,
  id: string,
): ContentDocument<T> {
  const { frontmatter, body } = parseFrontmatter(raw);

  return {
    id,
    frontmatter: frontmatter as T,
    body,
  };
}

export function sortDocumentsByDate<T extends { frontmatter: { date: string } }>(documents: T[]): T[] {
  return [...documents].sort((left, right) => right.frontmatter.date.localeCompare(left.frontmatter.date));
}
