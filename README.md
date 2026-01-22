# SocialForge Chrome Extension

AI-Powered Contextual Social Media Content Generator

## Overview

SocialForge is a Chrome extension that automatically detects webpage context (products, articles, videos) and generates platform-optimized social media content using AI. The extension uses DOM injection to auto-fill compose boxes on major platforms.

## Features

- **Context Detection**: Automatically extracts relevant information from product pages, articles, YouTube videos, and more
- **AI Text Generation**: Creates platform-optimized content using OpenAI GPT-4o
- **Multi-Platform Support**: LinkedIn, X/Twitter (MVP), with Facebook, Instagram, TikTok planned
- **Tone Selection**: Professional, casual, humorous, promotional, educational
- **Direct Injection**: Auto-fills social media compose boxes without API integrations
- **Credit System**: Free tier with 10 generations/month, paid plans for more

## Tech Stack

- **Extension**: Chrome Manifest V3, React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Supabase (Edge Functions, PostgreSQL, Auth)
- **AI**: OpenAI GPT-4o
- **Payments**: Stripe

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase CLI (for local development)
- Chrome browser

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone <repo-url>
   cd Socialshare
   npm install
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

3. **Update Supabase config**

   Edit `extension/background/service-worker.ts` and replace:
   ```typescript
   const SUPABASE_URL = 'YOUR_SUPABASE_URL';
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```

4. **Set up Supabase**
   ```bash
   # Start local Supabase
   supabase start

   # Apply migrations
   supabase db reset

   # Set edge function secrets
   supabase secrets set OPENAI_API_KEY=sk-your-key
   ```

5. **Build the extension**
   ```bash
   npm run build
   ```

6. **Load in Chrome**
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Development

```bash
# Start development build with watch mode
npm run dev

# Run type checking
npm run type-check

# Run linting
npm run lint

# Run tests
npm run test
```

### Adding Extension Icons

Create PNG icons in these sizes and place in `extension/icons/`:
- `icon-16.png` (16x16)
- `icon-32.png` (32x32)
- `icon-48.png` (48x48)
- `icon-128.png` (128x128)

## Project Structure

```
/extension
  /background         # Service worker for API communication
  /components         # Shared React components
  /config             # Platform configurations
  /content-scripts    # Page context detection and injection
  /popup              # Main extension popup UI
  /sidepanel          # Extended workspace (same as popup)
  /store              # Zustand state management
  /styles             # Global CSS with Tailwind
  manifest.json       # Chrome extension manifest

/supabase
  /functions          # Edge functions (Deno)
  /migrations         # Database migrations
  config.toml         # Supabase configuration

/shared
  /types              # Shared TypeScript types
```

## Supported Platforms (MVP)

| Platform | Status | Max Length |
|----------|--------|------------|
| LinkedIn | ✅ Ready | 3,000 chars |
| X/Twitter | ✅ Ready | 280 chars |
| Facebook | 🔜 Phase 2 | 63,206 chars |
| Instagram | 🔜 Phase 2 | 2,200 chars |
| TikTok | 🔜 Phase 3 | 2,200 chars |

## Pricing Tiers

| Tier | Price | Text Credits | Image Credits |
|------|-------|--------------|---------------|
| Free | $0 | 10/month | None |
| Pro | $12/month | 100/month | 30 images |
| Business | $29/month | Unlimited | 100 images, 20 videos |

## Security

- No API keys in extension - all secrets stored server-side
- JWT authentication with refresh tokens
- Input sanitization on scraped content
- Output sanitization before DOM injection
- Row Level Security on all database tables

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details
