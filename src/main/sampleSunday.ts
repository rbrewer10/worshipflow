import { SAMPLE_SERVICE_NAME, SAMPLE_SONGS } from '../shared/sampleSunday'
import { addServiceItem, createService, createSong, listServices, listSongs } from './db'

export function seedSampleSunday(): { serviceId: number; created: boolean } {
  const existing = listServices().find((s) => s.name === SAMPLE_SERVICE_NAME)
  if (existing) return { serviceId: existing.id, created: false }

  const songIds = SAMPLE_SONGS.map((song) => {
    const hit = listSongs(song.title).find((s) => s.title === song.title)
    return hit ? hit.id : createSong(song)
  })

  const serviceId = createService(SAMPLE_SERVICE_NAME)
  addServiceItem(serviceId, { type: 'header', payload: { label: 'Welcome' } })
  addServiceItem(serviceId, { type: 'countdown', payload: { seconds: 300 } })
  addServiceItem(serviceId, { type: 'text', payload: { title: 'Welcome', body: 'Welcome to worship. Please silence your phones.' } })
  addServiceItem(serviceId, { type: 'header', payload: { label: 'Worship' } })
  addServiceItem(serviceId, { type: 'song', ref_id: songIds[0], payload: {} })
  addServiceItem(serviceId, { type: 'song', ref_id: songIds[1], payload: {} })
  addServiceItem(serviceId, { type: 'header', payload: { label: 'Word' } })
  addServiceItem(serviceId, { type: 'scripture', payload: { reference: 'John 3:16-17' } })
  addServiceItem(serviceId, { type: 'sermon', payload: { title: 'Sample message', speaker: 'Pastor', passage: 'John 3:16' } })
  addServiceItem(serviceId, { type: 'header', payload: { label: 'Response' } })
  addServiceItem(serviceId, { type: 'song', ref_id: songIds[2], payload: {} })
  return { serviceId, created: true }
}
