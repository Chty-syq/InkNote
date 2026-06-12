export interface HeroLink {
  label: string;
  href: string;
}

export interface ChannelConfig {
  label: string;
  href: string;
  description: string;
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
}
