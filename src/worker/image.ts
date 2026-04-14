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
].join(' ');

export async function generatePageImage(
  sceneDescription: string,
  styleFingerprint: string,
  env: Env,
): Promise<string> {
  const prompt = `${styleFingerprint} | ${SHELLLESS_GUARD} | Scene: ${sceneDescription}`;

  const imageResponse = (await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
    prompt,
    num_steps: 4,
  })) as FluxResponse;

  if (!imageResponse?.image || typeof imageResponse.image !== 'string') {
    throw new Error('Workers AI image response missing base64 image payload');
  }

  return `data:image/jpeg;base64,${imageResponse.image}`;
}
