interface WordPickerProps {
  words: {
    a: string;
    b: string;
    c: string;
  };
  disabled: boolean;
  onPick: (key: 'a' | 'b' | 'c') => void;
}

export function WordPicker({ words, disabled, onPick }: WordPickerProps) {
  return (
    <section className="word-picker" aria-live="polite">
      <h2>Turn the page with one word</h2>
      <div className="word-buttons">
        <button disabled={disabled} onClick={() => onPick('a')} type="button">
          {words.a}
        </button>
        <button disabled={disabled} onClick={() => onPick('b')} type="button">
          {words.b}
        </button>
        <button disabled={disabled} onClick={() => onPick('c')} type="button">
          {words.c}
        </button>
      </div>
    </section>
  );
}
