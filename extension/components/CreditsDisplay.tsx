import React from 'react';
import { Zap, Image, Video } from 'lucide-react';
import type { UserCredits } from '@shared/types';

interface CreditsDisplayProps {
  credits: UserCredits | null;
}

export function CreditsDisplay({ credits }: CreditsDisplayProps) {
  if (!credits) return null;

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5 text-primary-600">
        <Zap className="w-4 h-4" />
        <span className="font-medium">{credits.textCredits}</span>
        <span className="text-gray-500">texts</span>
      </div>

      {credits.imageCredits > 0 && (
        <div className="flex items-center gap-1.5 text-accent-600">
          <Image className="w-4 h-4" />
          <span className="font-medium">{credits.imageCredits}</span>
          <span className="text-gray-500">images</span>
        </div>
      )}

      {credits.videoCredits > 0 && (
        <div className="flex items-center gap-1.5 text-purple-600">
          <Video className="w-4 h-4" />
          <span className="font-medium">{credits.videoCredits}</span>
          <span className="text-gray-500">videos</span>
        </div>
      )}

      <span className="ml-auto px-2 py-0.5 bg-gray-100 rounded text-xs font-medium capitalize">
        {credits.plan}
      </span>
    </div>
  );
}
