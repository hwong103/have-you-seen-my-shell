# Have You Seen My Shell? — Codex Instruction Document

## Project Overview

An infinite, collaborative children's book running on the Cloudflare stack. A turtle has lost its shell and politely asks every creature it meets if they have seen it. The story never ends. Each page is generated on the fly by Workers AI. When a reader reaches the last generated page, they turn the page by selecting one word from three options — that word becomes the central theme of the next page. The first reader to reach the end gets to choose.

The tone, illustration style, and narrative voice are modelled on Jon Klassen's *I Want My Hat Back*: deadpan, patient, short sentences, repetition as comedy, the gap between what the reader sees and what the protagonist acknowledges.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite, deployed on Cloudflare Pages |
| Backend | Cloudflare Workers (Hono) |
| Database | Cloudflare D1 |
| Cache | Cloudflare Workers KV |
| Live updates | Cloudflare Durable Objects |
| AI — text | Workers AI: `@cf/meta/llama-3.3-70b-instruct` |
| AI — image | Workers AI: `@cf/black-forest-labs/flux-1-schnell` |

---

## Repository Structure

```
have-you-seen-my-shell/
├── src/
│   ├── worker/
│   │   ├── index.ts          # Hono app, route definitions
│   │   ├── story.ts          # Page generation logic
│   │   ├── bible.ts          # Story bible update logic
│   │   ├── image.ts          # Image generation logic
│   │   └── live.ts           # Durable Object for WebSocket broadcast
│   └── frontend/
│       ├── main.tsx
│       ├── App.tsx
│       ├── pages/
│       │   ├── Book.tsx       # Main book view
│       │   └── Page.tsx       # Single page component
│       └── components/
│           ├── WordPicker.tsx  # Three-word selection UI
│           ├── PageTurner.tsx  # Page navigation
│           └── LiveIndicator.tsx # Shows other readers present
├── migrations/
│   └── 0001_initial.sql
├── wrangler.toml
└── docs/
    └── have-you-seen-my-shell.md  # This file
```

---

## D1 Schema

```sql
-- migrations/0001_initial.sql

CREATE TABLE story_bible (
  id INTEGER PRIMARY KEY DEFAULT 1,
  content TEXT NOT NULL,  -- JSON blob, see Story Bible spec below
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_number INTEGER NOT NULL UNIQUE,
  text TEXT NOT NULL,               -- The page text shown to reader
  scene_description TEXT NOT NULL,  -- Scene fed to image gen
  image_url TEXT,                   -- R2 or base64 data URL once generated
  image_status TEXT NOT NULL DEFAULT 'pending', -- pending | generating | done | failed
  word_a TEXT NOT NULL,
  word_b TEXT NOT NULL,
  word_c TEXT NOT NULL,
  chosen_word TEXT,                 -- NULL until a reader turns the page
  chosen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed page 1 (see Seed Data section)
INSERT INTO story_bible (content) VALUES ('{}'); -- replaced by seed script
```

---

## Story Bible Spec

The story bible is a JSON object stored in the `story_bible` table. It is passed in full with every page generation call. It is the coherence anchor — what the LLM knows about the story so far regardless of how many pages have been generated.

```typescript
interface StoryBible {
  // Core identity — never changes
  protagonist: "Turtle";
  missing_item: "shell";
  shell_description: "round and green and domed, with a pattern of dark hexagons";

  // Style fingerprint — locked on page 1, never changes
  image_style_fingerprint: string;

  // Story state — updated each page
  witnesses_questioned: string[];       // All creatures met so far, in order
  current_location: string;            // Where Turtle currently is
  current_arc_number: number;          // Which arc we're in (increments every 8-12 pages)
  current_arc_page_count: number;      // Pages since arc started
  arc_theme: string;                   // Loose theme of current arc (e.g. "underwater", "the mountain")

  // The antagonist — whoever is obviously wearing the shell
  // Null until introduced. Once introduced, persists until arc resolves.
  current_antagonist: {
    name: string;
    species: string;
    introduced_on_page: number;
    obviously_wearing_shell: boolean;
  } | null;

  // Recurring characters available to reappear
  known_characters: Array<{
    name: string;
    species: string;
    first_appeared: number;
    is_suspicious: boolean;
    catchphrase: string | null;  // Their denial line, if memorable
  }>;

  // Narrative tone guards
  running_denial: string;  // The standard denial line most characters use
  turtles_question: string; // The exact question Turtle always asks

  // Arc history (brief, for avoiding repetition)
  completed_arcs: Array<{
    arc_number: number;
    theme: string;
    resolution: string; // One sentence — what almost happened
  }>;
}
```

### Initial story bible (seed)

```json
{
  "protagonist": "Turtle",
  "missing_item": "shell",
  "shell_description": "round and green and domed, with a pattern of dark hexagons",
  "image_style_fingerprint": "Children's picture book illustration, Jon Klassen style. Muted earth palette: warm cream background, forest green, burnt sienna, slate blue, charcoal. Bold outlines 2-3px. Characters are simple rounded shapes, minimal facial features, small dot eyes, no mouths. Backgrounds are flat single-colour washes with one simple silhouetted horizon element. No gradients, no texture, no shadows, no detail. Horizontally centred composition, generous negative space. The turtle is small, round, low to the ground, and has no shell — just a soft exposed body.",
  "witnesses_questioned": [],
  "current_location": "a wide flat meadow",
  "current_arc_number": 1,
  "current_arc_page_count": 0,
  "arc_theme": "the meadow",
  "current_antagonist": null,
  "known_characters": [],
  "running_denial": "No. I have not seen it.",
  "turtles_question": "Have you seen my shell? It is round and green and it is mine.",
  "completed_arcs": []
}
```

---

## Worker Routes

All routes live in `src/worker/index.ts` using Hono.

```
GET  /api/pages/:pageNumber     — Fetch a single page (from KV cache or D1)
GET  /api/pages/latest          — Fetch the highest generated page number
POST /api/turn                  — Turn the page (submit chosen word, trigger generation)
GET  /api/live                  — WebSocket upgrade (Durable Object)
GET  /api/bible                 — Fetch current story bible (for debugging)
```

### `GET /api/pages/:pageNumber`

1. Check KV for key `page:{pageNumber}`. If hit, return cached JSON.
2. If miss, query D1: `SELECT * FROM pages WHERE page_number = ?`
3. If image_status is `done`, cache in KV with TTL 0 (permanent — pages never change).
4. Return page object.

### `GET /api/pages/latest`

Returns `{ page_number: number, has_pending_word: boolean }`.

`has_pending_word` is true when `chosen_word IS NULL` — meaning this page is waiting for a reader to turn it.

### `POST /api/turn`

Body: `{ page_number: number, chosen_word: "a" | "b" | "c" }`

1. Validate: the page exists, `chosen_word` is null (not already turned), and `chosen_word` value matches one of word_a/b/c.
2. Write `chosen_word` and `chosen_at` to D1.
3. Kick off page generation for `page_number + 1` — do not await, return immediately.
4. Broadcast via Durable Object: `{ type: "page_turned", page_number, chosen_word, next_page: page_number + 1 }`
5. Return `{ success: true, next_page: page_number + 1 }`

Generation runs in the background (use `ctx.waitUntil(generateNextPage(...))`).

### `GET /api/live`

Upgrades to WebSocket via the Durable Object (`LiveRoom`). All connected clients receive broadcast messages when a page is turned or a new page finishes generating.

---

## Page Generation Logic (`src/worker/story.ts`)

This is the core of the project. Called from `POST /api/turn` via `ctx.waitUntil`.

```typescript
async function generateNextPage(
  pageNumber: number,
  chosenWord: string,
  env: Env
): Promise<void>
```

### Step 1 — Gather context

```typescript
const bible = await getBible(env.DB);         // Full story bible JSON
const recentPages = await getRecentPages(env.DB, 4); // Last 4 pages text only
```

### Step 2 — Determine arc instruction

```typescript
const arcInstruction = getArcInstruction(bible);
// Returns one of:
// - "" (normal, mid-arc)
// - "You are approaching the end of this arc. Something should almost happen — 
//    Turtle gets very close to finding the shell — but it doesn't. 
//    End on a note of mild, patient hope."  (arc_page_count >= 9)
// - "Begin a new arc. Turtle finds themselves somewhere entirely new. 
//    A new location, a new cast of creatures. 
//    The chosen word should drive this transition." (arc_page_count >= 11)
```

### Step 3 — Text generation prompt

```typescript
const systemPrompt = `
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

const userPrompt = `
STORY BIBLE:
${JSON.stringify(bible, null, 2)}

LAST ${recentPages.length} PAGES:
${recentPages.map(p => `Page ${p.page_number}: ${p.text}`).join('\n\n')}

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
word_a/b/c: Three single words, each a concrete noun or creature name. 
  These will be offered to the next reader to steer the story.
  Make them varied — one safe, one surprising, one wild.
updated_bible: The full story bible JSON with your updates applied.
  Increment arc_page_count. Add any new characters to known_characters.
  Update current_location. If starting a new arc, increment arc_number, 
  reset arc_page_count to 0, add completed arc to completed_arcs.
`.trim();
```

### Step 4 — Call Workers AI (text)

```typescript
const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct', {
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ],
  response_format: { type: 'json_object' },
  max_tokens: 1024,
  temperature: 0.8,
});

const result = JSON.parse(response.response);
// { page_text, scene_description, word_a, word_b, word_c, updated_bible }
```

### Step 5 — Write page to D1 (immediately, before image)

```typescript
await env.DB.prepare(`
  INSERT INTO pages 
    (page_number, text, scene_description, word_a, word_b, word_c, image_status)
  VALUES (?, ?, ?, ?, ?, ?, 'generating')
`).bind(
  pageNumber,
  result.page_text,
  result.scene_description,
  result.word_a,
  result.word_b,
  result.word_c
).run();
```

Write the updated bible immediately too:

```typescript
await updateBible(env.DB, result.updated_bible);
```

Broadcast that the page text is ready (readers can start reading before the image arrives):

```typescript
await broadcast(env.LIVE_ROOM, {
  type: 'page_ready',
  page_number: pageNumber,
  image_status: 'generating'
});
```

### Step 6 — Image generation

```typescript
const imagePrompt = `${bible.image_style_fingerprint} | Scene: ${result.scene_description}`;

const imageResponse = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
  prompt: imagePrompt,
  num_steps: 4,
});

// imageResponse.image is a base64 string
// Store as data URL or upload to R2
const imageUrl = `data:image/jpeg;base64,${imageResponse.image}`;
```

### Step 7 — Update page with image, broadcast completion

```typescript
await env.DB.prepare(`
  UPDATE pages SET image_url = ?, image_status = 'done' WHERE page_number = ?
`).bind(imageUrl, pageNumber).run();

// Invalidate KV cache (shouldn't exist yet, but be safe)
await env.PAGE_CACHE.delete(`page:${pageNumber}`);

await broadcast(env.LIVE_ROOM, {
  type: 'page_image_ready',
  page_number: pageNumber,
});
```

---

## Image Generation (`src/worker/image.ts`)

The style fingerprint is the most important thing. It must be:

1. Generated once — on the creation of page 1 — and stored in the bible. Never regenerated.
2. Prepended verbatim to every image prompt with ` | Scene: ` as the separator.
3. Never modified, even if it could be improved.

The scene description from the LLM should describe only:
- Who is present and where they are positioned
- What the visual joke is (if any) — e.g. "The Otter is wearing the shell on its head"
- The setting in one word or phrase

Do not include colour direction, lighting, or style notes in the scene description — those live in the fingerprint.

**Image error handling:** If image generation fails, set `image_status = 'failed'` and broadcast. The frontend should show a simple illustrated placeholder (a flat-colour panel with the page text only) and not block reading.

---

## Durable Object — LiveRoom (`src/worker/live.ts`)

Manages WebSocket connections. One instance for the whole app (single story, single room).

```typescript
export class LiveRoom implements DurableObject {
  private sessions: Set<WebSocket> = new Set();

  async fetch(request: Request): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    this.sessions.add(server);

    server.addEventListener('close', () => {
      this.sessions.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async broadcast(message: object): Promise<void> {
    const payload = JSON.stringify(message);
    for (const ws of this.sessions) {
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }
}
```

Message types the frontend should handle:

```typescript
type LiveMessage =
  | { type: 'page_turned'; page_number: number; chosen_word: string; next_page: number }
  | { type: 'page_ready'; page_number: number; image_status: 'generating' }
  | { type: 'page_image_ready'; page_number: number }
```

---

## Frontend — Book.tsx

The reading experience should feel like a book, not an app.

### States a page can be in

```typescript
type PageState =
  | 'loading'           // Fetching from API
  | 'reading'           // Showing text + image (or placeholder), no word picker
  | 'awaiting_word'     // This is the last page, word picker visible, image done
  | 'generating'        // Reader submitted word, next page generating
  | 'image_pending'     // Page text arrived, image still generating
```

### Page turn UX

When a reader reaches the last page:
1. Show the page normally.
2. Once `image_status === 'done'`, reveal the three word buttons with a simple fade.
3. On word selection: immediately show a loading state ("The story is thinking..."), disable the buttons.
4. Listen on WebSocket for `page_ready` for the next page number, then navigate to it.
5. If another reader beats them to it (`page_turned` arrives before they select), show a brief message ("Someone else just turned the page — catch up!") and navigate to the new page as a reader.

### Navigation

Simple previous/next arrows. No page list, no chapter select. The book has one direction.

URL structure: `/{pageNumber}` — enables direct linking to any page and browser back/forward.

---

## wrangler.toml

```toml
name = "have-you-seen-my-shell"
main = "src/worker/index.ts"
compatibility_date = "2024-11-01"

[[d1_databases]]
binding = "DB"
database_name = "have-you-seen-my-shell"
database_id = "YOUR_DATABASE_ID"

[[kv_namespaces]]
binding = "PAGE_CACHE"
id = "YOUR_KV_ID"

[[durable_objects.bindings]]
name = "LIVE_ROOM"
class_name = "LiveRoom"

[[migrations]]
tag = "v1"
new_classes = ["LiveRoom"]

[ai]
binding = "AI"

[assets]
directory = "./dist"
```

---

## Seed Script

Run once after migrations to create page 1.

```typescript
// scripts/seed.ts
// Usage: npx wrangler d1 execute have-you-seen-my-shell --file=seed.sql

// Page 1 is hand-authored — do not generate it.
// This ensures the tone is locked from the start.

const PAGE_1_TEXT = `
Turtle woke up one morning and his shell was gone.

He looked to the left. He looked to the right.

It was not there.

"I will go and find it," said Turtle.
`.trim();

const PAGE_1_SCENE = "Turtle stands alone in a wide empty meadow, looking very small and very round without his shell.";

const INITIAL_BIBLE = { 
  // ... paste the seed bible JSON from above
};

// SQL to run:
// INSERT INTO pages (page_number, text, scene_description, word_a, word_b, word_c, image_status)
// VALUES (1, '...', '...', 'Frog', 'Mountain', 'Beetle', 'pending');
// 
// INSERT INTO story_bible (content) VALUES ('...');
// 
// Then trigger image generation for page 1 manually via:
// POST /api/admin/generate-image/1
```

Page 1 words (`word_a/b/c`) should be: `Frog`, `Mountain`, `Beetle` — classic, grounded, sets the tone for what words can be.

---

## Error Handling & Edge Cases

**Generation fails mid-way.** If the LLM call fails, do not write anything to D1. The `POST /turn` response has already returned. On next poll/websocket, the frontend will not see a new page and should show a retry option that re-submits the chosen word.

**Image generation fails.** Write the page with `image_status = 'failed'`. Show text-only layout. Do not block reading. Log the failure.

**Concurrent page turns.** Two readers both submit `POST /turn` for the same page. Use a D1 transaction with a check: `UPDATE pages SET chosen_word = ? WHERE page_number = ? AND chosen_word IS NULL`. If 0 rows affected, the second reader lost the race — return `{ success: false, reason: 'already_turned' }`. Frontend should navigate them to the next page as a passive reader.

**Very long story (500+ pages).** The bible's `witnesses_questioned` array will grow large. After 50 entries, start truncating to last 30 — the LLM does not need a complete guest list, just enough to avoid immediately repeating.

---

## Phase 2 — Agentic Payments

When ready to experiment with payments, the `POST /api/turn` route gets a payment gate added. The flow:

1. Worker receives `POST /turn` with no payment proof → returns `402 Payment Required` with header `X-Payment-Request: amount=0.001;currency=USD;address=YOUR_ADDRESS;protocol=x402`
2. Reader's client (or agent) pays and retries with `X-Payment-Proof: {proof}`
3. Worker verifies proof via payment provider SDK
4. If valid, proceeds with page turn as normal

The word selection UI gets a "Turn the page — $0.001" button instead of a plain submit. Keep the payment amount micro — this is an experiment in the mechanic, not a revenue model.

Free reads remain free. You only pay to turn the page (i.e. to have creative influence over the story direction).

---

## Prompt Iteration Notes

The system prompt and user prompt in `story.ts` will need tuning after seeing the first few generated pages. Things to watch for:

- **LLM adding emotion or interiority** — Turtle should never feel things out loud. Add examples of what *not* to do if this happens.
- **Scene descriptions being too detailed** — the LLM will want to describe lighting and colour. Keep reminding it: position and visual joke only.
- **Words being too abstract** — if the LLM generates words like "melancholy" or "journey", tighten the word generation prompt to require concrete nouns only.
- **Arc transitions being abrupt** — if the new arc doesn't flow naturally from the chosen word, adjust the arc instruction to give the LLM more latitude on *how* the word connects to the new setting.

Keep a `prompts/` directory with versioned prompt snapshots and notes on what changed and why.
