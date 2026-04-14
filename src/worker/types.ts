export interface StoryAntagonist {
  name: string;
  species: string;
  introduced_on_page: number;
  obviously_wearing_shell: boolean;
}

export interface KnownCharacter {
  name: string;
  species: string;
  first_appeared: number;
  is_suspicious: boolean;
  catchphrase: string | null;
}

export interface CompletedArc {
  arc_number: number;
  theme: string;
  resolution: string;
}

export interface StoryBible {
  protagonist: 'Turtle';
  missing_item: 'shell';
  shell_description: string;
  image_style_fingerprint: string;
  witnesses_questioned: string[];
  current_location: string;
  current_arc_number: number;
  current_arc_page_count: number;
  arc_theme: string;
  current_antagonist: StoryAntagonist | null;
  known_characters: KnownCharacter[];
  running_denial: string;
  turtles_question: string;
  completed_arcs: CompletedArc[];
}

export interface PageRecord {
  id: number;
  page_number: number;
  text: string;
  scene_description: string;
  image_url: string | null;
  image_status: 'pending' | 'generating' | 'done' | 'failed';
  word_a: string;
  word_b: string;
  word_c: string;
  chosen_word: string | null;
  chosen_at: string | null;
  created_at: string;
}

export interface Env {
  DB: D1Database;
  PAGE_CACHE: KVNamespace;
  LIVE_ROOM: DurableObjectNamespace;
  AI: {
    run: (model: string, input: unknown) => Promise<any>;
  };
  ASSETS: Fetcher;
}
