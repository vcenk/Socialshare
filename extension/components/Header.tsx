import React from 'react';
import { Sparkles, Settings, LogOut } from 'lucide-react';
import { useStore } from '../store';

export function Header() {
  const { user, logout } = useStore();

  return (
    <header className="bg-gradient-to-r from-primary-600 to-accent-600 text-white px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6" />
          <h1 className="text-lg font-bold">SocialForge</h1>
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <>
              <span className="text-sm text-white/80 truncate max-w-[120px]">
                {user.email}
              </span>
              <button
                onClick={logout}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
