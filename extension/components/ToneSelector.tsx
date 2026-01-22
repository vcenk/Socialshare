
import { clsx } from 'clsx';
import type { ToneType } from '@shared/types';

interface ToneSelectorProps {
  selected: ToneType;
  onSelect: (tone: ToneType) => void;
}

const TONES: { id: ToneType; label: string; emoji: string }[] = [
  { id: 'professional', label: 'Professional', emoji: '💼' },
  { id: 'casual', label: 'Casual', emoji: '😊' },
  { id: 'humorous', label: 'Humorous', emoji: '😄' },
  { id: 'promotional', label: 'Promotional', emoji: '🎯' },
  { id: 'educational', label: 'Educational', emoji: '📚' },
];

export function ToneSelector({ selected, onSelect }: ToneSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">Tone</label>
      <div className="flex flex-wrap gap-2">
        {TONES.map((tone) => (
          <button
            key={tone.id}
            onClick={() => onSelect(tone.id)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
              selected === tone.id
                ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {tone.emoji} {tone.label}
          </button>
        ))}
      </div>
    </div>
  );
}
