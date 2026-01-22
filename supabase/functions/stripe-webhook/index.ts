import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// Credit allocations by plan
const PLAN_CREDITS = {
  pro: { text: 100, image: 30, video: 0 },
  business: { text: 999999, image: 100, video: 20 }, // "Unlimited" text
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify webhook signature
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(supabase, session);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(supabase, subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCanceled(supabase, subscription);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(supabase, invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Webhook handler failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleCheckoutComplete(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session
) {
  const userId = session.client_reference_id;
  const customerId = session.customer as string;

  if (!userId) {
    console.error('No user ID in checkout session');
    return;
  }

  // Determine plan from metadata or price
  const plan = session.metadata?.plan || 'pro';
  const credits = PLAN_CREDITS[plan as keyof typeof PLAN_CREDITS] || PLAN_CREDITS.pro;

  await supabase
    .from('credits')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: session.subscription as string,
      plan,
      text_credits: credits.text,
      image_credits: credits.image,
      video_credits: credits.video,
      credits_reset_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  console.log(`User ${userId} upgraded to ${plan}`);
}

async function handleSubscriptionUpdate(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  // Get plan from subscription items
  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);
  const credits = PLAN_CREDITS[plan as keyof typeof PLAN_CREDITS] || PLAN_CREDITS.pro;

  await supabase
    .from('credits')
    .update({
      plan,
      text_credits: credits.text,
      image_credits: credits.image,
      video_credits: credits.video,
    })
    .eq('stripe_customer_id', customerId);
}

async function handleSubscriptionCanceled(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  // Downgrade to free
  await supabase
    .from('credits')
    .update({
      plan: 'free',
      text_credits: 10,
      image_credits: 0,
      video_credits: 0,
      stripe_subscription_id: null,
    })
    .eq('stripe_customer_id', customerId);

  console.log(`Customer ${customerId} downgraded to free`);
}

async function handleInvoicePaid(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice
) {
  // Reset monthly credits on successful payment
  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) return;

  // Get current plan
  const { data: credits } = await supabase
    .from('credits')
    .select('plan')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!credits) return;

  const planCredits = PLAN_CREDITS[credits.plan as keyof typeof PLAN_CREDITS];
  if (!planCredits) return;

  // Reset credits
  await supabase
    .from('credits')
    .update({
      text_credits: planCredits.text,
      image_credits: planCredits.image,
      video_credits: planCredits.video,
      credits_reset_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId);

  console.log(`Credits reset for customer ${customerId}`);
}

function getPlanFromPriceId(priceId: string): string {
  // Map your Stripe price IDs to plans
  const priceMap: Record<string, string> = {
    // Add your actual Stripe price IDs here
    'price_pro_monthly': 'pro',
    'price_business_monthly': 'business',
  };

  return priceMap[priceId] || 'pro';
}
