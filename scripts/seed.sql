INSERT INTO pages (page_number, text, scene_description, word_a, word_b, word_c, image_status)
VALUES (
  1,
  'Turtle woke up one morning and his shell was gone.\n\nHe looked to the left. He looked to the right.\n\nIt was not there.\n\n"I will go and find it," said Turtle.',
  'Turtle stands alone in a wide empty meadow, looking very small and very round without his shell.',
  'Frog',
  'Mountain',
  'Beetle',
  'pending'
)
ON CONFLICT(page_number) DO UPDATE SET
  text = excluded.text,
  scene_description = excluded.scene_description,
  word_a = excluded.word_a,
  word_b = excluded.word_b,
  word_c = excluded.word_c,
  image_status = excluded.image_status,
  image_url = NULL,
  chosen_word = NULL,
  chosen_at = NULL;

INSERT INTO story_bible (id, content, updated_at)
VALUES (
  1,
  json('{"protagonist":"Turtle","missing_item":"shell","shell_description":"round and green and domed, with a pattern of dark hexagons","image_style_fingerprint":"Children''s picture book illustration, Jon Klassen style. Muted earth palette: warm cream background, forest green, burnt sienna, slate blue, charcoal. Bold outlines 2-3px. Characters are simple rounded shapes, minimal facial features, small dot eyes, no mouths. Backgrounds are flat single-colour washes with one simple silhouetted horizon element. No gradients, no texture, no shadows, no detail. Horizontally centred composition, generous negative space. The turtle is small, round, low to the ground, and has no shell — just a soft exposed body.","witnesses_questioned":[],"current_location":"a wide flat meadow","current_arc_number":1,"current_arc_page_count":0,"arc_theme":"the meadow","current_antagonist":null,"known_characters":[],"running_denial":"No. I have not seen it.","turtles_question":"Have you seen my shell? It is round and green and it is mine.","completed_arcs":[]}'),
  datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
  content = excluded.content,
  updated_at = datetime('now');
