import { useEffect, useState } from 'react'
import { Save, X } from 'lucide-react'

interface ServiceTemplate {
  id: string
  name: string
  description?: string
  items: any[]
  theme: string | null
  themeColors: any | null
  createdAt: number
}

interface ServiceFull {
  id: number
  items: any[]
  theme: string | null
  themeColors: any | null
}

export function TemplatesPanel({
  currentService,
  onLoadTemplate,
  onClose
}: {
  currentService: ServiceFull | null
  onLoadTemplate: (items: any[], theme: string | null, themeColors: any | null) => Promise<void>
  onClose: () => void
}): JSX.Element {
  const [templates, setTemplates] = useState<ServiceTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async (): Promise<void> => {
    try {
      setLoading(true)
      const list = await window.wf.templatesList()
      setTemplates(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleLoadTemplate = async (template: ServiceTemplate): Promise<void> => {
    try {
      setLoading(true)
      await onLoadTemplate(template.items, template.theme, template.themeColors)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTemplate = async (): Promise<void> => {
    if (!currentService || !saveName.trim()) return
    try {
      setLoading(true)
      await window.wf.templatesSave({
        id: crypto.randomUUID(),
        name: saveName.trim(),
        description: saveDesc.trim() || undefined,
        items: currentService.items,
        theme: currentService.theme,
        themeColors: currentService.themeColors
      })
      setSaveName('')
      setSaveDesc('')
      setShowSaveForm(false)
      await loadTemplates()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTemplate = async (id: string): Promise<void> => {
    if (!confirm('Delete this template?')) return
    try {
      setLoading(true)
      await window.wf.templatesDelete(id)
      await loadTemplates()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-[#f4f6f9] p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Service Templates</h2>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center text-slate-600 hover:text-slate-900"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Save Current Service as Template */}
        {currentService && (
          <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
            {!showSaveForm ? (
              <button
                onClick={() => setShowSaveForm(true)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                <Save size={15} /> Save Current Service as Template
              </button>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Template name (e.g. Sunday Worship 60min)"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-500"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveTemplate}
                    disabled={!saveName.trim() || loading}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setShowSaveForm(false)
                      setSaveName('')
                      setSaveDesc('')
                    }}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Templates List */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Available Templates</h3>
          {loading && templates.length === 0 ? (
            <p className="text-center text-sm text-slate-600">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="text-center text-sm text-slate-600">No templates saved yet.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-100 p-3 hover:bg-slate-200"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{template.name}</p>
                    {template.description && (
                      <p className="text-xs text-slate-600 truncate">{template.description}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">{template.items.length} items</p>
                  </div>
                  <div className="flex gap-2 ml-3">
                    <button
                      onClick={() => handleLoadTemplate(template)}
                      disabled={loading}
                      className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      disabled={loading}
                      className="rounded-lg bg-red-600/20 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-600/30 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
