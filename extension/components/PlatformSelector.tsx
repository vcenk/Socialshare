import React from 'react';
import { Linkedin, Twitter } from 'lucide-react';
import { clsx } from 'clsx';
import { MVP_PLATFORMS, getPlatformConfig } from '../config/platforms';
import type { Platform } from '@shared/types';

interface PlatformSelectorProps {
  selected: Platform;
  onSelect: (platform: Platform) => void;
}

const PLATFORM_ICONS: Record<Platform, React.ReactNode> = {
  linkedin: <Linkedin className="w-5 h-5" />,
  twitter: <Twitter className="w-5 h-5" />,
  facebook: null,
  instagram: null,
  tiktok: null,
};

export function PlatformSelector({ selected, onSelect }: PlatformSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">Platform</label>
      <div className="flex gap-2">
        {MVP_PLATFORMS.map((platformId) => {
          const config = getPlatformConfig(platformId);
          const isSelected = selected === platformId;

          return (
            <button
              key={platformId}
              onClick={() => onSelect(platformId)}
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all',
                isSelected
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
              )}
            >
              {PLATFORM_ICONS[platformId]}
              <span className="font-medium">{config.name}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">
        Max {getPlatformConfig(selected).maxLength.toLocaleString()} characters
      </p>
    </div>
  );
}
