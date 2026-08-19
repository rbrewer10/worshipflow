import { useEffect, useState } from 'react'
import { Music, BookOpen, Megaphone, Image as ImageIcon } from 'lucide-react'
import Clock from './Clock'
import SongsDrawerTab from './drawer/SongsDrawerTab'
import ScriptureDrawerTab from './drawer/ScriptureDrawerTab'
import AnnouncementsDrawerTab from './drawer/AnnouncementsDrawerTab'
import BackgroundsDrawerTab from './drawer/BackgroundsDrawerTab'

type DrawerTabId = 'songs' | 'scripture' | 'announcements' | 'backgrounds'

const TABS: { id: DrawerTabId; label: string; Icon: typeof Music }[] = [
  { id: 'songs', label: 'Songs', Icon: Music },
  { id: 'scripture', label: 'Scripture', Icon: BookOpen },
  { id: 'announcements', label: 'Announcements', Icon: Megaphone },
  { id: 'backgrounds', label: 'Backgrounds', Icon: ImageIcon }
]

const OPEN_HEIGHT = 280

// A FreeShow-inspired docked drawer available on every screen (except
// Volunteer mode): a tab strip that's always visible, collapsed by default.
// Clicking a tab slides the drawer open (smooth max-height transition);
// clicking it again, picking an item, or Escape slides it closed. Remounted
// (via a `key` at the call site, in AppShell.tsx) whenever the active screen
// changes, so it resets closed rather than carrying state across screens.
function LiveDrawer({ isBuildService }: { isBuildService: boolean }): JSX.Element {
  const [open, setOpen] = useState<DrawerTabId | null>(null)
  const close = (): void => setOpen(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="flex flex-shrink-0 flex-col border-t border-border bg-panel">
      <div className="flex items-center border-b border-border pr-3">
        {TABS.map(({ id, label, Icon }) => {
          const active = open === id
          return (
            <button
              key={id}
              onClick={() => setOpen(active ? null : id)}
              className={`flex items-center gap-1.5 border-r border-border px-4 py-2 text-xs font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-content-secondary hover:bg-panel-raised'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          )
        })}
        <div className="flex-1" />
        <Clock />
      </div>
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-out"
        style={{ maxHeight: open ? OPEN_HEIGHT : 0 }}
      >
        <div className="overflow-auto p-3" style={{ maxHeight: OPEN_HEIGHT }}>
          {open === 'songs' && <SongsDrawerTab onDone={close} isBuildService={isBuildService} />}
          {open === 'scripture' && <ScriptureDrawerTab onDone={close} isBuildService={isBuildService} />}
          {open === 'announcements' && <AnnouncementsDrawerTab onDone={close} isBuildService={isBuildService} />}
          {open === 'backgrounds' && <BackgroundsDrawerTab onDone={close} isBuildService={isBuildService} />}
        </div>
      </div>
    </div>
  )
}

export default LiveDrawer
