# CLAUDE.md - SocialForge Chrome Extension

## Project Overview

SocialForge is a Chrome extension that automatically detects webpage context (products, articles, videos) and generates platform-optimized social media content using AI. The extension uses DOM injection to auto-fill compose boxes on major platforms, allowing users to review and post with a single click.

**Key Differentiator**: No API integrations with social platforms required. Uses DOM injection within the user's authenticated session, eliminating platform approval barriers.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Extension | Chrome Manifest V3, React, TypeScript, Tailwind CSS |
| Backend API | Supabase Edge Functions (Deno) |
| Authentication | Supabase Auth (JWT) |
| Database | Supabase PostgreSQL with RLS |
| AI - Text | OpenAI GPT-4o / Claude API |
| AI - Images | FAL AI (FLUX) |
| AI - Video | FAL AI / Runway API |
| Payments | Stripe |

## Project Structure

```
/extension
  /background
    service-worker.ts   → Service worker handling all API calls via Supabase
  /components
    Header.tsx          → App header with user info and logout
    CreditsDisplay.tsx  → Shows remaining credits by type
    ContextCard.tsx     → Displays detected page context
    PlatformSelector.tsx→ LinkedIn/Twitter platform toggle
    ToneSelector.tsx    → Tone selection chips (professional, casual, etc.)
    GenerateButton.tsx  → Main CTA for content generation
    ContentPreview.tsx  → Shows generated content with copy/insert actions
    LoginPrompt.tsx     → Authentication form
  /config
    platforms.ts        → Platform configurations (selectors, limits)
  /content-scripts
    detector.ts         → Scrapes page context (product, article, video, general)
    injector.ts         → Injects content into social media compose boxes
  /icons
    .gitkeep            → Placeholder (add icon-16/32/48/128.png)
  /popup
    index.html          → Popup entry point
    main.tsx            → React mount point
    App.tsx             → Main popup application component
  /sidepanel
    index.html          → Side panel entry point
    main.tsx            → Reuses popup App component
  /store
    index.ts            → Zustand store for auth and credits state
  /styles
    globals.css         → Tailwind CSS with custom components
  manifest.json         → Chrome extension manifest (V3)

/supabase
  /functions
    /credits-check      → GET user credits
    /generate-text      → POST generate content with OpenAI
    /drafts-save        → POST save draft
    /drafts-list        → GET list user drafts
    /stripe-webhook     → POST handle Stripe events
  /migrations
    20240101000000_initial_schema.sql → Database schema with RLS
  config.toml           → Supabase local development config

/shared
  /types
    index.ts            → TypeScript types (PageContext, Platform, etc.)
```

## Quick Setup

1. **Install dependencies**: `npm install`
2. **Configure Supabase**: Edit `extension/background/service-worker.ts` with your Supabase URL and anon key
3. **Build**: `npm run build`
4. **Load in Chrome**: Go to `chrome://extensions`, enable Developer mode, click "Load unpacked", select `dist/`

## Development Commands

```bash
# Extension development
npm install                  # Install dependencies
npm run dev                  # Start development with watch mode
npm run build                # Build for production
npm run lint                 # Run ESLint
npm run type-check           # Run TypeScript type checking
npm run test                 # Run tests

# Supabase local development
supabase start               # Start local Supabase instance
supabase db reset            # Reset database with migrations
supabase functions serve     # Run edge functions locally
supabase gen types typescript --local > shared/types/database.ts

# Load extension in Chrome
# 1. Navigate to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select /dist folder
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `extension/manifest.json` | Extension permissions and entry points |
| `extension/background/service-worker.ts` | All backend communication (auth, generation) |
| `extension/content-scripts/detector.ts` | Page context extraction logic |
| `extension/content-scripts/injector.ts` | DOM injection for each platform |
| `extension/config/platforms.ts` | Platform configs (selectors, char limits) |
| `extension/store/index.ts` | Zustand state (user, credits) |
| `extension/popup/App.tsx` | Main UI component |
| `shared/types/index.ts` | All TypeScript interfaces |
| `supabase/functions/generate-text/index.ts` | OpenAI integration |
| `supabase/migrations/*.sql` | Database schema with RLS |

## Architecture Principles

### Security (CRITICAL)

1. **No secrets in extension** - All API keys (OpenAI, FAL, Stripe) are stored only on the backend
2. **JWT authentication** - Short expiry tokens with refresh mechanism
3. **Input sanitization** - Strip HTML/scripts from scraped content before processing
4. **Output sanitization** - Escape all content before DOM injection
5. **Server-side credit checks** - Never trust client-side credit validation
6. **CORS restrictions** - Backend only accepts requests from the extension ID
7. **Row Level Security (RLS)** - All Supabase tables must have RLS enabled

### Extension Architecture

1. **Content Scripts** - Run in page context, handle detection and injection
2. **Background Service Worker** - Handle all API communication, manage auth state
3. **Popup/Sidepanel** - React UI, communicate with background via message passing
4. **No direct API calls from content scripts** - Always route through background worker

### Code Conventions

- **TypeScript** - Strict mode enabled, no `any` types without explicit justification
- **React** - Functional components with hooks, no class components
- **State Management** - React Context for simple state, consider Zustand for complex state
- **Styling** - Tailwind CSS utility classes, avoid custom CSS when possible
- **Naming** - camelCase for variables/functions, PascalCase for components/types
- **File naming** - kebab-case for files (e.g., `content-detector.ts`)

## Database Schema

### Tables

```sql
-- Credits tracking (per user)
credits (
  user_id UUID PRIMARY KEY,
  text_credits INT DEFAULT 10,
  image_credits INT DEFAULT 0,
  video_credits INT DEFAULT 0,
  plan TEXT DEFAULT 'free',  -- 'free', 'pro', 'business'
  stripe_customer_id TEXT,
  updated_at TIMESTAMP
)

-- Generation history
generations (
  id UUID PRIMARY KEY,
  user_id UUID,
  type TEXT,           -- 'text', 'image', 'video'
  platform TEXT,       -- 'linkedin', 'twitter', 'facebook', etc.
  context_type TEXT,   -- 'product', 'article', 'video', etc.
  created_at TIMESTAMP
)

-- Saved drafts
drafts (
  id UUID PRIMARY KEY,
  user_id UUID,
  content TEXT,
  platform TEXT,
  image_url TEXT,
  created_at TIMESTAMP
)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Authenticate user, return JWT |
| POST | `/auth/refresh` | Refresh expired token |
| GET | `/credits/check` | Get remaining credits |
| POST | `/generate/text` | Generate text content (deducts credit) |
| POST | `/generate/image` | Generate AI image (deducts credit) |
| POST | `/generate/video` | Generate AI video (deducts credit) |
| POST | `/context/analyze` | Sanitize and analyze scraped content |
| POST | `/drafts/save` | Save draft for later |
| GET | `/drafts/list` | Get user's saved drafts |
| POST | `/stripe/webhook` | Handle Stripe subscription events |

## Context Detection

### Supported Page Types

| Page Type | Extracted Data |
|-----------|----------------|
| Product Pages | Title, price, description, images, reviews, brand |
| Articles/Blogs | Headline, author, summary, key points, featured image |
| YouTube Videos | Title, description, channel, transcript snippets |
| Social Posts | Original content, author, engagement metrics |
| General Pages | Meta tags, OG data, visible text, images |

### Detection Strategy

1. Check for structured data (JSON-LD, microdata)
2. Parse Open Graph and Twitter Card meta tags
3. Use platform-specific selectors for known sites (Amazon, YouTube, etc.)
4. Fall back to heuristic content extraction

## Platform Injection Targets

| Platform | DOM Selector | Phase |
|----------|--------------|-------|
| LinkedIn | `.ql-editor`, `[contenteditable]` | MVP |
| X/Twitter | `[data-testid="tweetTextarea_0"]` | MVP |
| Facebook | `[data-lexical-editor="true"]` | Phase 2 |
| Instagram | Web composer (limited) | Phase 2 |
| TikTok | Web studio | Phase 3 |

**Important**: Platform selectors may change. Abstract selectors into a configuration file for easy updates.

## Development Phases

### MVP (Phase 1)
- Context detection for product pages and articles
- Text generation for LinkedIn and X/Twitter
- DOM injection for compose boxes
- Supabase auth and credit tracking
- Basic popup UI
- Free tier (10 generations/month)

### Phase 2
- Image generation with FAL AI
- Facebook and Instagram support
- Hashtag suggestions
- Multiple content variations (3 options)
- Save drafts feature
- Stripe integration for Pro tier

### Phase 3
- Short video generation (5-15 sec)
- Comment reply generation
- Carousel/multi-image creator
- TikTok support
- Analytics dashboard
- Business tier launch

## Testing Strategy

1. **Unit Tests** - Test utility functions, context detection logic
2. **Component Tests** - Test React components with React Testing Library
3. **Integration Tests** - Test message passing between extension components
4. **E2E Tests** - Test full flow with Playwright or Puppeteer
5. **Manual Testing** - Test DOM injection on live social platforms regularly

## Common Tasks

### Adding a New Platform

1. Add platform config to `/extension/config/platforms.ts`
2. Create injection selector in `/extension/content-scripts/injector.ts`
3. Add platform-specific prompt template in backend
4. Update character limit handling in text generation
5. Test injection on the live platform
6. Add to platform selector UI

### Adding a New Context Detector

1. Create detector in `/extension/content-scripts/detectors/`
2. Register detector in main `detector.ts`
3. Add TypeScript types for extracted data
4. Add backend validation for the new context type
5. Create AI prompt template for the context type

### Updating DOM Selectors

Platform DOM structures change frequently. When injection breaks:

1. Inspect the current compose box element
2. Update selector in `/extension/config/selectors.ts`
3. Test with multiple account states (new vs. established)
4. Deploy as patch release immediately

## Error Handling

1. **Network errors** - Retry with exponential backoff (3 attempts)
2. **Auth errors** - Attempt token refresh, then prompt re-login
3. **Generation failures** - Show user-friendly error, don't deduct credits
4. **Injection failures** - Fall back to clipboard copy with notification
5. **Credit exhaustion** - Show upgrade prompt, prevent generation

## Environment Variables

### Extension (stored in chrome.storage.local)
- `AUTH_TOKEN` - Current JWT token
- `REFRESH_TOKEN` - Token for refreshing auth
- `USER_SETTINGS` - User preferences

### Backend (Supabase secrets)
```
OPENAI_API_KEY=sk-...
FAL_API_KEY=...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Chrome Web Store Compliance

1. Request minimal permissions in manifest.json
2. Explain each permission in store listing
3. Follow Manifest V3 requirements strictly
4. No remote code execution
5. Clear privacy policy for data handling
6. Regular security audits

## Git Workflow

1. Create feature branches from `main`
2. Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
3. PR requires passing CI and code review
4. Squash merge to main
5. Tag releases with semantic versioning

## Useful Resources

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Supabase Docs](https://supabase.com/docs)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [FAL AI Docs](https://fal.ai/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
