import React from 'react';
import { ShoppingBag, FileText, Play, Share2, Globe } from 'lucide-react';
import type { PageContext, ContextType } from '@shared/types';

interface ContextCardProps {
  context: PageContext;
}

const CONTEXT_ICONS: Record<ContextType, React.ReactNode> = {
  product: <ShoppingBag className="w-5 h-5" />,
  article: <FileText className="w-5 h-5" />,
  video: <Play className="w-5 h-5" />,
  social: <Share2 className="w-5 h-5" />,
  general: <Globe className="w-5 h-5" />,
};

const CONTEXT_LABELS: Record<ContextType, string> = {
  product: 'Product',
  article: 'Article',
  video: 'Video',
  social: 'Social Post',
  general: 'Web Page',
};

export function ContextCard({ context }: ContextCardProps) {
  return (
    <div className="card">
      <div className="flex items-start gap-3">
        {context.images[0] && (
          <img
            src={context.images[0]}
            alt=""
            className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            {CONTEXT_ICONS[context.type]}
            <span>{CONTEXT_LABELS[context.type]} detected</span>
          </div>

          <h3 className="font-medium text-gray-900 line-clamp-2">
            {context.title}
          </h3>

          {context.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
              {context.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
