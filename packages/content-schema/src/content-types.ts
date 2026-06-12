export type ContentType = 'markdown' | 'inknote';
export type CategorySlug = string;
export type MarkdownSection = string;

export interface BaseFrontmatter {
  type: ContentType;
  title: string;
  slug: string;
  date: string;
  updatedAt?: string;
  summary?: string;
  cover?: string;
  tags?: string[];
  published: boolean;
  category?: CategorySlug;
}

export interface MarkdownFrontmatter extends BaseFrontmatter {
  type: 'markdown';
  section?: MarkdownSection;
  permalink?: string;
  readingTime?: string;
}

export interface InkNoteFrontmatter extends BaseFrontmatter {
  type: 'inknote';
  paperStyle: string;
  handwritingStyle: string;
  projectFile: string;
  previewImage?: string;
  pdfFile?: string;
}

export type ContentFrontmatter =
  | MarkdownFrontmatter
  | InkNoteFrontmatter;

export interface ContentDocument<T extends ContentFrontmatter = ContentFrontmatter> {
  id: string;
  frontmatter: T;
  body: string;
}
