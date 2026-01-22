import type { PageContext, ProductContext, ArticleContext, VideoContext, ContextType } from '@shared/types';

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CONTEXT') {
    const context = detectPageContext();
    sendResponse({ type: 'CONTEXT_RESULT', payload: context });
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

function sanitizeContext(context: PageContext): PageContext {
  // Strip potential XSS content
  const sanitizeString = (str: string | undefined): string | undefined => {
    if (!str) return undefined;
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim();
  };

  return {
    ...context,
    title: sanitizeString(context.title) || 'Untitled',
    description: sanitizeString(context.description),
    images: context.images.filter((url) => {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    }),
  };
}

console.log('SocialForge context detector loaded');
