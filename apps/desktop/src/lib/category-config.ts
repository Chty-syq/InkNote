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

function toOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCategory(candidate: unknown, index: number): ContentCategory | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const label = toOptionalString(record.label);
  const labelEn = toOptionalString(record.labelEn ?? record.english ?? record.subtitle);
  const slugSource = toOptionalString(record.slug) || labelEn || label;
  const slug = slugifyCategoryLabel(slugSource);
  const order = typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : index + 1;

  if (!label || !slug) {
    return null;
  }

  return {
    slug,
    label,
    ...(labelEn ? { labelEn } : {}),
    order,
  };
}

export function parseCategoryConfig(raw: string): ContentCategory[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry, index) => normalizeCategory(entry, index))
      .filter((entry): entry is ContentCategory => Boolean(entry))
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  } catch {
    return [];
  }
}

export function normalizeCategoryOrder(categories: ContentCategory[]): ContentCategory[] {
  return categories.map((category, index) => ({
    slug: category.slug,
    label: category.label,
    ...(category.labelEn?.trim() ? { labelEn: category.labelEn.trim() } : {}),
    order: index + 1,
  }));
}

export function serializeCategoryConfig(categories: ContentCategory[]): string {
  return `${JSON.stringify(normalizeCategoryOrder(categories), null, 2)}\n`;
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
