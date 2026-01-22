import type { Platform, PlatformConfig } from '@shared/types';

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    maxLength: 3000,
    supportsImages: true,
    supportsVideos: true,
    injectorSelector: [
      '.ql-editor[data-placeholder]',
      '.ql-editor',
      '[contenteditable="true"][role="textbox"]',
      '.share-creation-state__text-editor .ql-editor',
    ],
  },
  twitter: {
    id: 'twitter',
    name: 'X (Twitter)',
    maxLength: 280,
    supportsImages: true,
    supportsVideos: true,
    injectorSelector: [
      '[data-testid="tweetTextarea_0"]',
      '[data-testid="tweetTextarea_0_label"]',
      '.public-DraftEditor-content',
      '[role="textbox"][data-testid]',
    ],
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    maxLength: 63206,
    supportsImages: true,
    supportsVideos: true,
    injectorSelector: [
      '[data-lexical-editor="true"]',
      '[contenteditable="true"][role="textbox"]',
      '.notranslate[contenteditable="true"]',
    ],
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    maxLength: 2200,
    supportsImages: true,
    supportsVideos: true,
    injectorSelector: [
      '[contenteditable="true"][role="textbox"]',
      'textarea[placeholder]',
    ],
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    maxLength: 2200,
    supportsImages: false,
    supportsVideos: true,
    injectorSelector: [
      '[contenteditable="true"]',
      '.public-DraftEditor-content',
    ],
  },
};

export const MVP_PLATFORMS: Platform[] = ['linkedin', 'twitter'];

export const getPlatformConfig = (platform: Platform): PlatformConfig => {
  return PLATFORMS[platform];
};
