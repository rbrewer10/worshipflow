import { useState } from 'react'
import { Check, Plus, Trash2, Users, X } from 'lucide-react'
import type { ServiceItem, ServicePerson, ServiceTeam } from '../../shared/types'
import Modal from './Modal'

const ROLES = ['Pastor', 'Worship leader', 'Vocalist', 'Musician', 'Host', 'Media operator', 'Other']

export default function ServiceTeamPanel({ team, selectedItem, onChange, onClose }: {
  team: ServiceTeam
  selectedItem: ServiceItem | null
  onChange: (team: ServiceTeam) => void
  onClose: () => void
}): JSX.Element {
  const [name, setName] = useState('')
  const [role, setRole] = useState(ROLES[0])

  const addPerson = (): void => {
    if (!name.trim()) return
    const person: ServicePerson = { id: crypto.randomUUID(), name: name.trim(), role, status: 'confirmed' }
    onChange({ ...team, people: [...team.people, person] })
    setName('')
  }

  const removePerson = (id: string): void => {
    const assignments = Object.fromEntries(Object.entries(team.assignments).map(([itemId, ids]) => [itemId, ids.filter((personId) => personId !== id)]))
    onChange({ people: team.people.filter((person) => person.id !== id), assignments })
  }

  const toggleAssignment = (personId: string): void => {
    if (!selectedItem) return
    const current = team.assignments[String(selectedItem.id)] ?? []
    const next = current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId]
    onChange({ ...team, assignments: { ...team.assignments, [String(selectedItem.id)]: next } })
  }

  const assigned = new Set(selectedItem ? team.assignments[String(selectedItem.id)] ?? [] : [])

  return (
    <Modal onClose={onClose} labelledBy="service-team-title" className="w-full max-w-2xl rounded-2xl border border-border bg-panel-raised p-6 text-content-primary shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-violet-400"><Users size={20} /></div>
          <h2 id="service-team-title" className="text-xl font-semibold">Sunday team</h2>
          <p className="mt-1 text-sm text-content-secondary">Keep the people and handoffs for this service in one place.</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-content-tertiary hover:text-content-primary"><X size={18} /></button>
      </div>

      <div className="mb-5 grid grid-cols-[1fr_1fr_auto] gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPerson()} placeholder="Person name" aria-label="Person name" />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Person role">
          {ROLES.map((option) => <option key={option}>{option}</option>)}
        </select>
        <button onClick={addPerson} className="btn-primary px-3" aria-label="Add person"><Plus size={15} /></button>
      </div>

      {selectedItem && <div className="mb-3 rounded-lg border border-blue-500/25 bg-blue-500/[0.06] p-3"><div className="text-xs font-bold uppercase tracking-widest text-blue-400">Assign to selected moment</div><div className="mt-1 text-sm font-semibold">{selectedItem.title}</div></div>}

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {team.people.length === 0 && <p className="rounded-lg border border-dashed border-border-strong p-4 text-center text-sm text-content-tertiary">Add your first person above.</p>}
        {team.people.map((person) => (
          <div key={person.id} className="flex items-center gap-3 rounded-xl border border-border bg-panel p-3">
            {selectedItem && <button onClick={() => toggleAssignment(person.id)} aria-label={`${assigned.has(person.id) ? 'Remove' : 'Assign'} ${person.name}`} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${assigned.has(person.id) ? 'border-blue-500 bg-blue-600 text-white' : 'border-border-strong text-transparent hover:border-blue-500'}`}><Check size={14} /></button>}
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{person.name}</div><div className="text-xs text-content-secondary">{person.role}</div></div>
            <button onClick={() => removePerson(person.id)} aria-label={`Remove ${person.name}`} className="text-content-tertiary hover:text-red-400"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      {selectedItem && <p className="mt-3 text-xs text-content-tertiary">Checked people are assigned to this service moment. You can select a different moment after closing this panel.</p>}
    </Modal>
  )
}
