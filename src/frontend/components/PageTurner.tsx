interface PageTurnerProps {
  pageNumber: number;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function PageTurner({ pageNumber, canGoNext, onPrev, onNext }: PageTurnerProps) {
  return (
    <nav className="page-turner" aria-label="Page navigation">
      <button type="button" onClick={onPrev} disabled={pageNumber <= 1}>
        Previous
      </button>
      <span>Page {pageNumber}</span>
      <button type="button" onClick={onNext} disabled={!canGoNext}>
        Next
      </button>
    </nav>
  );
}
