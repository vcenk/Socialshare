import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ExtensionMessage, GenerationRequest, UserCredits, User } from '@shared/types';

// Initialize Supabase client
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

let supabase: SupabaseClient | null = null;

const getSupabase = (): SupabaseClient => {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: {
          getItem: async (key) => {
            const result = await chrome.storage.local.get(key);
            return result[key] ?? null;
          },
          setItem: async (key, value) => {
            await chrome.storage.local.set({ [key]: value });
          },
          removeItem: async (key) => {
            await chrome.storage.local.remove(key);
          },
        },
        autoRefreshToken: true,
        persistSession: true,
      },
    });
  }
  return supabase;
};

// Message handler
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message: ExtensionMessage): Promise<ExtensionMessage> {
  const client = getSupabase();

  switch (message.type) {
    case 'AUTH_STATUS':
      return handleAuthStatus(client);

    case 'LOGIN':
      return handleLogin(client, message.payload as { email: string; password: string });

    case 'LOGOUT':
      return handleLogout(client);

    case 'GET_CREDITS':
      return handleGetCredits(client);

    case 'GENERATE_CONTENT':
      return handleGenerateContent(client, message.payload as GenerationRequest);

    default:
      return { type: message.type, error: 'Unknown message type' };
  }
}

async function handleAuthStatus(client: SupabaseClient): Promise<ExtensionMessage> {
  try {
    const { data: { session } } = await client.auth.getSession();

    if (session?.user) {
      const user: User = {
        id: session.user.id,
        email: session.user.email ?? '',
        credits: {
          textCredits: 0,
          imageCredits: 0,
          videoCredits: 0,
          plan: 'free',
        },
      };
      return { type: 'AUTH_STATUS', payload: { user } };
    }

    return { type: 'AUTH_STATUS', payload: { user: null } };
  } catch (error) {
    return { type: 'AUTH_STATUS', error: 'Failed to check auth status' };
  }
}

async function handleLogin(
  client: SupabaseClient,
  payload: { email: string; password: string }
): Promise<ExtensionMessage> {
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });

    if (error) {
      return { type: 'LOGIN', error: error.message };
    }

    if (data.user) {
      const user: User = {
        id: data.user.id,
        email: data.user.email ?? '',
        credits: {
          textCredits: 10,
          imageCredits: 0,
          videoCredits: 0,
          plan: 'free',
        },
      };
      return { type: 'LOGIN', payload: { user } };
    }

    return { type: 'LOGIN', error: 'Login failed' };
  } catch (error) {
    return { type: 'LOGIN', error: 'Login failed' };
  }
}

async function handleLogout(client: SupabaseClient): Promise<ExtensionMessage> {
  try {
    await client.auth.signOut();
    return { type: 'LOGOUT', payload: { success: true } };
  } catch (error) {
    return { type: 'LOGOUT', error: 'Logout failed' };
  }
}

async function handleGetCredits(client: SupabaseClient): Promise<ExtensionMessage> {
  try {
    const { data: { session } } = await client.auth.getSession();

    if (!session?.user) {
      return { type: 'GET_CREDITS', error: 'Not authenticated' };
    }

    const { data, error } = await client.functions.invoke('credits-check', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      return { type: 'GET_CREDITS', error: error.message };
    }

    const credits: UserCredits = {
      textCredits: data?.text_credits ?? 10,
      imageCredits: data?.image_credits ?? 0,
      videoCredits: data?.video_credits ?? 0,
      plan: data?.plan ?? 'free',
    };

    return { type: 'CREDITS_RESULT', payload: credits };
  } catch (error) {
    return { type: 'GET_CREDITS', error: 'Failed to fetch credits' };
  }
}

async function handleGenerateContent(
  client: SupabaseClient,
  payload: GenerationRequest
): Promise<ExtensionMessage> {
  try {
    const { data: { session } } = await client.auth.getSession();

    if (!session?.user) {
      return { type: 'GENERATION_RESULT', error: 'Not authenticated' };
    }

    const { data, error } = await client.functions.invoke('generate-text', {
      body: payload,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      return { type: 'GENERATION_RESULT', error: error.message };
    }

    return {
      type: 'GENERATION_RESULT',
      payload: {
        id: data.id,
        content: data.content,
        hashtags: data.hashtags ?? [],
        platform: payload.platform,
        characterCount: data.content.length,
      },
    };
  } catch (error) {
    return { type: 'GENERATION_RESULT', error: 'Generation failed' };
  }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('SocialForge installed');
  }
});

// Enable side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
