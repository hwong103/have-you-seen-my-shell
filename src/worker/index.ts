import { Hono } from 'hono';
import { getBible } from './bible';
import { getLiveRoomStub, LiveRoom, broadcast } from './live';
import { generateImageForExistingPage, generateNextPage } from './story';
import type { Env, PageRecord } from './types';

const app = new Hono<{ Bindings: Env }>();

function parsePageNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

function chosenWordFromKey(page: PageRecord, key: 'a' | 'b' | 'c'): string {
  if (key === 'a') return page.word_a;
  if (key === 'b') return page.word_b;
  return page.word_c;
}

app.get('/api/pages/latest', async (c) => {
  const latest = await c.env.DB.prepare(
    'SELECT page_number, chosen_word FROM pages ORDER BY page_number DESC LIMIT 1',
  ).first<{ page_number: number; chosen_word: string | null }>();

  if (!latest) {
    return c.json({ error: 'no_pages' }, 404);
  }

  return c.json({
    page_number: latest.page_number,
    has_pending_word: latest.chosen_word === null,
  });
});

app.get('/api/pages/:pageNumber', async (c) => {
  const pageNumber = parsePageNumber(c.req.param('pageNumber'));
  if (!pageNumber) {
    return c.json({ error: 'invalid_page_number' }, 400);
  }

  const cacheKey = `page:${pageNumber}`;
  const cached = await c.env.PAGE_CACHE.get(cacheKey, 'json');

  if (cached) {
    return c.json(cached);
  }

  const page = await c.env.DB.prepare('SELECT * FROM pages WHERE page_number = ?')
    .bind(pageNumber)
    .first<PageRecord>();

  if (!page) {
    return c.json({ error: 'not_found' }, 404);
  }

  if (page.image_status === 'done') {
    await c.env.PAGE_CACHE.put(cacheKey, JSON.stringify(page));
  }

  return c.json(page);
});

app.post('/api/turn', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    page_number?: number;
    chosen_word?: 'a' | 'b' | 'c';
  } | null;

  if (
    !body ||
    typeof body.page_number !== 'number' ||
    !['a', 'b', 'c'].includes(String(body.chosen_word))
  ) {
    return c.json({ success: false, reason: 'invalid_payload' }, 400);
  }

  const page = await c.env.DB.prepare('SELECT * FROM pages WHERE page_number = ?')
    .bind(body.page_number)
    .first<PageRecord>();

  if (!page) {
    return c.json({ success: false, reason: 'page_not_found' }, 404);
  }

  if (page.chosen_word !== null) {
    return c.json(
      {
        success: false,
        reason: 'already_turned',
        next_page: body.page_number + 1,
      },
      409,
    );
  }

  const chosenKey = body.chosen_word as 'a' | 'b' | 'c';
  const chosenWord = chosenWordFromKey(page, chosenKey);

  const result = await c.env.DB.prepare(
    `UPDATE pages
     SET chosen_word = ?, chosen_at = datetime('now')
     WHERE page_number = ? AND chosen_word IS NULL`,
  )
    .bind(chosenWord, body.page_number)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    return c.json(
      {
        success: false,
        reason: 'already_turned',
        next_page: body.page_number + 1,
      },
      409,
    );
  }

  await c.env.PAGE_CACHE.delete(`page:${body.page_number}`);

  await broadcast(c.env.LIVE_ROOM, {
    type: 'page_turned',
    page_number: body.page_number,
    chosen_word: chosenWord,
    next_page: body.page_number + 1,
  });

  c.executionCtx.waitUntil(generateNextPage(body.page_number + 1, chosenWord, c.env));

  return c.json({ success: true, next_page: body.page_number + 1 });
});

app.get('/api/live', async (c) => {
  const stub = getLiveRoomStub(c.env.LIVE_ROOM);
  return stub.fetch(c.req.raw);
});

app.get('/api/bible', async (c) => {
  const bible = await getBible(c.env.DB);
  return c.json(bible);
});

app.post('/api/admin/generate-image/:pageNumber', async (c) => {
  const pageNumber = parsePageNumber(c.req.param('pageNumber'));
  if (!pageNumber) {
    return c.json({ success: false, reason: 'invalid_page_number' }, 400);
  }

  const result = await generateImageForExistingPage(pageNumber, c.env);
  if (!result.success) {
    return c.json(result, 404);
  }

  return c.json(result);
});

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

app.get('*', async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  const url = new URL(c.req.url);
  if (url.pathname.includes('.')) {
    return assetResponse;
  }

  const fallbackRequest = new Request(new URL('/index.html', c.req.url), c.req.raw);
  return c.env.ASSETS.fetch(fallbackRequest);
});

export { LiveRoom };
export default app;
