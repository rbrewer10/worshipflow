// src/main/pollinationsApi.ts
// Free, no-key background image generation via Pollinations.ai.
// Builds an image URL from the prompt and downloads the result — no API key,
// no polling. Pollinations renders on-demand, so the GET can take a while.
import { createHash } from 'crypto'
import { downloadToGenerated } from './backgroundLib'

export async function generatePollinationsImage(prompt: string): Promise<string> {
  const enhanced = `${prompt}, wide cinematic 16:9, photorealistic, church worship background`
  const seed = Math.floor(Math.random() * 1_000_000)
  const url =
    'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(enhanced) +
    `?width=1920&height=1080&nologo=true&model=flux&seed=${seed}`
  const hash = createHash('md5').update(prompt + Date.now()).digest('hex').slice(0, 8)
  return downloadToGenerated(url, `gen_${hash}.jpg`)
}
