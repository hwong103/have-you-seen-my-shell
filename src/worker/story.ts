import { getBible, INITIAL_STORY_BIBLE, normalizeBible, updateBible } from './bible';
import { generatePageImage } from './image';
import { broadcast } from './live';
import type { Env, StoryBible } from './types';

interface RecentPage {
  page_number: number;
  text: string;
}

interface GeneratedPage {
  page_text: string;
  scene_description: string;
  word_a: string;
  word_b: string;
  word_c: string;
  updated_bible: StoryBible;
}

function getArcInstruction(bible: StoryBible): string {
  if (bible.current_arc_page_count >= 11) {
    return 'Begin a new arc. Turtle finds themselves somewhere entirely new. A new location, a new cast of creatures. The chosen word should drive this transition.';
  }

  if (bible.current_arc_page_count >= 9) {
    return 'You are approaching the end of this arc. Something should almost happen — Turtle gets very close to finding the shell — but it does not. End on a note of mild, patient hope.';
  }

  return '';
}

function sanitizeWord(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .split(/\s+/)
    .filter(Boolean)[0];

  if (!cleaned) return fallback;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function enforcePageWordCount(text: string, maxWords = 60): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ').trim();
}

async function getRecentPages(db: D1Database, limit: number): Promise<RecentPage[]> {
  const rows = await db
    .prepare('SELECT page_number, text FROM pages ORDER BY page_number DESC LIMIT ?')
    .bind(limit)
    .all<RecentPage>();

  return (rows.results ?? []).reverse();
}

function parseTextResponse(rawResponse: unknown): GeneratedPage {
  let payload: unknown = rawResponse;

  if (typeof rawResponse === 'string') {
    payload = JSON.parse(rawResponse);
  }

  if (
    typeof rawResponse === 'object' &&
    rawResponse !== null &&
    'response' in rawResponse &&
    typeof (rawResponse as { response?: unknown }).response === 'string'
  ) {
    payload = JSON.parse((rawResponse as { response: string }).response);
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Text generation returned a non-object payload');
  }

  const record = payload as Record<string, unknown>;

  if (
    typeof record.page_text !== 'string' ||
    typeof record.scene_description !== 'string' ||
    typeof record.word_a !== 'string' ||
    typeof record.word_b !== 'string' ||
    typeof record.word_c !== 'string'
  ) {
    throw new Error('Text generation response is missing required fields');
  }

  return {
    page_text: enforcePageWordCount(record.page_text, 60),
    scene_description: record.scene_description.trim(),
    word_a: sanitizeWord(record.word_a, 'Pond'),
    word_b: sanitizeWord(record.word_b, 'Heron'),
    word_c: sanitizeWord(record.word_c, 'Lantern'),
    updated_bible: normalizeBible(record.updated_bible, INITIAL_STORY_BIBLE),
  };
}

function buildSystemPrompt(bible: StoryBible, chosenWord: string, arcInstruction: string): string {
  return `
You are writing pages for an infinite children's picture book called
"Have You Seen My Shell?" in the style of Jon Klassen's "I Want My Hat Back".

THE RULES — follow these exactly:
- Short sentences. Never more than two sentences per paragraph.
- Maximum 60 words per page.
- Deadpan tone. Patient. Never emotional or dramatic.
- Turtle always asks the same question: "${bible.turtles_question}"
- Most characters respond with a variation of: "${bible.running_denial}"
- Never explain the joke. Never describe Turtle's feelings.
- The reader can see more than Turtle can. Turtle cannot.
- Repetition is intentional and correct.
- Never resolve the search. Turtle always ends on mild, patient hope or mild, patient disappointment.

WHAT A GOOD PAGE LOOKS LIKE:
Turtle came to the river.
There was an Otter there.
"Have you seen my shell? It is round and green and it is mine," said Turtle.
"No," said Otter. "I have not seen it."
Otter was wearing the shell as a hat.
Turtle said okay and kept walking.

THE CHOSEN WORD FOR THIS PAGE: "${chosenWord}"
The chosen word must appear naturally — as a character's name, species, location, or object.
Do not force it. Let it shape the scene.

${arcInstruction}
`.trim();
}

function buildUserPrompt(
  bible: StoryBible,
  recentPages: RecentPage[],
  pageNumber: number,
): string {
  return `
STORY BIBLE:
${JSON.stringify(bible, null, 2)}

LAST ${recentPages.length} PAGES:
${recentPages.map((p) => `Page ${p.page_number}: ${p.text}`).join('\n\n')}

Write page ${pageNumber}.

Return ONLY valid JSON — no markdown, no backticks, no preamble:
{
  "page_text": "...",
  "scene_description": "...",
  "word_a": "...",
  "word_b": "...",
  "word_c": "...",
  "updated_bible": { ... }
}

page_text: The full page text. Max 60 words.
scene_description: One sentence describing what is visible in the illustration.
Focus on character positions and expressions only. No colour directions.
Example: "Turtle stands in shallow water looking up at an Otter who is wearing a round shell as a hat and looking away."
If Turtle appears in the scene, explicitly state that Turtle has no shell.
word_a/b/c: Three single words, each a concrete noun or creature name.
These will be offered to the next reader to steer the story.
Make them varied — one safe, one surprising, one wild.
updated_bible: The full story bible JSON with your updates applied.
Increment arc_page_count. Add any new characters to known_characters.
Update current_location. If starting a new arc, increment arc_number,
reset arc_page_count to 0, add completed arc to completed_arcs.
`.trim();
}

async function generateTextPage(
  pageNumber: number,
  chosenWord: string,
  bible: StoryBible,
  recentPages: RecentPage[],
  env: Env,
): Promise<GeneratedPage> {
  const arcInstruction = getArcInstruction(bible);
  const systemPrompt = buildSystemPrompt(bible, chosenWord, arcInstruction);
  const userPrompt = buildUserPrompt(bible, recentPages, pageNumber);

  const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct', {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1024,
    temperature: 0.8,
  });

  return parseTextResponse(aiResponse);
}

async function pageExists(db: D1Database, pageNumber: number): Promise<boolean> {
  const existing = await db
    .prepare('SELECT id FROM pages WHERE page_number = ?')
    .bind(pageNumber)
    .first<{ id: number }>();
  return Boolean(existing?.id);
}

async function saveGeneratedPage(pageNumber: number, result: GeneratedPage, env: Env): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO pages
      (page_number, text, scene_description, word_a, word_b, word_c, image_status)
     VALUES (?, ?, ?, ?, ?, ?, 'generating')`,
  )
    .bind(
      pageNumber,
      result.page_text,
      result.scene_description,
      result.word_a,
      result.word_b,
      result.word_c,
    )
    .run();

  await updateBible(env.DB, result.updated_bible);
}

async function finishPageImage(
  pageNumber: number,
  sceneDescription: string,
  styleFingerprint: string,
  env: Env,
): Promise<void> {
  try {
    const imageUrl = await generatePageImage(sceneDescription, styleFingerprint, env);
    await env.DB.prepare("UPDATE pages SET image_url = ?, image_status = 'done' WHERE page_number = ?")
      .bind(imageUrl, pageNumber)
      .run();
  } catch (error) {
    console.error('Image generation failed', { pageNumber, error });
    await env.DB.prepare("UPDATE pages SET image_status = 'failed' WHERE page_number = ?")
      .bind(pageNumber)
      .run();
  }

  await env.PAGE_CACHE.delete(`page:${pageNumber}`);
  await broadcast(env.LIVE_ROOM, {
    type: 'page_image_ready',
    page_number: pageNumber,
  });
}

export async function generateImageForExistingPage(
  pageNumber: number,
  env: Env,
): Promise<{ success: boolean; reason?: string }> {
  if (pageNumber === 1) {
    await env.DB.prepare(
      "UPDATE pages SET image_url = '/images/turtle-page-1.png', image_status = 'done' WHERE page_number = 1",
    ).run();
    await env.PAGE_CACHE.delete('page:1');
    await broadcast(env.LIVE_ROOM, {
      type: 'page_image_ready',
      page_number: 1,
    });
    return { success: true };
  }

  const page = await env.DB
    .prepare('SELECT scene_description FROM pages WHERE page_number = ?')
    .bind(pageNumber)
    .first<{ scene_description: string }>();

  if (!page) {
    return { success: false, reason: 'page_not_found' };
  }

  const bible = await getBible(env.DB);
  await env.DB.prepare("UPDATE pages SET image_status = 'generating' WHERE page_number = ?")
    .bind(pageNumber)
    .run();

  await finishPageImage(pageNumber, page.scene_description, bible.image_style_fingerprint, env);
  return { success: true };
}

export async function generateNextPage(
  pageNumber: number,
  chosenWord: string,
  env: Env,
): Promise<void> {
  if (await pageExists(env.DB, pageNumber)) {
    return;
  }

  const bible = await getBible(env.DB);
  const recentPages = await getRecentPages(env.DB, 4);

  let generated: GeneratedPage;
  try {
    generated = await generateTextPage(pageNumber, chosenWord, bible, recentPages, env);
  } catch (error) {
    console.error('Text generation failed', { pageNumber, chosenWord, error });
    return;
  }

  await saveGeneratedPage(pageNumber, generated, env);

  await broadcast(env.LIVE_ROOM, {
    type: 'page_ready',
    page_number: pageNumber,
    image_status: 'generating',
  });

  await finishPageImage(
    pageNumber,
    generated.scene_description,
    bible.image_style_fingerprint,
    env,
  );
}
