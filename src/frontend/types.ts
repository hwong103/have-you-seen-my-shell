export type ImageStatus = 'pending' | 'generating' | 'done' | 'failed';

export interface PageApiRecord {
  id: number;
  page_number: number;
  text: string;
  scene_description: string;
  image_url: string | null;
  image_status: ImageStatus;
  word_a: string;
  word_b: string;
  word_c: string;
  chosen_word: string | null;
  chosen_at: string | null;
  created_at: string;
}

export type PageState =
  | 'loading'
  | 'reading'
  | 'awaiting_word'
  | 'generating'
  | 'image_pending';

export type LiveMessage =
  | {
      type: 'page_turned';
      page_number: number;
      chosen_word: string;
      next_page: number;
    }
  | {
      type: 'page_ready';
      page_number: number;
      image_status: 'generating';
    }
  | {
      type: 'page_image_ready';
      page_number: number;
    };
