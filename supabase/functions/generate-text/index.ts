import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// CORS: In production, restrict to your extension ID
// chrome-extension://YOUR_EXTENSION_ID
const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || ['*'];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = ALLOWED_ORIGINS.includes('*')
    ? '*'
    : (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

interface GenerateRequest {
  context: {
    type: string;
    url: string;
    title: string;
    description?: string;
    price?: string;
    brand?: string;
    author?: string;
    channel?: string;
  };
  platform: 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'tiktok';
  tone: 'professional' | 'casual' | 'humorous' | 'promotional' | 'educational';
  includeHashtags: boolean;
  includeEmoji: boolean;
}

// Validation constants
const VALID_PLATFORMS = ['linkedin', 'twitter', 'facebook', 'instagram', 'tiktok'];
const VALID_TONES = ['professional', 'casual', 'humorous', 'promotional', 'educational'];
const VALID_CONTEXT_TYPES = ['product', 'article', 'video', 'general'];
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_URL_LENGTH = 2000;

const PLATFORM_LIMITS: Record<string, number> = {
  linkedin: 3000,
  twitter: 280,
  facebook: 63206,
  instagram: 2200,
  tiktok: 2200,
};

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check credits
    const { data: credits } = await supabase
      .from('credits')
      .select('text_credits')
      .eq('user_id', user.id)
      .single();

    if (!credits || credits.text_credits < 1) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate request
    let body: GenerateRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate request body
    const validationError = validateRequest(body);
    if (validationError) {
      return new Response(
        JSON.stringify({ error: validationError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { context, platform, tone, includeHashtags, includeEmoji } = body;

    // Build prompt
    const prompt = buildPrompt(context, platform, tone, includeHashtags, includeEmoji);

    // Call OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: getSystemPrompt(platform, tone),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.json();
      console.error('OpenAI error:', error);
      return new Response(
        JSON.stringify({ error: 'AI generation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openaiData = await openaiResponse.json();
    const generatedContent = openaiData.choices[0]?.message?.content || '';

    // Deduct credit
    await supabase.rpc('deduct_credit', {
      p_user_id: user.id,
      p_credit_type: 'text',
    });

    // Log generation
    await supabase.from('generations').insert({
      user_id: user.id,
      type: 'text',
      platform,
      context_type: context.type,
      tone,
      input_tokens: openaiData.usage?.prompt_tokens,
      output_tokens: openaiData.usage?.completion_tokens,
      model: 'gpt-4o',
    });

    // Extract hashtags
    const hashtags = extractHashtags(generatedContent);

    return new Response(
      JSON.stringify({
        id: crypto.randomUUID(),
        content: generatedContent,
        hashtags,
        characterCount: generatedContent.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getSystemPrompt(platform: string, tone: string): string {
  const charLimit = PLATFORM_LIMITS[platform] || 500;

  return `You are an expert social media content creator. Generate engaging ${platform} posts.

Rules:
- Keep content under ${charLimit} characters
- Match the ${tone} tone exactly
- Be authentic and engaging
- Use natural language
- If including hashtags, place them naturally or at the end
- Do not use markdown formatting
- Write ready-to-post content only, no explanations`;
}

/**
 * Validate the incoming request body
 */
function validateRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'Invalid request body';
  }

  const req = body as Record<string, unknown>;

  // Validate platform
  if (!req.platform || !VALID_PLATFORMS.includes(req.platform as string)) {
    return 'Invalid platform';
  }

  // Validate tone
  if (!req.tone || !VALID_TONES.includes(req.tone as string)) {
    return 'Invalid tone';
  }

  // Validate context
  if (!req.context || typeof req.context !== 'object') {
    return 'Invalid context';
  }

  const ctx = req.context as Record<string, unknown>;

  // Validate context type
  if (!ctx.type || !VALID_CONTEXT_TYPES.includes(ctx.type as string)) {
    return 'Invalid context type';
  }

  // Validate URL
  if (!ctx.url || typeof ctx.url !== 'string') {
    return 'Invalid URL';
  }
  try {
    const url = new URL(ctx.url as string);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return 'Invalid URL protocol';
    }
  } catch {
    return 'Invalid URL format';
  }
  if ((ctx.url as string).length > MAX_URL_LENGTH) {
    return 'URL too long';
  }

  // Validate title
  if (!ctx.title || typeof ctx.title !== 'string') {
    return 'Invalid title';
  }
  if ((ctx.title as string).length > MAX_TITLE_LENGTH) {
    return 'Title too long';
  }

  // Validate optional fields
  if (ctx.description && (typeof ctx.description !== 'string' || (ctx.description as string).length > MAX_DESCRIPTION_LENGTH)) {
    return 'Invalid description';
  }

  // Validate boolean fields
  if (typeof req.includeHashtags !== 'boolean' || typeof req.includeEmoji !== 'boolean') {
    return 'Invalid options';
  }

  return null;
}

/**
 * Sanitize user input to prevent prompt injection.
 * Removes patterns that could be used to manipulate the AI.
 */
function sanitizeForPrompt(text: string | undefined, maxLength: number): string {
  if (!text) return '';

  let sanitized = text
    // Remove potential instruction injections
    .replace(/\b(ignore|disregard|forget|override|system|instruction|prompt|assistant|user|human)\b.*?(above|previous|all|everything)/gi, '[removed]')
    // Remove markdown-like formatting that could confuse the model
    .replace(/```[\s\S]*?```/g, '')
    .replace(/---+/g, '')
    // Remove URLs with javascript: or data: schemes
    .replace(/(?:javascript|data|vbscript):/gi, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }

  return sanitized;
}

function buildPrompt(
  context: GenerateRequest['context'],
  platform: string,
  tone: string,
  includeHashtags: boolean,
  includeEmoji: boolean
): string {
  // Sanitize all user-provided content
  const safeTitle = sanitizeForPrompt(context.title, MAX_TITLE_LENGTH);
  const safeDescription = sanitizeForPrompt(context.description, MAX_DESCRIPTION_LENGTH);
  const safePrice = sanitizeForPrompt(context.price, 50);
  const safeBrand = sanitizeForPrompt(context.brand, 100);
  const safeAuthor = sanitizeForPrompt(context.author, 100);
  const safeChannel = sanitizeForPrompt(context.channel, 100);

  // Validate URL (already validated, but sanitize anyway)
  let safeUrl = '';
  try {
    const url = new URL(context.url);
    if (['http:', 'https:'].includes(url.protocol)) {
      safeUrl = url.href;
    }
  } catch {
    safeUrl = '[invalid url]';
  }

  // Build prompt with clear structure
  let prompt = `Generate a ${platform} post for the following content:\n\n`;
  prompt += `CONTENT TYPE: ${context.type}\n`;
  prompt += `TITLE: ${safeTitle}\n`;

  if (safeDescription) {
    prompt += `DESCRIPTION: ${safeDescription}\n`;
  }

  if (safePrice) {
    prompt += `PRICE: ${safePrice}\n`;
  }

  if (safeBrand) {
    prompt += `BRAND: ${safeBrand}\n`;
  }

  if (safeAuthor) {
    prompt += `AUTHOR: ${safeAuthor}\n`;
  }

  if (safeChannel) {
    prompt += `CHANNEL: ${safeChannel}\n`;
  }

  prompt += `LINK: ${safeUrl}\n`;
  prompt += `\nREQUIREMENTS:\n`;
  prompt += `- Tone: ${tone}\n`;
  prompt += includeHashtags ? '- Include 3-5 relevant hashtags\n' : '- Do not include hashtags\n';
  prompt += includeEmoji ? '- Include appropriate emojis\n' : '- Minimize emoji usage\n';
  prompt += '\nGenerate the post now:';

  return prompt;
}

function extractHashtags(content: string): string[] {
  const matches = content.match(/#[\w]+/g);
  return matches ? [...new Set(matches)].slice(0, 10) : []; // Limit to 10 hashtags
}
