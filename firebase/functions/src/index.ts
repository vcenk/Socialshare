import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();

// Initialize clients lazily
let openai: OpenAI | null = null;
let stripe: Stripe | null = null;

const getOpenAI = (): OpenAI => {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || functions.config().openai?.key,
    });
  }
  return openai;
};

const getStripe = (): Stripe => {
  if (!stripe) {
    stripe = new Stripe(
      process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret_key,
      { apiVersion: '2023-10-16' }
    );
  }
  return stripe;
};

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

// Types
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
  platform: string;
  tone: string;
  includeHashtags: boolean;
  includeEmoji: boolean;
}

interface UserCredits {
  textCredits: number;
  imageCredits: number;
  videoCredits: number;
  plan: string;
  stripeCustomerId?: string;
  updatedAt: admin.firestore.Timestamp;
}

// ============== HELPER FUNCTIONS ==============

/**
 * Verify Firebase Auth token and return user
 */
async function verifyAuth(req: functions.https.Request): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    return await admin.auth().verifyIdToken(token);
  } catch {
    return null;
  }
}

/**
 * Validate generate request body
 */
function validateRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'Invalid request body';
  }

  const req = body as Record<string, unknown>;

  if (!req.platform || !VALID_PLATFORMS.includes(req.platform as string)) {
    return 'Invalid platform';
  }

  if (!req.tone || !VALID_TONES.includes(req.tone as string)) {
    return 'Invalid tone';
  }

  if (!req.context || typeof req.context !== 'object') {
    return 'Invalid context';
  }

  const ctx = req.context as Record<string, unknown>;

  if (!ctx.type || !VALID_CONTEXT_TYPES.includes(ctx.type as string)) {
    return 'Invalid context type';
  }

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

  if (!ctx.title || typeof ctx.title !== 'string') {
    return 'Invalid title';
  }

  if ((ctx.title as string).length > MAX_TITLE_LENGTH) {
    return 'Title too long';
  }

  if (ctx.description && (typeof ctx.description !== 'string' || (ctx.description as string).length > MAX_DESCRIPTION_LENGTH)) {
    return 'Invalid description';
  }

  if (typeof req.includeHashtags !== 'boolean' || typeof req.includeEmoji !== 'boolean') {
    return 'Invalid options';
  }

  return null;
}

/**
 * Sanitize user input to prevent prompt injection
 */
function sanitizeForPrompt(text: string | undefined, maxLength: number): string {
  if (!text) return '';

  let sanitized = text
    .replace(/\b(ignore|disregard|forget|override|system|instruction|prompt|assistant|user|human)\b.*?(above|previous|all|everything)/gi, '[removed]')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/---+/g, '')
    .replace(/(?:javascript|data|vbscript):/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }

  return sanitized;
}

/**
 * Build the prompt for OpenAI
 */
function buildPrompt(
  context: GenerateRequest['context'],
  platform: string,
  tone: string,
  includeHashtags: boolean,
  includeEmoji: boolean
): string {
  const safeTitle = sanitizeForPrompt(context.title, MAX_TITLE_LENGTH);
  const safeDescription = sanitizeForPrompt(context.description, MAX_DESCRIPTION_LENGTH);
  const safePrice = sanitizeForPrompt(context.price, 50);
  const safeBrand = sanitizeForPrompt(context.brand, 100);
  const safeAuthor = sanitizeForPrompt(context.author, 100);
  const safeChannel = sanitizeForPrompt(context.channel, 100);

  let safeUrl = '';
  try {
    const url = new URL(context.url);
    if (['http:', 'https:'].includes(url.protocol)) {
      safeUrl = url.href;
    }
  } catch {
    safeUrl = '[invalid url]';
  }

  let prompt = `Generate a ${platform} post for the following content:\n\n`;
  prompt += `CONTENT TYPE: ${context.type}\n`;
  prompt += `TITLE: ${safeTitle}\n`;

  if (safeDescription) prompt += `DESCRIPTION: ${safeDescription}\n`;
  if (safePrice) prompt += `PRICE: ${safePrice}\n`;
  if (safeBrand) prompt += `BRAND: ${safeBrand}\n`;
  if (safeAuthor) prompt += `AUTHOR: ${safeAuthor}\n`;
  if (safeChannel) prompt += `CHANNEL: ${safeChannel}\n`;

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
  return matches ? [...new Set(matches)].slice(0, 10) : [];
}

// ============== CLOUD FUNCTIONS ==============

/**
 * Check user credits
 */
export const creditsCheck = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const creditsDoc = await db.collection('credits').doc(user.uid).get();

    if (!creditsDoc.exists) {
      // Create default credits for new user
      const defaultCredits: UserCredits = {
        textCredits: 10,
        imageCredits: 0,
        videoCredits: 0,
        plan: 'free',
        updatedAt: admin.firestore.Timestamp.now(),
      };
      await db.collection('credits').doc(user.uid).set(defaultCredits);
      res.json(defaultCredits);
      return;
    }

    res.json(creditsDoc.data());
  } catch (error) {
    console.error('Credits check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Generate text content
 */
export const generateText = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Validate request
  const validationError = validateRequest(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const body = req.body as GenerateRequest;

  try {
    // Check credits
    const creditsRef = db.collection('credits').doc(user.uid);
    const creditsDoc = await creditsRef.get();

    if (!creditsDoc.exists) {
      res.status(402).json({ error: 'No credits found' });
      return;
    }

    const credits = creditsDoc.data() as UserCredits;
    if (credits.textCredits < 1) {
      res.status(402).json({ error: 'Insufficient credits' });
      return;
    }

    // Build prompt and call OpenAI
    const prompt = buildPrompt(
      body.context,
      body.platform,
      body.tone,
      body.includeHashtags,
      body.includeEmoji
    );

    const charLimit = PLATFORM_LIMITS[body.platform] || 500;
    const systemPrompt = `You are an expert social media content creator. Generate engaging ${body.platform} posts.

Rules:
- Keep content under ${charLimit} characters
- Match the ${body.tone} tone exactly
- Be authentic and engaging
- Use natural language
- If including hashtags, place them naturally or at the end
- Do not use markdown formatting
- Write ready-to-post content only, no explanations`;

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const generatedContent = completion.choices[0]?.message?.content || '';

    // Deduct credit (transaction)
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(creditsRef);
      const currentCredits = doc.data()?.textCredits || 0;
      if (currentCredits < 1) {
        throw new Error('Insufficient credits');
      }
      transaction.update(creditsRef, {
        textCredits: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.Timestamp.now(),
      });
    });

    // Log generation
    await db.collection('generations').add({
      userId: user.uid,
      type: 'text',
      platform: body.platform,
      contextType: body.context.type,
      tone: body.tone,
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
      model: 'gpt-4o',
      createdAt: admin.firestore.Timestamp.now(),
    });

    res.json({
      id: db.collection('generations').doc().id,
      content: generatedContent,
      hashtags: extractHashtags(generatedContent),
      characterCount: generatedContent.length,
    });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: 'Generation failed' });
  }
});

/**
 * Save draft
 */
export const draftsSave = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { content, platform, imageUrl } = req.body;

  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'Invalid content' });
    return;
  }

  if (content.length > 10000) {
    res.status(400).json({ error: 'Content too long' });
    return;
  }

  try {
    const draftRef = await db.collection('drafts').add({
      userId: user.uid,
      content: content.substring(0, 10000),
      platform: platform || null,
      imageUrl: imageUrl || null,
      createdAt: admin.firestore.Timestamp.now(),
    });

    res.json({ id: draftRef.id, success: true });
  } catch (error) {
    console.error('Save draft error:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

/**
 * List drafts
 */
export const draftsList = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const draftsSnapshot = await db
      .collection('drafts')
      .where('userId', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const drafts = draftsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ drafts });
  } catch (error) {
    console.error('List drafts error:', error);
    res.status(500).json({ error: 'Failed to list drafts' });
  }
});

/**
 * Stripe webhook handler
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || functions.config().stripe?.webhook_secret;

  if (!sig || !webhookSecret) {
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      req.rawBody,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  const PLAN_CREDITS = {
    pro: { text: 100, image: 30, video: 0 },
    business: { text: 999999, image: 100, video: 20 },
  };

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;

        if (userId) {
          const plan = (session.metadata?.plan || 'pro') as keyof typeof PLAN_CREDITS;
          const credits = PLAN_CREDITS[plan] || PLAN_CREDITS.pro;

          await db.collection('credits').doc(userId).update({
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            plan,
            textCredits: credits.text,
            imageCredits: credits.image,
            videoCredits: credits.video,
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const creditsSnapshot = await db
          .collection('credits')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!creditsSnapshot.empty) {
          await creditsSnapshot.docs[0].ref.update({
            plan: 'free',
            textCredits: 10,
            imageCredits: 0,
            videoCredits: 0,
            stripeSubscriptionId: null,
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const creditsSnapshot = await db
          .collection('credits')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!creditsSnapshot.empty) {
          const doc = creditsSnapshot.docs[0];
          const plan = doc.data().plan as keyof typeof PLAN_CREDITS;
          const credits = PLAN_CREDITS[plan];

          if (credits) {
            await doc.ref.update({
              textCredits: credits.text,
              imageCredits: credits.image,
              videoCredits: credits.video,
              updatedAt: admin.firestore.Timestamp.now(),
            });
          }
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

/**
 * Initialize user credits on signup (trigger)
 */
export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  const defaultCredits: UserCredits = {
    textCredits: 10,
    imageCredits: 0,
    videoCredits: 0,
    plan: 'free',
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await db.collection('credits').doc(user.uid).set(defaultCredits);
  console.log(`Created default credits for user ${user.uid}`);
});
