import { useState } from 'react';
import { Copy, Check, RefreshCw, Send } from 'lucide-react';
import { getPlatformConfig } from '../config/platforms';
import type { Platform } from '@shared/types';

interface ContentPreviewProps {
  content: string;
  platform: Platform;
  onInsert: () => void;
  onRegenerate: () => void;
}

export function ContentPreview({
  content,
  platform,
  onInsert,
  onRegenerate,
}: ContentPreviewProps) {
  const [copied, setCopied] = useState(false);
  const config = getPlatformConfig(platform);
  const isOverLimit = content.length > config.maxLength;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900">Generated Content</h4>
        <span
          className={`text-xs font-medium ${
            isOverLimit ? 'text-red-600' : 'text-gray-500'
          }`}
        >
          {content.length}/{config.maxLength}
        </span>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap max-h-48 overflow-y-auto">
        {content}
      </div>

      {isOverLimit && (
        <p className="text-xs text-red-600">
          Content exceeds {config.name} character limit. Consider shortening.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="btn-secondary flex-1"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-1.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-1.5" />
              Copy
            </>
          )}
        </button>

        <button
          onClick={onRegenerate}
          className="btn-secondary"
          title="Regenerate"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <button
          onClick={onInsert}
          className="btn-accent flex-1"
        >
          <Send className="w-4 h-4 mr-1.5" />
          Insert
        </button>
      </div>
    </div>
  );
}
