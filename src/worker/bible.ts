import type { StoryBible } from './types';

export const INITIAL_STORY_BIBLE: StoryBible = {
  protagonist: 'Turtle',
  missing_item: 'shell',
  shell_description: 'round and green and domed, with a pattern of dark hexagons',
  image_style_fingerprint:
    "Children's picture book illustration, Jon Klassen style. Muted earth palette: warm cream background, forest green, burnt sienna, slate blue, charcoal. Bold outlines 2-3px. Characters are simple rounded shapes, minimal facial features, small dot eyes, no mouths. Backgrounds are flat single-colour washes with one simple silhouetted horizon element. No gradients, no texture, no shadows, no detail. Horizontally centred composition, generous negative space. The turtle is small, round, low to the ground, and has no shell — just a soft exposed body.",
  witnesses_questioned: [],
  current_location: 'a wide flat meadow',
  current_arc_number: 1,
  current_arc_page_count: 0,
  arc_theme: 'the meadow',
  current_antagonist: null,
  known_characters: [],
  running_denial: 'No. I have not seen it.',
  turtles_question: 'Have you seen my shell? It is round and green and it is mine.',
  completed_arcs: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeBible(candidate: unknown, fallback: StoryBible = INITIAL_STORY_BIBLE): StoryBible {
  const input = isRecord(candidate) ? candidate : {};

  const witnessSource = Array.isArray(input.witnesses_questioned)
    ? input.witnesses_questioned.filter((w): w is string => typeof w === 'string')
    : fallback.witnesses_questioned;

  const witnesses_questioned =
    witnessSource.length > 50 ? witnessSource.slice(-30) : witnessSource;

  const known_characters = Array.isArray(input.known_characters)
    ? input.known_characters
        .filter((char) => isRecord(char))
        .map((char) => ({
          name: typeof char.name === 'string' ? char.name : 'Unknown',
          species: typeof char.species === 'string' ? char.species : 'Unknown',
          first_appeared:
            typeof char.first_appeared === 'number' ? char.first_appeared : fallback.current_arc_number,
          is_suspicious: typeof char.is_suspicious === 'boolean' ? char.is_suspicious : false,
          catchphrase: typeof char.catchphrase === 'string' ? char.catchphrase : null,
        }))
    : fallback.known_characters;

  const completed_arcs = Array.isArray(input.completed_arcs)
    ? input.completed_arcs
        .filter((arc) => isRecord(arc))
        .map((arc) => ({
          arc_number:
            typeof arc.arc_number === 'number' ? arc.arc_number : fallback.current_arc_number,
          theme: typeof arc.theme === 'string' ? arc.theme : fallback.arc_theme,
          resolution:
            typeof arc.resolution === 'string'
              ? arc.resolution
              : 'Turtle was close, then kept walking.',
        }))
    : fallback.completed_arcs;

  const antagonistCandidate = input.current_antagonist;
  const current_antagonist = isRecord(antagonistCandidate)
    ? {
        name:
          typeof antagonistCandidate.name === 'string'
            ? antagonistCandidate.name
            : 'Unknown',
        species:
          typeof antagonistCandidate.species === 'string'
            ? antagonistCandidate.species
            : 'Unknown',
        introduced_on_page:
          typeof antagonistCandidate.introduced_on_page === 'number'
            ? antagonistCandidate.introduced_on_page
            : fallback.current_arc_page_count,
        obviously_wearing_shell:
          typeof antagonistCandidate.obviously_wearing_shell === 'boolean'
            ? antagonistCandidate.obviously_wearing_shell
            : true,
      }
    : null;

  return {
    protagonist: 'Turtle',
    missing_item: 'shell',
    shell_description:
      typeof input.shell_description === 'string'
        ? input.shell_description
        : fallback.shell_description,
    image_style_fingerprint:
      typeof input.image_style_fingerprint === 'string'
        ? input.image_style_fingerprint
        : fallback.image_style_fingerprint,
    witnesses_questioned,
    current_location:
      typeof input.current_location === 'string'
        ? input.current_location
        : fallback.current_location,
    current_arc_number:
      typeof input.current_arc_number === 'number'
        ? input.current_arc_number
        : fallback.current_arc_number,
    current_arc_page_count:
      typeof input.current_arc_page_count === 'number'
        ? input.current_arc_page_count
        : fallback.current_arc_page_count,
    arc_theme: typeof input.arc_theme === 'string' ? input.arc_theme : fallback.arc_theme,
    current_antagonist,
    known_characters,
    running_denial:
      typeof input.running_denial === 'string'
        ? input.running_denial
        : fallback.running_denial,
    turtles_question:
      typeof input.turtles_question === 'string'
        ? input.turtles_question
        : fallback.turtles_question,
    completed_arcs,
  };
}

export async function getBible(db: D1Database): Promise<StoryBible> {
  const existing = await db
    .prepare('SELECT content FROM story_bible WHERE id = 1')
    .first<{ content: string }>();

  if (!existing) {
    const initial = JSON.stringify(INITIAL_STORY_BIBLE);
    await db
      .prepare('INSERT INTO story_bible (id, content, updated_at) VALUES (1, ?, datetime(\'now\'))')
      .bind(initial)
      .run();
    return INITIAL_STORY_BIBLE;
  }

  try {
    return normalizeBible(JSON.parse(existing.content), INITIAL_STORY_BIBLE);
  } catch {
    return INITIAL_STORY_BIBLE;
  }
}

export async function updateBible(db: D1Database, bible: StoryBible): Promise<void> {
  const safeBible = normalizeBible(bible, INITIAL_STORY_BIBLE);
  await db
    .prepare(
      `INSERT INTO story_bible (id, content, updated_at)
       VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`,
    )
    .bind(JSON.stringify(safeBible))
    .run();
}
