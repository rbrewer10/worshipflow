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

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    // Attempt to fetch and validate the image exists before downloading
    const headRes = await fetch(url, { method: 'HEAD', signal: controller.signal })
    clearTimeout(timeout)

    if (!headRes.ok) throw new Error(`HTTP ${headRes.status}`)
  } catch (err) {
    console.error('[pollinations] image generation timed out or failed, returning placeholder:', err)
    // Fall back to a gray placeholder image URL or throw gracefully
    throw new Error(`Pollinations image generation failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Add timeout to the actual download (15s, longer than HEAD check since download is slower)
  const downloadController = new AbortController()
  const downloadTimeout = setTimeout(() => downloadController.abort(), 15000)

  try {
    return await downloadToGenerated(url, `gen_${hash}.jpg`, downloadController.signal)
  } catch (err) {
    console.error('[pollinations] image download timed out or failed:', err)
    throw new Error(`Pollinations image download failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(downloadTimeout)
  }
}
