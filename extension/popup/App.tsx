import React, { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { ContextCard } from '../components/ContextCard';
import { PlatformSelector } from '../components/PlatformSelector';
import { ToneSelector } from '../components/ToneSelector';
import { GenerateButton } from '../components/GenerateButton';
import { ContentPreview } from '../components/ContentPreview';
import { CreditsDisplay } from '../components/CreditsDisplay';
import { LoginPrompt } from '../components/LoginPrompt';
import { useStore } from '../store';
import type { Platform, ToneType, PageContext } from '@shared/types';

export function App() {
  const { user, credits, isLoading, error, fetchCredits, checkAuth } = useStore();
  const [context, setContext] = useState<PageContext | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('linkedin');
  const [selectedTone, setSelectedTone] = useState<ToneType>('professional');
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [includeHashtags, setIncludeHashtags] = useState(true);

  useEffect(() => {
    checkAuth();
    fetchPageContext();
  }, []);

  useEffect(() => {
    if (user) {
      fetchCredits();
    }
  }, [user]);

  const fetchPageContext = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' });
        if (response?.payload) {
          setContext(response.payload);
        }
      }
    } catch (err) {
      console.error('Failed to get page context:', err);
    }
  };

  const handleGenerate = async () => {
    if (!context || !user) return;

    setIsGenerating(true);
    setGeneratedContent(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_CONTENT',
        payload: {
          context,
          platform: selectedPlatform,
          tone: selectedTone,
          includeHashtags,
          includeEmoji: selectedTone === 'casual' || selectedTone === 'humorous',
        },
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      setGeneratedContent(response.payload.content);
      fetchCredits();
    } catch (err) {
      console.error('Generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsert = async () => {
    if (!generatedContent) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'INJECT_CONTENT',
          payload: {
            content: generatedContent,
            platform: selectedPlatform,
          },
        });
      }
    } catch (err) {
      console.error('Injection failed:', err);
      await navigator.clipboard.writeText(generatedContent);
      alert('Content copied to clipboard! Paste it in the compose box.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPrompt />;
  }

  return (
    <div className="flex flex-col h-full">
      <Header />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <CreditsDisplay credits={credits} />

        {context ? (
          <ContextCard context={context} />
        ) : (
          <div className="card text-center text-gray-500 py-8">
            <p>No context detected on this page.</p>
            <p className="text-sm mt-2">Try visiting a product page or article.</p>
          </div>
        )}

        <PlatformSelector
          selected={selectedPlatform}
          onSelect={setSelectedPlatform}
        />

        <ToneSelector
          selected={selectedTone}
          onSelect={setSelectedTone}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeHashtags}
            onChange={(e) => setIncludeHashtags(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Include hashtags
        </label>

        <GenerateButton
          onClick={handleGenerate}
          disabled={!context || isGenerating || (credits?.textCredits ?? 0) < 1}
          isLoading={isGenerating}
        />

        {generatedContent && (
          <ContentPreview
            content={generatedContent}
            platform={selectedPlatform}
            onInsert={handleInsert}
            onRegenerate={handleGenerate}
          />
        )}

        {error && (
          <div className="text-red-600 text-sm text-center">{error}</div>
        )}
      </div>
    </div>
  );
}
