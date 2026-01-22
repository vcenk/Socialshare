import { PLATFORMS } from '../config/platforms';
import type { Platform } from '@shared/types';

// Valid platforms for injection
const VALID_PLATFORMS: Platform[] = ['linkedin', 'twitter', 'facebook', 'instagram', 'tiktok'];

// Listen for injection requests - only from extension context
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Security: Only accept messages from our extension
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ type: 'INJECTION_RESULT', payload: { success: false, method: 'failed', error: 'Unauthorized' } });
    return true;
  }

  if (message.type === 'INJECT_CONTENT') {
    const payload = message.payload;

    // Validate payload structure
    if (!payload || typeof payload.content !== 'string' || typeof payload.platform !== 'string') {
      sendResponse({ type: 'INJECTION_RESULT', payload: { success: false, method: 'failed', error: 'Invalid payload' } });
      return true;
    }

    // Validate platform
    if (!VALID_PLATFORMS.includes(payload.platform as Platform)) {
      sendResponse({ type: 'INJECTION_RESULT', payload: { success: false, method: 'failed', error: 'Invalid platform' } });
      return true;
    }

    // Validate content length (prevent DoS)
    if (payload.content.length > 100000) {
      sendResponse({ type: 'INJECTION_RESULT', payload: { success: false, method: 'failed', error: 'Content too long' } });
      return true;
    }

    const result = injectContent(payload.content, payload.platform as Platform);
    sendResponse({ type: 'INJECTION_RESULT', payload: result });
  }
  return true;
});

interface InjectionResult {
  success: boolean;
  method: 'direct' | 'clipboard' | 'failed';
  error?: string;
}

function injectContent(content: string, platform: Platform): InjectionResult {
  const config = PLATFORMS[platform];
  if (!config) {
    return { success: false, method: 'failed', error: 'Unknown platform' };
  }

  // Try each selector
  for (const selector of config.injectorSelector) {
    const element = document.querySelector(selector);
    if (element) {
      const result = tryInject(element as HTMLElement, content, platform);
      if (result.success) {
        return result;
      }
    }
  }

  // Fallback: try to find any contenteditable
  const contentEditable = document.querySelector('[contenteditable="true"]');
  if (contentEditable) {
    const result = tryInject(contentEditable as HTMLElement, content, platform);
    if (result.success) {
      return result;
    }
  }

  return { success: false, method: 'failed', error: 'Could not find compose box' };
}

function tryInject(element: HTMLElement, content: string, platform: Platform): InjectionResult {
  const sanitizedContent = sanitizeForInjection(content);

  try {
    // Different injection strategies based on platform and element type
    if (platform === 'twitter') {
      return injectTwitter(element, sanitizedContent);
    }

    if (platform === 'linkedin') {
      return injectLinkedIn(element, sanitizedContent);
    }

    if (platform === 'facebook') {
      return injectFacebook(element, sanitizedContent);
    }

    // Generic injection for other platforms
    return injectGeneric(element, sanitizedContent);
  } catch (error) {
    console.error('Injection error:', error);
    return {
      success: false,
      method: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function injectTwitter(element: HTMLElement, content: string): InjectionResult {
  // Twitter/X uses Draft.js
  element.focus();

  // Clear existing content
  const existingText = element.querySelector('[data-text="true"]');
  if (existingText) {
    existingText.textContent = '';
  }

  // Use execCommand for compatibility
  document.execCommand('insertText', false, content);

  // Dispatch input event to trigger Twitter's handlers
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: content,
  }));

  // Verify injection
  setTimeout(() => {
    const textContent = element.textContent || '';
    if (!textContent.includes(content.substring(0, 20))) {
      // Fallback: try setting innerHTML
      const textNode = element.querySelector('[data-text="true"]') || element;
      textNode.textContent = content;
    }
  }, 100);

  return { success: true, method: 'direct' };
}

function injectLinkedIn(element: HTMLElement, content: string): InjectionResult {
  // LinkedIn uses Quill.js
  element.focus();

  // Clear placeholder if present
  const placeholder = element.querySelector('.ql-placeholder');
  if (placeholder) {
    placeholder.remove();
  }

  // Try using execCommand first
  const success = document.execCommand('insertText', false, content);

  if (!success) {
    // Fallback: direct DOM manipulation
    element.innerHTML = `<p>${escapeHtml(content)}</p>`;
  }

  // Dispatch events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  return { success: true, method: 'direct' };
}

function injectFacebook(element: HTMLElement, content: string): InjectionResult {
  // Facebook uses Lexical editor
  element.focus();

  // Clear existing content
  const paragraphs = element.querySelectorAll('p, span[data-lexical-text]');
  paragraphs.forEach((p) => p.remove());

  // Insert content
  const p = document.createElement('p');
  p.className = 'xdj266r x11i5rnm xat24cr x1mh8g0r';
  p.dir = 'ltr';

  const span = document.createElement('span');
  span.setAttribute('data-lexical-text', 'true');
  span.textContent = content;
  p.appendChild(span);

  element.appendChild(p);

  // Dispatch events
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
  }));

  return { success: true, method: 'direct' };
}

function injectGeneric(element: HTMLElement, content: string): InjectionResult {
  element.focus();

  // Try textarea/input
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    element.value = content;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, method: 'direct' };
  }

  // Try contenteditable
  if (element.getAttribute('contenteditable') === 'true') {
    // Try execCommand first
    const success = document.execCommand('insertText', false, content);

    if (!success) {
      element.innerHTML = escapeHtml(content);
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    return { success: true, method: 'direct' };
  }

  return { success: false, method: 'failed', error: 'Unsupported element type' };
}

/**
 * Sanitize content for injection.
 * Since we're inserting into text fields, we primarily need to ensure
 * no executable code can be injected.
 */
function sanitizeForInjection(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // Use DOM to safely get text content (this removes all HTML)
  const temp = document.createElement('div');
  temp.textContent = content;
  let sanitized = temp.textContent || '';

  // Additional safety: remove dangerous URI schemes that might have slipped through
  sanitized = sanitized
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '');

  // Normalize whitespace but preserve intentional line breaks
  sanitized = sanitized
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n +/g, '\n')
    .replace(/ +\n/g, '\n')
    .trim();

  return sanitized;
}

/**
 * Escape HTML entities for safe insertion into innerHTML.
 * This converts special characters to their HTML entity equivalents.
 */
function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Observe DOM changes for dynamic compose boxes
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        // Check if new compose box appeared
        const composeBox = node.querySelector?.('[contenteditable="true"], textarea');
        if (composeBox) {
          console.log('SocialForge: New compose box detected');
        }
      }
    }
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

console.log('SocialForge injector loaded');
