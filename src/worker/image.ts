import type { Env } from './types';
import { TURTLE_SPRITE_BASE64 } from './turtleSprite';

interface FluxResponse {
  image?: string;
}

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 1024;
const TURTLE_SPRITE_WIDTH = 760;
const TURTLE_SPRITE_HEIGHT = 420;

function toBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getTurtlePlacement(sceneDescription: string, width: number, height: number) {
  const hash = hashString(sceneDescription);

  const turtleWidth = Math.round(width * (0.24 + ((hash % 7) * 0.01)));
  const turtleHeight = Math.round((turtleWidth * TURTLE_SPRITE_HEIGHT) / TURTLE_SPRITE_WIDTH);

  const centerX = Math.round(
    width * (0.44 + (((hash >>> 3) % 14) - 7) * 0.01),
  );
  const topY = Math.round(
    height * (0.70 + ((hash >>> 8) % 8) * 0.006),
  );

  const x = Math.max(24, Math.min(width - turtleWidth - 24, centerX - Math.round(turtleWidth / 2)));
  const y = Math.max(24, Math.min(height - turtleHeight - 24, topY));

  return { x, y, turtleWidth, turtleHeight };
}

function composeSceneWithReferenceTurtle(
  backgroundBase64Image: string,
  sceneDescription: string,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT,
): string {
  const { x, y, turtleWidth, turtleHeight } = getTurtlePlacement(sceneDescription, width, height);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="data:image/jpeg;base64,${backgroundBase64Image}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
  <image href="data:image/png;base64,${TURTLE_SPRITE_BASE64}" x="${x}" y="${y}" width="${turtleWidth}" height="${turtleHeight}" preserveAspectRatio="xMidYMid meet" />
</svg>`;

  return `data:image/svg+xml;base64,${toBase64Utf8(svg)}`;
}

export async function generatePageImage(
  sceneDescription: string,
  styleFingerprint: string,
  env: Env,
): Promise<string> {
  const prompt = `${styleFingerprint} | Scene: ${sceneDescription} Make sure the turtle doesn't have a shell. Do not draw Turtle in this background image; Turtle will be composited from a reference character.`;

  const imageResponse = (await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
    prompt,
    num_steps: 4,
  })) as FluxResponse;

  if (!imageResponse?.image || typeof imageResponse.image !== 'string') {
    throw new Error('Workers AI image response missing base64 image payload');
  }

  return composeSceneWithReferenceTurtle(
    imageResponse.image,
    sceneDescription,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
  );
}
