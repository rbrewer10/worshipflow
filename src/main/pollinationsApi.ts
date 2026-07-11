// src/main/pollinationsApi.ts
// Free, no-key background image generation via Pollinations.ai.
// Builds an image URL from the prompt and downloads the result — no API key,
// no polling. Pollinations renders on-demand, so the GET can take a while.
import { createHash } from 'crypto'
import { downloadToGenerated } from './backgroundLib'

async function waitForRetry(attempt: number): Promise<void> {
  const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000)
  await new Promise(resolve => setTimeout(resolve, delayMs))
}

export async function generatePollinationsImage(prompt: string): Promise<string> {
  const enhanced = `${prompt}, wide cinematic 16:9, photorealistic, church worship background`
  const hash = createHash('md5').update(prompt + Date.now()).digest('hex').slice(0, 8)
  const maxRetries = 3

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const seed = Math.floor(Math.random() * 1_000_000)
    const url =
      'https://image.pollinations.ai/prompt/' +
      encodeURIComponent(enhanced) +
      `?width=1920&height=1080&nologo=true&model=flux&seed=${seed}`

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      // Attempt to fetch and validate the image exists before downloading
      const headRes = await fetch(url, { method: 'HEAD', signal: controller.signal })
      clearTimeout(timeout)

      if (!headRes.ok) {
        if (headRes.status === 429 && attempt < maxRetries - 1) {
          console.warn(`[pollinations] Rate limited (429). Retrying in ${Math.min(1000 * Math.pow(2, attempt), 8000)}ms...`)
          await waitForRetry(attempt)
          continue
        }
        throw new Error(`HTTP ${headRes.status}`)
      }

      // Add timeout to the actual download (15s, longer than HEAD check since download is slower)
      const downloadController = new AbortController()
      const downloadTimeout = setTimeout(() => downloadController.abort(), 15000)

      try {
        return await downloadToGenerated(url, `gen_${hash}.jpg`, downloadController.signal)
      } catch (err) {
        console.error('[pollinations] image download failed:', err)
        throw new Error(`Pollinations image download failed: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        clearTimeout(downloadTimeout)
      }
    } catch (err) {
      if (attempt < maxRetries - 1) {
        console.warn(`[pollinations] Attempt ${attempt + 1} failed, retrying...`, err)
        await waitForRetry(attempt)
      } else {
        console.error('[pollinations] All retries exhausted:', err)
        throw new Error(`Pollinations image generation failed after ${maxRetries} attempts: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  throw new Error('Pollinations image generation failed: unknown error')
}
