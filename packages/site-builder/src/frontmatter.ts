import type { ContentDocument, ContentFrontmatter } from '@inknote/content-schema';

function parseScalarValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
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

export function getFrontmatterOrderValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  return null;
}

export function sortDocumentsByDate<T extends { frontmatter: { date: string } }>(documents: T[]): T[] {
  return [...documents].sort((left, right) => right.frontmatter.date.localeCompare(left.frontmatter.date));
}

export function sortDocumentsByOrderAndDate<T extends { frontmatter: { order?: unknown; date: string } }>(
  documents: T[],
): T[] {
  return [...documents].sort((left, right) => {
    const leftOrder = getFrontmatterOrderValue(left.frontmatter.order);
    const rightOrder = getFrontmatterOrderValue(right.frontmatter.order);

    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    if (leftOrder !== null && rightOrder === null) {
      return -1;
    }

    if (leftOrder === null && rightOrder !== null) {
      return 1;
    }

    return right.frontmatter.date.localeCompare(left.frontmatter.date);
  });
}
