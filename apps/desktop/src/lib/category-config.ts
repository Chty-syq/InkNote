import type { ContentCategory } from '@inknote/content-schema';

export const CATEGORY_CONFIG_PATH = 'site/categories.json';

export function slugifyCategoryLabel(label: string): string {
  const asciiSlug = label
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (asciiSlug) {
    return asciiSlug;
  }

  return label
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '')
    .toLowerCase();
}

function normalizeCategory(candidate: unknown): ContentCategory | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  const slugSource = typeof record.slug === 'string' ? record.slug.trim() : label;
  const slug = slugifyCategoryLabel(slugSource);

  if (!label || !slug) {
    return null;
  }

  return {
    slug,
    label,
  };
}

export function parseCategoryConfig(raw: string): ContentCategory[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => normalizeCategory(entry))
      .filter((entry): entry is ContentCategory => Boolean(entry));
  } catch {
    return [];
  }
}

export function serializeCategoryConfig(categories: ContentCategory[]): string {
  return `${JSON.stringify(categories, null, 2)}\n`;
}

export function ensureUniqueCategorySlug(
  requestedSlug: string,
  categories: ContentCategory[],
  excludeSlug?: string,
): string {
  const baseSlug = slugifyCategoryLabel(requestedSlug) || 'category';
  let nextSlug = baseSlug;
  let index = 2;

  while (
    categories.some((category) => category.slug === nextSlug && category.slug !== excludeSlug)
  ) {
    nextSlug = `${baseSlug}-${index}`;
    index += 1;
  }

  return nextSlug;
}
