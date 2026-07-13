// src/main/replicateApi.ts
// Calls Replicate to generate a background image from a text prompt.
import https from 'https'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { basename } from 'path'
import { downloadToGenerated } from './backgroundLib'

// Rolling idle timeout: fires only after IDLE_MS of no activity (connect stall OR
// a stalled response body), resetting on every chunk. Prevents a half-delivered
// response from hanging the generation forever on flaky wifi.
const IDLE_MS = 8000

function httpsPost(url: string, body: object, token: string): Promise<object> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const u = new URL(url)
    let timeout: ReturnType<typeof setTimeout>
    const arm = (): void => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => { req.destroy(new Error('Request timeout')); reject(new Error('Request timeout')) }, IDLE_MS)
    }
    arm()

    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let raw = ''
      res.on('data', (c) => { arm(); raw += c })
      res.on('end', () => { clearTimeout(timeout); try { resolve(JSON.parse(raw)) } catch (e) { reject(e) } })
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
    let timeout: ReturnType<typeof setTimeout>
    const arm = (): void => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => { req.destroy(new Error('Request timeout')); reject(new Error('Request timeout')) }, IDLE_MS)
    }
    arm()

    const req = https.get({ hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let raw = ''
      res.on('data', (c) => { arm(); raw += c })
      res.on('end', () => { clearTimeout(timeout); try { resolve(JSON.parse(raw)) } catch (e) { reject(e) } })
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

// Uploads a local file to Replicate's files API and returns a servable URL.
function uploadFileToReplicate(filePath: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileBuf = readFileSync(filePath)
    const boundary = '----wfform' + Date.now()
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="content"; filename="${basename(filePath)}"\r\n` +
      `Content-Type: audio/mpeg\r\n\r\n`
    )
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
    const body = Buffer.concat([head, fileBuf, tail])
    const req = https.request({
      hostname: 'api.replicate.com', path: '/v1/files', method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, (res) => {
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => {
        try {
          const j = JSON.parse(raw) as { urls?: { get?: string } }
          if (j.urls?.get) resolve(j.urls.get)
          else reject(new Error(`Replicate upload failed: ${raw.slice(0, 200)}`))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export interface WhisperResult {
  text: string
  segments: { start: number; end: number; text: string }[]
}

// Transcribes an audio file via Replicate's Whisper model, returning full text + timed segments.
export async function transcribeAudio(mp3Path: string, apiKey: string): Promise<WhisperResult> {
  const audioUrl = await uploadFileToReplicate(mp3Path, apiKey)
  const created = await httpsPost(
    'https://api.replicate.com/v1/models/openai/whisper/predictions',
    { input: { audio: audioUrl, model: 'large-v3' } },
    apiKey
  ) as { id: string; urls: { get: string } }
  if (!created.id) throw new Error('Replicate: no prediction id (whisper)')

  for (let i = 0; i < 150; i++) { // up to ~5 min
    await sleep(2000)
    const poll = await httpsGet(created.urls.get, apiKey) as {
      status: string
      output: { transcription?: string; segments?: { start: number; end: number; text: string }[] } | null
      error: string | null
    }
    if (poll.error) throw new Error(`Replicate whisper error: ${poll.error}`)
    if (poll.status === 'succeeded' && poll.output) {
      const segs = (poll.output.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text }))
      return { text: poll.output.transcription ?? segs.map((s) => s.text).join(' '), segments: segs }
    }
    if (poll.status === 'failed' || poll.status === 'canceled') throw new Error('Replicate whisper: ' + poll.status)
  }
  throw new Error('Replicate whisper: timed out')
}
