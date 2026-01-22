import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

const PLATFORM_LIMITS: Record<string, number> = {
  linkedin: 3000,
  twitter: 280,
  facebook: 63206,
  instagram: 2200,
  tiktok: 2200,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

    // Parse request
    const body: GenerateRequest = await req.json();
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

function buildPrompt(
  context: GenerateRequest['context'],
  platform: string,
  tone: string,
  includeHashtags: boolean,
  includeEmoji: boolean
): string {
  let prompt = `Create a ${platform} post about this ${context.type}:\n\n`;
  prompt += `Title: ${context.title}\n`;

  if (context.description) {
    prompt += `Description: ${context.description.substring(0, 500)}\n`;
  }

  if (context.price) {
    prompt += `Price: ${context.price}\n`;
  }

  if (context.brand) {
    prompt += `Brand: ${context.brand}\n`;
  }

  if (context.author) {
    prompt += `Author: ${context.author}\n`;
  }

  if (context.channel) {
    prompt += `Channel: ${context.channel}\n`;
  }

  prompt += `\nURL: ${context.url}\n`;
  prompt += `\nTone: ${tone}`;
  prompt += includeHashtags ? '\nInclude 3-5 relevant hashtags.' : '\nDo not include hashtags.';
  prompt += includeEmoji ? '\nInclude appropriate emojis.' : '\nMinimize emoji usage.';

  return prompt;
}

function extractHashtags(content: string): string[] {
  const matches = content.match(/#[\w]+/g);
  return matches ? [...new Set(matches)] : [];
}
