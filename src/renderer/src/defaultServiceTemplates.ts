import type { ServiceItemType } from '../../shared/types'
import type { SundayTemplateChoice } from './StartSundayModal'

type StarterItem = {
  type: ServiceItemType
  payload?: Record<string, unknown>
  track?: 'main' | 'second'
}

const section = (label: string, color: string): StarterItem => ({ type: 'header', payload: { label, color } })
const placeholder = (label: string): StarterItem => ({ type: 'placeholder', payload: { label } })
const sermon = (): StarterItem => ({ type: 'sermon', payload: { title: 'Message' } })
const welcome = (): StarterItem => ({ type: 'welcome', payload: { seconds: 300 } })

function template(id: string, name: string, description: string, items: StarterItem[]): SundayTemplateChoice {
  return { id, name, description, items, theme: 'modern-church', themeColors: null, builtIn: true }
}

export const DEFAULT_SERVICE_TEMPLATES: SundayTemplateChoice[] = [
  template('builtin-traditional', 'Traditional Worship', 'A familiar 60-minute order with hymn, prayer, offering, and message.', [
    section('Welcome', '#0891b2'), welcome(), placeholder('Opening hymn'), section('Word & Prayer', '#ca8a04'), placeholder('Call to worship'), placeholder('Pastoral prayer'), placeholder('Offering'), section('Message', '#7c3aed'), sermon(), placeholder('Closing hymn')
  ]),
  template('builtin-contemporary', 'Contemporary Worship', 'A flexible worship set with a clear response and sending moment.', [
    section('Gather', '#0891b2'), welcome(), placeholder('Opening song'), section('Worship', '#2563eb'), placeholder('Worship song 1'), placeholder('Worship song 2'), placeholder('Prayer / response'), section('Message', '#7c3aed'), sermon(), section('Send', '#16a34a'), placeholder('Closing song'), placeholder('Announcements')
  ]),
  template('builtin-short', 'Short Service', 'A focused 30-minute plan for a simple, intentional Sunday gathering.', [
    section('Gather', '#0891b2'), welcome(), placeholder('Worship song'), section('Message', '#7c3aed'), sermon(), section('Close', '#16a34a'), placeholder('Closing prayer')
  ]),
  template('builtin-communion', 'Communion Sunday', 'A reflective order that gives communion its own visible place in the service.', [
    section('Welcome', '#0891b2'), welcome(), placeholder('Opening song'), section('The Table', '#ca8a04'), placeholder('Communion invitation'), placeholder('Communion song'), placeholder('Communion prayer'), section('Message', '#7c3aed'), sermon(), placeholder('Sending song')
  ]),
  template('builtin-special-event', 'Special Event', 'A roomy event flow for guest speakers, baptisms, dedications, or celebrations.', [
    section('Welcome', '#0891b2'), welcome(), placeholder('Opening moment'), section('Featured Moment', '#c026d3'), placeholder('Special presentation'), placeholder('Guest / testimony'), section('Message', '#7c3aed'), sermon(), section('Response', '#16a34a'), placeholder('Response moment'), placeholder('Closing')
  ])
]
