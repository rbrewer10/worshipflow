// src/main/replicateApi.ts
// Calls Replicate to generate a background image from a text prompt.
import https from 'https'
import { createHash } from 'crypto'
import { downloadToGenerated } from './backgroundLib'

function httpsPost(url: string, body: object, token: string): Promise<object> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const u = new URL(url)
    const timeout = setTimeout(() => {
      req.destroy(new Error('Request timeout'))
      reject(new Error('Request timeout'))
    }, 5000)

    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      clearTimeout(timeout)
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => { try { resolve(JSON.parse(raw)) } catch (e) { reject(e) } })
    })
    req.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
    req.write(data)
    req.end()
  })
}

function httpsGet(url: string, token: string): Promise<object> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const timeout = setTimeout(() => {
      req.destroy(new Error('Request timeout'))
      reject(new Error('Request timeout'))
    }, 5000)

    const req = https.get({ hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      clearTimeout(timeout)
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => { try { resolve(JSON.parse(raw)) } catch (e) { reject(e) } })
    })
    req.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function generateBackgroundImage(prompt: string, apiKey: string): Promise<string> {
  // Create prediction using Flux Schnell (fast, high quality, free tier available)
  const created = await httpsPost(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    { input: { prompt: `${prompt}, wide cinematic 16:9, photorealistic, church worship background`, aspect_ratio: '16:9', output_format: 'webp' } },
    apiKey
  ) as { id: string; urls: { get: string } }

  if (!created.id) throw new Error('Replicate: no prediction id returned')

  // Poll until done (max 60s)
  for (let i = 0; i < 30; i++) {
    await sleep(2000)
    const poll = await httpsGet(created.urls.get, apiKey) as {
      status: string
      output: string[] | null
      error: string | null
    }
    if (poll.error) throw new Error(`Replicate error: ${poll.error}`)
    if (poll.status === 'succeeded' && poll.output && poll.output[0]) {
      const hash = createHash('md5').update(prompt + Date.now()).digest('hex').slice(0, 8)
      const filename = `gen_${hash}.webp`
      const dest = await downloadToGenerated(poll.output[0], filename)
      return dest
    }
  }
  throw new Error('Replicate: timed out after 60s')
}
