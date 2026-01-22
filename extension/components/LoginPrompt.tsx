import { useState } from 'react';
import { Sparkles, Mail, Lock, Loader2 } from 'lucide-react';
import { useStore } from '../store';

export function LoginPrompt() {
  const { login, isLoading, error } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gradient-to-r from-primary-600 to-accent-600 text-white px-6 py-8 text-center">
        <div className="flex justify-center mb-3">
          <div className="bg-white/20 rounded-full p-3">
            <Sparkles className="w-8 h-8" />
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-2">SocialForge</h1>
        <p className="text-white/80 text-sm">
          AI-powered social media content generator
        </p>
      </div>

      <div className="flex-1 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input pl-10"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-10"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full py-2.5"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isSignUp ? 'Creating account...' : 'Signing in...'}
              </>
            ) : (
              isSignUp ? 'Create Account' : 'Sign In'
            )}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-primary-600 hover:underline"
          >
            {isSignUp
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </button>
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Free tier includes 10 text generations/month</p>
        </div>
      </div>
    </div>
  );
}
