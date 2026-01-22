import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import type { ExtensionMessage, GenerationRequest, UserCredits, User } from '@shared/types';

// Firebase configuration - Replace with your config
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// Cloud Functions base URL - Replace with your deployed URL
const FUNCTIONS_URL = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Current user state
let currentUser: FirebaseUser | null = null;

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  console.log('Auth state changed:', user?.email ?? 'logged out');
});

// Helper to get ID token
async function getIdToken(): Promise<string | null> {
  if (!currentUser) return null;
  try {
    return await currentUser.getIdToken();
  } catch {
    return null;
  }
}

// Helper for API calls
async function apiCall<T>(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<{ data?: T; error?: string }> {
  const token = await getIdToken();
  if (!token) {
    return { error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${FUNCTIONS_URL}/${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'Request failed' };
    }

    return { data };
  } catch (error) {
    console.error(`API call failed (${endpoint}):`, error);
    return { error: 'Network error' };
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message: ExtensionMessage): Promise<ExtensionMessage> {
  switch (message.type) {
    case 'AUTH_STATUS':
      return handleAuthStatus();

    case 'LOGIN':
      return handleLogin(message.payload as { email: string; password: string });

    case 'SIGNUP':
      return handleSignup(message.payload as { email: string; password: string });

    case 'LOGOUT':
      return handleLogout();

    case 'GET_CREDITS':
      return handleGetCredits();

    case 'GENERATE_CONTENT':
      return handleGenerateContent(message.payload as GenerationRequest);

    case 'SAVE_DRAFT':
      return handleSaveDraft(message.payload as { content: string; platform?: string });

    case 'GET_DRAFTS':
      return handleGetDrafts();

    default:
      return { type: message.type, error: 'Unknown message type' };
  }
}

async function handleAuthStatus(): Promise<ExtensionMessage> {
  try {
    // Wait a bit for auth state to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (currentUser) {
      const user: User = {
        id: currentUser.uid,
        email: currentUser.email ?? '',
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

async function handleLogin(payload: { email: string; password: string }): Promise<ExtensionMessage> {
  try {
    const { email, password } = payload;

    // Basic validation
    if (!email || !password) {
      return { type: 'LOGIN', error: 'Email and password are required' };
    }

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    const user: User = {
      id: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      credits: {
        textCredits: 10,
        imageCredits: 0,
        videoCredits: 0,
        plan: 'free',
      },
    };

    return { type: 'LOGIN', payload: { user } };
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    let errorMessage = 'Login failed';

    switch (firebaseError.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        errorMessage = 'Invalid email or password';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address';
        break;
      case 'auth/too-many-requests':
        errorMessage = 'Too many attempts. Try again later';
        break;
    }

    return { type: 'LOGIN', error: errorMessage };
  }
}

async function handleSignup(payload: { email: string; password: string }): Promise<ExtensionMessage> {
  try {
    const { email, password } = payload;

    if (!email || !password) {
      return { type: 'SIGNUP', error: 'Email and password are required' };
    }

    if (password.length < 6) {
      return { type: 'SIGNUP', error: 'Password must be at least 6 characters' };
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    // Credits are created automatically by Cloud Function trigger
    const user: User = {
      id: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      credits: {
        textCredits: 10,
        imageCredits: 0,
        videoCredits: 0,
        plan: 'free',
      },
    };

    return { type: 'SIGNUP', payload: { user } };
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    let errorMessage = 'Signup failed';

    switch (firebaseError.code) {
      case 'auth/email-already-in-use':
        errorMessage = 'Email already in use';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address';
        break;
      case 'auth/weak-password':
        errorMessage = 'Password is too weak';
        break;
    }

    return { type: 'SIGNUP', error: errorMessage };
  }
}

async function handleLogout(): Promise<ExtensionMessage> {
  try {
    await signOut(auth);
    return { type: 'LOGOUT', payload: { success: true } };
  } catch (error) {
    return { type: 'LOGOUT', error: 'Logout failed' };
  }
}

async function handleGetCredits(): Promise<ExtensionMessage> {
  const { data, error } = await apiCall<UserCredits>('creditsCheck', 'GET');

  if (error) {
    return { type: 'GET_CREDITS', error };
  }

  const credits: UserCredits = {
    textCredits: data?.textCredits ?? 10,
    imageCredits: data?.imageCredits ?? 0,
    videoCredits: data?.videoCredits ?? 0,
    plan: data?.plan ?? 'free',
  };

  return { type: 'CREDITS_RESULT', payload: credits };
}

async function handleGenerateContent(payload: GenerationRequest): Promise<ExtensionMessage> {
  const { data, error } = await apiCall<{
    id: string;
    content: string;
    hashtags: string[];
    characterCount: number;
  }>('generateText', 'POST', payload);

  if (error) {
    return { type: 'GENERATION_RESULT', error };
  }

  return {
    type: 'GENERATION_RESULT',
    payload: {
      id: data!.id,
      content: data!.content,
      hashtags: data!.hashtags ?? [],
      platform: payload.platform,
      characterCount: data!.content.length,
    },
  };
}

async function handleSaveDraft(payload: { content: string; platform?: string }): Promise<ExtensionMessage> {
  const { data, error } = await apiCall<{ id: string; success: boolean }>('draftsSave', 'POST', payload);

  if (error) {
    return { type: 'SAVE_DRAFT', error };
  }

  return { type: 'SAVE_DRAFT', payload: data };
}

async function handleGetDrafts(): Promise<ExtensionMessage> {
  const { data, error } = await apiCall<{ drafts: unknown[] }>('draftsList', 'GET');

  if (error) {
    return { type: 'GET_DRAFTS', error };
  }

  return { type: 'GET_DRAFTS', payload: data };
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('SocialForge installed');
  }
});

// Enable side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
