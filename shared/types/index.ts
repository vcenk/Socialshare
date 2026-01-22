// Page context types
export type ContextType = 'product' | 'article' | 'video' | 'social' | 'general';

export interface PageContext {
  type: ContextType;
  url: string;
  title: string;
  description?: string;
  images: string[];
  metadata: Record<string, string>;
}

export interface ProductContext extends PageContext {
  type: 'product';
  price?: string;
  currency?: string;
  brand?: string;
  rating?: number;
  reviewCount?: number;
  availability?: string;
}

export interface ArticleContext extends PageContext {
  type: 'article';
  author?: string;
  publishedDate?: string;
  content?: string;
  readingTime?: number;
}

export interface VideoContext extends PageContext {
  type: 'video';
  channel?: string;
  duration?: string;
  viewCount?: number;
  transcript?: string;
}

// Platform types
export type Platform = 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'tiktok';

export interface PlatformConfig {
  id: Platform;
  name: string;
  maxLength: number;
  supportsImages: boolean;
  supportsVideos: boolean;
  injectorSelector: string[];
}

// Generation types
export type ToneType = 'professional' | 'casual' | 'humorous' | 'promotional' | 'educational';

export interface GenerationRequest {
  context: PageContext;
  platform: Platform;
  tone: ToneType;
  includeHashtags: boolean;
  includeEmoji: boolean;
}

export interface GenerationResponse {
  id: string;
  content: string;
  hashtags: string[];
  platform: Platform;
  characterCount: number;
}

// User types
export type PlanType = 'free' | 'pro' | 'business';

export interface UserCredits {
  textCredits: number;
  imageCredits: number;
  videoCredits: number;
  plan: PlanType;
}

export interface User {
  id: string;
  email: string;
  credits: UserCredits;
}

// Message types for extension communication
export type MessageType =
  | 'GET_CONTEXT'
  | 'CONTEXT_RESULT'
  | 'INJECT_CONTENT'
  | 'INJECTION_RESULT'
  | 'GENERATE_CONTENT'
  | 'GENERATION_RESULT'
  | 'GET_CREDITS'
  | 'CREDITS_RESULT'
  | 'AUTH_STATUS'
  | 'LOGIN'
  | 'LOGOUT';

export interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload?: T;
  error?: string;
}

// Draft types
export interface Draft {
  id: string;
  content: string;
  platform: Platform;
  imageUrl?: string;
  createdAt: string;
}
