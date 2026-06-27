export interface HeroLink {
  label: string;
  href: string;
}

export interface ChannelConfig {
  label: string;
  href: string;
  description: string;
}

export interface FriendLinkConfig {
  label: string;
  href: string;
  note: string;
  icon?: string;
  iconSource?: string;
  iconTarget?: string;
  iconFetchedAt?: string;
}

export interface RepositoryConfig {
  remote: string;
  branch: string;
  pagesUrl: string;
  basePath: string;
  workflow?: string;
}

export interface GiscusConfig {
  enabled: boolean;
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
  mapping: 'pathname' | 'url' | 'title' | 'og:title' | 'specific' | 'number';
  strict: boolean;
  reactionsEnabled: boolean;
  emitMetadata: boolean;
  inputPosition: 'top' | 'bottom';
  theme: string;
  lang: string;
}

export interface GoatCounterConfig {
  enabled: boolean;
  endpoint: string;
  scriptUrl: string;
}

export interface CardImageConfig {
  enabled: boolean;
  manifest: string;
}

export interface SiteConfig {
  title: string;
  tagline: string;
  description: string;
  baseUrl: string;
  language: string;
  author: string;
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    primaryLink: HeroLink;
    secondaryLink?: HeroLink;
  };
  channels: ChannelConfig[];
  friendLinks?: FriendLinkConfig[];
  toolLinks?: FriendLinkConfig[];
  repository?: RepositoryConfig;
  giscus?: GiscusConfig;
  goatcounter?: GoatCounterConfig;
  cardImages?: CardImageConfig;
}

export interface NavigationItem {
  label: string;
  href: string;
}

export interface SocialLink {
  label: string;
  href: string;
}

export interface ContentCategory {
  slug: string;
  label: string;
  labelEn?: string;
  order?: number;
}
