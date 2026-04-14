import type { Env } from './types';

interface FluxResponse {
  image?: string;
}

export async function generatePageImage(
  sceneDescription: string,
  styleFingerprint: string,
  env: Env,
): Promise<string> {
  const prompt = `${styleFingerprint} | Scene: ${sceneDescription}`;

  const imageResponse = (await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
    prompt,
    num_steps: 4,
  })) as FluxResponse;

  if (!imageResponse?.image || typeof imageResponse.image !== 'string') {
    throw new Error('Workers AI image response missing base64 image payload');
  }

  return `data:image/jpeg;base64,${imageResponse.image}`;
}
