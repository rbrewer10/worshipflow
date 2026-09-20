import type { SongInput } from './types'

function section(kind: SongInput['sections'][number]['kind'], label: string, ordinal: number, lyrics: string): SongInput['sections'][number] {
  return { kind, label, ordinal, lyrics }
}

export const SAMPLE_SONGS: SongInput[] = [
  {
    title: 'Amazing Grace',
    author: 'John Newton',
    copyright: 'Public Domain',
    ccli: '22025',
    sections: [
      section('verse', 'Verse 1', 0, 'Amazing grace, how sweet the sound\nThat saved a wretch like me\nI once was lost, but now am found\nWas blind, but now I see'),
      section('verse', 'Verse 2', 1, '\'Twas grace that taught my heart to fear\nAnd grace my fears relieved\nHow precious did that grace appear\nThe hour I first believed'),
      section('verse', 'Verse 3', 2, 'When we\'ve been there ten thousand years\nBright shining as the sun\nWe\'ve no less days to sing God\'s praise\nThan when we first begun'),
    ],
  },
  {
    title: 'Come Thou Fount of Every Blessing',
    author: 'Robert Robinson',
    copyright: 'Public Domain',
    sections: [
      section('verse', 'Verse 1', 0, 'Come, Thou Fount of every blessing\nTune my heart to sing Thy grace\nStreams of mercy, never ceasing\nCall for songs of loudest praise'),
      section('verse', 'Verse 2', 1, 'Here I raise my Ebenezer\nHither by Thy help I\'ve come\nAnd I hope, by Thy good pleasure\nSafely to arrive at home'),
      section('verse', 'Verse 3', 2, 'Prone to wander, Lord, I feel it\nProne to leave the God I love\nHere\'s my heart, O take and seal it\nSeal it for Thy courts above'),
    ],
  },
  {
    title: 'Holy, Holy, Holy',
    author: 'Reginald Heber',
    copyright: 'Public Domain',
    sections: [
      section('verse', 'Verse 1', 0, 'Holy, holy, holy! Lord God Almighty\nEarly in the morning our song shall rise to Thee\nHoly, holy, holy! Merciful and mighty\nGod in three persons, blessed Trinity'),
      section('verse', 'Verse 2', 1, 'Holy, holy, holy! All the saints adore Thee\nCasting down their golden crowns around the glassy sea\nCherubim and seraphim falling down before Thee\nWhich wert, and art, and evermore shalt be'),
    ],
  },
]

export const SAMPLE_SERVICE_NAME = 'Sample Sunday'
