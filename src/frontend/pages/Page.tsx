import type { PageApiRecord, PageState } from '../types';

interface StoryPageProps {
  page: PageApiRecord | null;
  state: PageState;
}

export function StoryPage({ page, state }: StoryPageProps) {
  if (!page || state === 'loading') {
    return (
      <article className="story-page loading">
        <div className="image placeholder">Finding the page...</div>
        <p>Turning to the page...</p>
      </article>
    );
  }

  const paragraphs = page.text
    .split(/\n\s*\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  const imageBody =
    page.image_status === 'done' && page.image_url ? (
      <img src={page.image_url} alt={`Illustration for page ${page.page_number}`} />
    ) : (
      <div className="image placeholder">
        {page.image_status === 'failed'
          ? 'The illustration did not arrive, but the story keeps going.'
          : page.image_status === 'generating'
            ? 'The illustration is still being drawn.'
            : 'The illustration has not been generated yet.'}
      </div>
    );

  return (
    <article className={`story-page ${state}`}>
      <div className="story-text story-script">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="image story-visual">{imageBody}</div>
    </article>
  );
}
