import type { Env } from './types';

interface FluxResponse {
  image?: string;
}

const SHELLLESS_GUARD = [
  'CRITICAL STORY CONSTRAINT:',
  'Turtle has lost the shell and must be drawn with no shell on Turtle\'s back.',
  'Turtle\'s back is soft, rounded, and exposed.',
  'Do not draw a shell on Turtle.',
  'If a shell appears in the scene, it must be separate or worn by another creature, never on Turtle.',
  'Avoid default realistic turtle anatomy with a domed carapace on Turtle.',
].join(' ');

function enforceShelllessScene(sceneDescription: string): string {
  let scene = sceneDescription.trim();

  if (!/\bturtle\b/i.test(scene)) {
    return scene;
  }

  scene = scene.replace(
    /\bTurtle\b/,
    'Turtle, a small shell-less creature with a soft exposed back,',
  );

  if (!/no shell|without (?:a )?shell|shell-?less|exposed back|no carapace/i.test(scene)) {
    scene += ' Turtle has no shell and no domed carapace on its back.';
  }

  return scene;
}

export async function generatePageImage(
  sceneDescription: string,
  styleFingerprint: string,
  env: Env,
): Promise<string> {
  const enforcedScene = enforceShelllessScene(sceneDescription);
  const prompt = `${styleFingerprint} | ${SHELLLESS_GUARD} | Scene: ${enforcedScene}`;

  const imageResponse = (await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
    prompt,
    num_steps: 4,
  })) as FluxResponse;

  if (!imageResponse?.image || typeof imageResponse.image !== 'string') {
    throw new Error('Workers AI image response missing base64 image payload');
  }

  return `data:image/jpeg;base64,${imageResponse.image}`;
}
