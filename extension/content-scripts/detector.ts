import type { PageContext, ProductContext, ArticleContext, VideoContext, ContextType } from '@shared/types';

// Listen for messages from popup/background - only from our extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Security: Only accept messages from our extension
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ type: 'CONTEXT_RESULT', payload: null, error: 'Unauthorized' });
    return true;
  }

  if (message.type === 'GET_CONTEXT') {
    try {
      const context = detectPageContext();
      sendResponse({ type: 'CONTEXT_RESULT', payload: context });
    } catch (error) {
      console.error('Context detection error:', error);
      sendResponse({ type: 'CONTEXT_RESULT', payload: null, error: 'Detection failed' });
    }
  }
  return true;
});

function detectPageContext(): PageContext | null {
  // Try specific detectors in order of priority
  const detectors = [
    detectProductPage,
    detectYouTubeVideo,
    detectArticle,
    detectGeneralPage,
  ];

  for (const detector of detectors) {
    const context = detector();
    if (context) {
      return sanitizeContext(context);
    }
  }

  return null;
}

function detectProductPage(): ProductContext | null {
  // Check for JSON-LD structured data
  const jsonLd = getJsonLd('Product');
  if (jsonLd) {
    return {
      type: 'product',
      url: window.location.href,
      title: jsonLd.name || document.title,
      description: jsonLd.description,
      images: extractImages(jsonLd.image),
      metadata: {},
      price: jsonLd.offers?.price || jsonLd.offers?.[0]?.price,
      currency: jsonLd.offers?.priceCurrency || jsonLd.offers?.[0]?.priceCurrency,
      brand: jsonLd.brand?.name || jsonLd.brand,
      rating: jsonLd.aggregateRating?.ratingValue,
      reviewCount: jsonLd.aggregateRating?.reviewCount,
    };
  }

  // Amazon detection
  if (window.location.hostname.includes('amazon')) {
    return detectAmazonProduct();
  }

  // Generic product page detection
  const priceElement = document.querySelector('[itemprop="price"], .price, [data-price]');
  if (priceElement) {
    return {
      type: 'product',
      url: window.location.href,
      title: getMetaContent('og:title') || document.title,
      description: getMetaContent('og:description') || getMetaContent('description'),
      images: getImages(),
      metadata: getMetaTags(),
      price: priceElement.textContent?.trim(),
    };
  }

  return null;
}

function detectAmazonProduct(): ProductContext | null {
  const title = document.getElementById('productTitle')?.textContent?.trim();
  if (!title) return null;

  const priceWhole = document.querySelector('.a-price-whole')?.textContent;
  const priceFraction = document.querySelector('.a-price-fraction')?.textContent;
  const price = priceWhole ? `${priceWhole}${priceFraction || ''}` : undefined;

  const brand = document.getElementById('bylineInfo')?.textContent?.replace('Brand: ', '').replace('Visit the ', '').replace(' Store', '').trim();

  const ratingText = document.querySelector('[data-hook="rating-out-of-text"]')?.textContent;
  const rating = ratingText ? parseFloat(ratingText) : undefined;

  const reviewCountText = document.getElementById('acrCustomerReviewText')?.textContent;
  const reviewCount = reviewCountText ? parseInt(reviewCountText.replace(/\D/g, '')) : undefined;

  const mainImage = document.getElementById('landingImage')?.getAttribute('src') ||
    document.getElementById('imgBlkFront')?.getAttribute('src');

  return {
    type: 'product',
    url: window.location.href,
    title,
    description: document.getElementById('productDescription')?.textContent?.trim() ||
      document.getElementById('feature-bullets')?.textContent?.trim(),
    images: mainImage ? [mainImage] : getImages(),
    metadata: {},
    price,
    brand,
    rating,
    reviewCount,
  };
}

function detectYouTubeVideo(): VideoContext | null {
  if (!window.location.hostname.includes('youtube.com')) return null;
  if (!window.location.pathname.includes('/watch')) return null;

  const title = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim() ||
    document.querySelector('meta[name="title"]')?.getAttribute('content');

  if (!title) return null;

  const channel = document.querySelector('#channel-name a')?.textContent?.trim() ||
    document.querySelector('ytd-channel-name a')?.textContent?.trim();

  const description = document.querySelector('#description-inline-expander')?.textContent?.trim() ||
    getMetaContent('og:description');

  const viewCountText = document.querySelector('.view-count')?.textContent ||
    document.querySelector('[itemprop="interactionCount"]')?.getAttribute('content');
  const viewCount = viewCountText ? parseInt(viewCountText.replace(/\D/g, '')) : undefined;

  return {
    type: 'video',
    url: window.location.href,
    title,
    description,
    images: [getMetaContent('og:image') || `https://img.youtube.com/vi/${getYouTubeVideoId()}/maxresdefault.jpg`].filter(Boolean) as string[],
    metadata: {},
    channel,
    viewCount,
  };
}

function getYouTubeVideoId(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

function detectArticle(): ArticleContext | null {
  // Check for article schema
  const jsonLd = getJsonLd('Article') || getJsonLd('NewsArticle') || getJsonLd('BlogPosting');
  if (jsonLd) {
    return {
      type: 'article',
      url: window.location.href,
      title: jsonLd.headline || document.title,
      description: jsonLd.description,
      images: extractImages(jsonLd.image),
      metadata: {},
      author: jsonLd.author?.name || jsonLd.author?.[0]?.name,
      publishedDate: jsonLd.datePublished,
      content: getArticleContent(),
    };
  }

  // Check for article element
  const articleElement = document.querySelector('article');
  if (articleElement) {
    const title = document.querySelector('h1')?.textContent?.trim() ||
      getMetaContent('og:title') ||
      document.title;

    return {
      type: 'article',
      url: window.location.href,
      title,
      description: getMetaContent('og:description') || getMetaContent('description'),
      images: getImages(),
      metadata: getMetaTags(),
      author: getMetaContent('author') ||
        document.querySelector('[rel="author"]')?.textContent?.trim(),
      publishedDate: getMetaContent('article:published_time'),
      content: getArticleContent(),
    };
  }

  // Check for blog indicators
  const isBlog = window.location.pathname.includes('/blog') ||
    window.location.pathname.includes('/post') ||
    window.location.pathname.includes('/article') ||
    document.querySelector('.post-content, .blog-post, .entry-content');

  if (isBlog) {
    return {
      type: 'article',
      url: window.location.href,
      title: document.querySelector('h1')?.textContent?.trim() || document.title,
      description: getMetaContent('og:description') || getMetaContent('description'),
      images: getImages(),
      metadata: getMetaTags(),
      content: getArticleContent(),
    };
  }

  return null;
}

function detectGeneralPage(): PageContext {
  return {
    type: 'general',
    url: window.location.href,
    title: getMetaContent('og:title') || document.title,
    description: getMetaContent('og:description') || getMetaContent('description'),
    images: getImages(),
    metadata: getMetaTags(),
  };
}

// Helper functions
function getJsonLd(type: string): Record<string, unknown> | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '');

      if (Array.isArray(data)) {
        const item = data.find((d) => d['@type'] === type);
        if (item) return item;
      } else if (data['@type'] === type) {
        return data;
      } else if (data['@graph']) {
        const item = data['@graph'].find((d: Record<string, unknown>) => d['@type'] === type);
        if (item) return item;
      }
    } catch {
      // Invalid JSON, continue
    }
  }

  return null;
}

function getMetaContent(name: string): string | undefined {
  const meta =
    document.querySelector(`meta[property="${name}"]`) ||
    document.querySelector(`meta[name="${name}"]`);
  return meta?.getAttribute('content') || undefined;
}

function getMetaTags(): Record<string, string> {
  const tags: Record<string, string> = {};
  const metaElements = document.querySelectorAll('meta[property], meta[name]');

  metaElements.forEach((meta) => {
    const key = meta.getAttribute('property') || meta.getAttribute('name');
    const value = meta.getAttribute('content');
    if (key && value) {
      tags[key] = value;
    }
  });

  return tags;
}

function getImages(): string[] {
  const images: string[] = [];

  // OG image
  const ogImage = getMetaContent('og:image');
  if (ogImage) images.push(ogImage);

  // Twitter image
  const twitterImage = getMetaContent('twitter:image');
  if (twitterImage && !images.includes(twitterImage)) {
    images.push(twitterImage);
  }

  // First significant image on page
  const pageImages = document.querySelectorAll('img[src]');
  for (const img of pageImages) {
    const src = img.getAttribute('src');
    if (
      src &&
      !src.includes('logo') &&
      !src.includes('icon') &&
      !src.includes('avatar') &&
      img.width > 200 &&
      img.height > 200 &&
      !images.includes(src)
    ) {
      images.push(src.startsWith('//') ? `https:${src}` : src);
      if (images.length >= 3) break;
    }
  }

  return images;
}

function extractImages(imageData: unknown): string[] {
  if (!imageData) return [];
  if (typeof imageData === 'string') return [imageData];
  if (Array.isArray(imageData)) {
    return imageData.map((img) => (typeof img === 'string' ? img : img.url)).filter(Boolean);
  }
  if (typeof imageData === 'object' && imageData !== null && 'url' in imageData) {
    return [(imageData as { url: string }).url];
  }
  return [];
}

function getArticleContent(): string {
  const selectors = [
    'article',
    '.post-content',
    '.entry-content',
    '.article-content',
    '.blog-post',
    '[itemprop="articleBody"]',
    'main',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      // Get text content, limit to reasonable size
      const text = element.textContent?.trim() || '';
      return text.substring(0, 5000);
    }
  }

  return '';
}

/**
 * Sanitize a string by removing HTML and dangerous content.
 * Uses DOM-based sanitization for better security.
 */
function sanitizeString(str: string | undefined): string | undefined {
  if (!str) return undefined;

  // Use DOM to safely extract text content (removes all HTML)
  const temp = document.createElement('div');
  temp.textContent = str; // This escapes HTML
  let result = temp.textContent || '';

  // Double-check: remove any remaining dangerous patterns
  result = result
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/\bon\w+\s*=/gi, '');

  // Normalize whitespace
  result = result.replace(/\s+/g, ' ').trim();

  // Limit length to prevent memory issues
  return result.substring(0, 10000);
}

/**
 * Sanitize a URL - only allow http/https protocols
 */
function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Sanitize metadata object
 */
function sanitizeMetadata(metadata: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const entries = Object.entries(metadata).slice(0, 50); // Limit entries

  for (const [key, value] of entries) {
    const sanitizedKey = sanitizeString(key);
    const sanitizedValue = sanitizeString(value);
    if (sanitizedKey && sanitizedValue && sanitizedKey.length < 100) {
      sanitized[sanitizedKey] = sanitizedValue;
    }
  }
  return sanitized;
}

function sanitizeContext(context: PageContext): PageContext {
  const sanitized: PageContext = {
    type: context.type,
    url: sanitizeUrl(context.url) || window.location.href,
    title: sanitizeString(context.title) || 'Untitled',
    description: sanitizeString(context.description),
    images: context.images
      .slice(0, 10) // Limit number of images
      .map(sanitizeUrl)
      .filter((url): url is string => url !== null),
    metadata: sanitizeMetadata(context.metadata),
  };

  // Sanitize type-specific fields
  if ('content' in context && context.content) {
    (sanitized as ArticleContext).content = sanitizeString(context.content);
  }
  if ('author' in context && context.author) {
    (sanitized as ArticleContext).author = sanitizeString(context.author);
  }
  if ('brand' in context && context.brand) {
    (sanitized as ProductContext).brand = sanitizeString(context.brand);
  }
  if ('channel' in context && context.channel) {
    (sanitized as VideoContext).channel = sanitizeString(context.channel);
  }
  if ('price' in context && context.price) {
    (sanitized as ProductContext).price = sanitizeString(context.price);
  }
  if ('publishedDate' in context && context.publishedDate) {
    (sanitized as ArticleContext).publishedDate = sanitizeString(context.publishedDate);
  }
  if ('rating' in context) {
    const rating = Number((context as ProductContext).rating);
    if (!isNaN(rating) && rating >= 0 && rating <= 5) {
      (sanitized as ProductContext).rating = rating;
    }
  }
  if ('reviewCount' in context) {
    const count = Number((context as ProductContext).reviewCount);
    if (!isNaN(count) && count >= 0) {
      (sanitized as ProductContext).reviewCount = count;
    }
  }
  if ('viewCount' in context) {
    const count = Number((context as VideoContext).viewCount);
    if (!isNaN(count) && count >= 0) {
      (sanitized as VideoContext).viewCount = count;
    }
  }

  return sanitized;
}

console.log('SocialForge context detector loaded');
