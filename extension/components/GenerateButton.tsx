
import { Sparkles, Loader2 } from 'lucide-react';

interface GenerateButtonProps {
  onClick: () => void;
  disabled: boolean;
  isLoading: boolean;
}

export function GenerateButton({ onClick, disabled, isLoading }: GenerateButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn-primary w-full py-3 text-base"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <Sparkles className="w-5 h-5 mr-2" />
          Generate Content
        </>
      )}
    </button>
  );
}
