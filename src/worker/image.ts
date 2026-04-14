import type { Env } from './types';

interface FluxResponse {
  image?: string;
}

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 1024;

const BACKGROUND_ONLY_GUARD = [
  'CRITICAL STORY CONSTRAINT:',
  'Do not draw Turtle anywhere in the image.',
  'Render the environment and other scene elements only.',
  'If another creature has a shell, it must not be on Turtle.',
].join(' ');

function toBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';

  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function createShelllessTurtleSvgLayer(width: number, height: number): string {
  const cx = Math.round(width * 0.52);
  const cy = Math.round(height * 0.78);
  const bodyWidth = Math.round(width * 0.20);
  const bodyHeight = Math.round(height * 0.09);

  return `
  <g aria-label="Shell-less Turtle" transform="translate(${cx}, ${cy})">
    <ellipse cx="0" cy="${Math.round(bodyHeight * 0.58)}" rx="${Math.round(bodyWidth * 0.52)}" ry="${Math.round(bodyHeight * 0.24)}" fill="#33422e" fill-opacity="0.28" />
    <ellipse cx="0" cy="0" rx="${Math.round(bodyWidth * 0.48)}" ry="${Math.round(bodyHeight * 0.44)}" fill="#647f56" stroke="#273122" stroke-width="4" />
    <path d="M ${Math.round(-bodyWidth * 0.45)} 0 C ${Math.round(-bodyWidth * 0.20)} ${Math.round(-bodyHeight * 0.55)}, ${Math.round(bodyWidth * 0.24)} ${Math.round(-bodyHeight * 0.50)}, ${Math.round(bodyWidth * 0.50)} 0" fill="none" stroke="#8ba67b" stroke-width="4" stroke-linecap="round" />
    <ellipse cx="${Math.round(-bodyWidth * 0.65)}" cy="${Math.round(-bodyHeight * 0.05)}" rx="${Math.round(bodyWidth * 0.16)}" ry="${Math.round(bodyHeight * 0.17)}" fill="#5d7750" stroke="#273122" stroke-width="4" />
    <ellipse cx="${Math.round(-bodyWidth * 0.74)}" cy="${Math.round(-bodyHeight * 0.09)}" rx="${Math.round(bodyWidth * 0.03)}" ry="${Math.round(bodyWidth * 0.03)}" fill="#1e241a" />
    <path d="M ${Math.round(bodyWidth * 0.44)} ${Math.round(bodyHeight * 0.10)} Q ${Math.round(bodyWidth * 0.64)} ${Math.round(bodyHeight * 0.26)} ${Math.round(bodyWidth * 0.56)} ${Math.round(bodyHeight * 0.42)}" fill="#5d7750" stroke="#273122" stroke-width="4" stroke-linecap="round" />
    <ellipse cx="${Math.round(-bodyWidth * 0.23)}" cy="${Math.round(bodyHeight * 0.42)}" rx="${Math.round(bodyWidth * 0.11)}" ry="${Math.round(bodyHeight * 0.19)}" fill="#44563b" />
    <ellipse cx="${Math.round(bodyWidth * 0.20)}" cy="${Math.round(bodyHeight * 0.42)}" rx="${Math.round(bodyWidth * 0.11)}" ry="${Math.round(bodyHeight * 0.19)}" fill="#44563b" />
  </g>`;
}

function composeTurtleOverBackground(
  backgroundBase64Image: string,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT,
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="data:image/jpeg;base64,${backgroundBase64Image}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
  ${createShelllessTurtleSvgLayer(width, height)}
</svg>`;

  return `data:image/svg+xml;base64,${toBase64Utf8(svg)}`;
}

export async function generatePageImage(
  sceneDescription: string,
  styleFingerprint: string,
  env: Env,
): Promise<string> {
  const prompt = `${styleFingerprint} | ${BACKGROUND_ONLY_GUARD} | Scene (background and other non-Turtle details only): ${sceneDescription}`;

  const imageResponse = (await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
    prompt,
    num_steps: 4,
  })) as FluxResponse;

  if (!imageResponse?.image || typeof imageResponse.image !== 'string') {
    throw new Error('Workers AI image response missing base64 image payload');
  }

  return composeTurtleOverBackground(imageResponse.image, CANVAS_WIDTH, CANVAS_HEIGHT);
}
