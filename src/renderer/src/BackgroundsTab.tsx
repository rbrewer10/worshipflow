import BackgroundLibraryGrid from './BackgroundLibraryGrid'

// Browse/manage view for the background library. Applying a background to
// something still happens where that something is edited (song editor, item
// editor, bottom drawer) — this destination is for uploading, tagging and
// deleting, which previously had nowhere to live.
function BackgroundsTab(): JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-lg font-semibold text-content-primary">Backgrounds</h1>
        <p className="mb-5 text-sm text-content-secondary">
          Upload, tag and delete backgrounds. To put one behind a song or item, pick it
          from that item&apos;s editor or the drawer at the bottom of the screen.
        </p>
        <BackgroundLibraryGrid activePath={null} onApply={() => {}} />
      </div>
    </div>
  )
}

export default BackgroundsTab
