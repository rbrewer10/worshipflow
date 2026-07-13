// Calls the Anthropic Messages API to generate sermon YouTube title + description.
import https from 'https'

function post(body: object, apiKey: string): Promise<{ content?: { type: string; text?: string }[] }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(data)
      }
    }, (res) => {
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) { reject(new Error(`Anthropic ${res.statusCode}: ${raw.slice(0, 300)}`)); return }
        try { resolve(JSON.parse(raw)) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

export async function generateSermonContent(prompt: string, apiKey: string): Promise<{ title: string; description: string }> {
  const res = await post({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  }, apiKey)
  const text = res.content?.find((b) => b.type === 'text')?.text ?? ''
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('Anthropic: no JSON in response')
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as { title?: string; description?: string }
  if (!parsed.title || !parsed.description) throw new Error('Anthropic: missing title/description')
  return { title: parsed.title, description: parsed.description }
}
