import { describe, it, expect } from 'vitest'
import { isExistingInstall, planSetupFinish, DEFAULT_CHURCH_NAME } from './firstRun'

const empty = { songs: 0, services: 0, announcements: 0, settings: {} }

describe('isExistingInstall (QA B1: upgraded booth PCs must not see the first-run wizard)', () => {
  it('a brand-new database is not an existing install', () => {
    expect(isExistingInstall(empty)).toBe(false)
  })

  it('internal bookkeeping settings alone do not count', () => {
    expect(isExistingInstall({ ...empty, settings: { reflow_migration_done: '1', tablet_pin: '123456', livecall_token: 'abc' } })).toBe(false)
  })

  it('a 0.19 database with songs or services is an existing install', () => {
    expect(isExistingInstall({ ...empty, songs: 12 })).toBe(true)
    expect(isExistingInstall({ ...empty, services: 1 })).toBe(true)
    expect(isExistingInstall({ ...empty, announcements: 3 })).toBe(true)
  })

  it('a configured church name, CCLI license or onboarding flag counts even with an empty library', () => {
    expect(isExistingInstall({ ...empty, settings: { church_name: 'Snow Hill Congregational Methodist Church' } })).toBe(true)
    expect(isExistingInstall({ ...empty, settings: { ccli_license: '7654321' } })).toBe(true)
    expect(isExistingInstall({ ...empty, settings: { has_seen_onboarding: '1' } })).toBe(true)
  })

  it('blank settings do not count', () => {
    expect(isExistingInstall({ ...empty, settings: { church_name: '  ', ccli_license: null } })).toBe(false)
  })
})

describe('planSetupFinish (QA B1: Skip / Finish must never wipe saved settings)', () => {
  const saved = {
    savedChurchName: 'Snow Hill Congregational Methodist Church',
    savedCcliLicense: '7654321',
    enteredChurchName: 'Snow Hill Congregational Methodist Church',
    enteredCcliLicense: '7654321',
    skip: false,
    seedSample: false,
    hasActiveService: true
  }

  it('Skip changes nothing at all', () => {
    expect(planSetupFinish({ ...saved, skip: true, enteredChurchName: '', enteredCcliLicense: '' })).toEqual({ seedSample: false, activateSample: false })
  })

  it('finishing with the pre-filled values writes nothing', () => {
    expect(planSetupFinish(saved)).toEqual({ seedSample: false, activateSample: false })
  })

  it('an emptied CCLI field never clears an existing license', () => {
    expect(planSetupFinish({ ...saved, enteredCcliLicense: '  ' }).ccliLicense).toBeUndefined()
  })

  it('an emptied church-name field never resets the saved name to the default', () => {
    expect(planSetupFinish({ ...saved, enteredChurchName: '' }).churchName).toBeUndefined()
  })

  it('real edits are saved', () => {
    const plan = planSetupFinish({ ...saved, enteredChurchName: ' Grace Chapel ', enteredCcliLicense: '1112223' })
    expect(plan.churchName).toBe('Grace Chapel')
    expect(plan.ccliLicense).toBe('1112223')
  })

  it('loading Sample Sunday does not replace an already-active service', () => {
    expect(planSetupFinish({ ...saved, seedSample: true })).toMatchObject({ seedSample: true, activateSample: false })
    expect(planSetupFinish({ ...saved, seedSample: true, hasActiveService: false })).toMatchObject({ seedSample: true, activateSample: true })
  })

  it('a truly fresh install still gets the default church name', () => {
    const plan = planSetupFinish({ ...saved, savedChurchName: null, savedCcliLicense: null, enteredChurchName: '', enteredCcliLicense: '' })
    expect(plan.churchName).toBe(DEFAULT_CHURCH_NAME)
    expect(plan.ccliLicense).toBeUndefined()
  })
})
