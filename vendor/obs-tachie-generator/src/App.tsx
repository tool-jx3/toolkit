import { useEffect, useState } from 'react'
import AppUserForm from './ui/AppUserForm'
import AppUserList from './ui/AppUserList'
import PresetPanel from './ui/PresetPanel'
import CombinePanel from './ui/CombinePanel'
import OutputPanel from './ui/OutputPanel'
import TachiePreview from './ui/TachiePreview'
import Stepper, { type StepDef } from './ui/Stepper'
import { useImageNaturalSize } from './ui/useImageNaturalSize'
import { loadState, saveState } from './lib/state'
import { t, useLocale } from './i18n'
import {
  makeDefaultPreset,
  newId,
  resolveDisplayName,
  type AppUser,
  type Pairing,
  type Preset,
  type Selection,
} from './lib/types'

/* 存的是 i18n key，由 Stepper 在算繪時取譯文（頂層常數不能先呼叫 t()，否則語言會凍結在載入時）。 */
const STEPS: StepDef[] = [
  { key: 'step.users', desc: 'step.users.desc' },
  { key: 'step.presets', desc: 'step.presets.desc' },
  { key: 'step.output', desc: 'step.output.desc' },
]

export default function App() {
  // 語言一變就整棵重繪（子元件都在算繪時才用 t() 取字串）。
  useLocale()
  const [initial] = useState(loadState)
  const [users, setUsers] = useState<AppUser[]>(initial.users)
  const [presets, setPresets] = useState<Preset[]>(initial.presets)
  const [pairings, setPairings] = useState<Pairing[]>(initial.pairings)
  const [selection, setSelection] = useState<Selection>(initial.selection)
  const [step, setStep] = useState(0)
  // ②正在編輯的預設集（給下方預覽用）。未指定時退回第一個。
  const [focusPresetId, setFocusPresetId] = useState<string | null>(null)

  useEffect(() => {
    saveState({ users, presets, pairings, selection })
  }, [users, presets, pairings, selection])

  const focusedPreset = presets.find((p) => p.id === focusPresetId) ?? presets[0] ?? null

  // 作業中選擇的有效值（沒有明確選擇時退回第一個）。
  const effUserId =
    selection.userId && users.some((u) => u.id === selection.userId)
      ? selection.userId
      : users[0]?.id ?? null
  const effPresetId =
    selection.presetId && presets.some((p) => p.id === selection.presetId)
      ? selection.presetId
      : presets[0]?.id ?? null
  const selectedUser = users.find((u) => u.id === effUserId) ?? null
  const selectedPreset = presets.find((p) => p.id === effPresetId) ?? null
  // ②預覽用的名字。預設集本身沒有「誰」，所以暫時套用選擇中（沒有就第一位）
  // 使用者的名字（一個人都沒有時退回 TachiePreview 的暫定名字）。
  const sampleNameText = selectedUser ? resolveDisplayName(selectedUser) : ''
  // 為了讓寬度為原尺寸的預設集也能用名字對齊與立繪繪製尺寸，先量好圖片的實際尺寸。
  const focusedNatural = useImageNaturalSize(focusedPreset?.imageUrl)
  const selectedNatural = useImageNaturalSize(selectedPreset?.imageUrl)

  // --- users ---
  function addUser(user: AppUser) {
    setUsers((prev) => [...prev.filter((u) => u.id !== user.id), user])
  }
  function changeUser(next: AppUser) {
    setUsers((prev) => prev.map((u) => (u.id === next.id ? next : u)))
  }
  function removeUser(id: string) {
    setUsers((prev) => prev.filter((u) => u.id !== id))
    setPairings((prev) => prev.filter((p) => p.userId !== id))
    setSelection((s) => (s.userId === id ? { ...s, userId: null } : s))
  }

  // --- presets ---
  function addPreset() {
    const p = makeDefaultPreset(newId())
    setPresets((prev) => [...prev, p])
    setFocusPresetId(p.id)
  }
  function changePreset(next: Preset) {
    setPresets((prev) => prev.map((p) => (p.id === next.id ? next : p)))
  }
  function removePreset(id: string) {
    setPresets((prev) => prev.filter((p) => p.id !== id))
    setPairings((prev) => prev.filter((p) => p.presetId !== id))
    setFocusPresetId((cur) => (cur === id ? null : cur))
    setSelection((s) => (s.presetId === id ? { ...s, presetId: null } : s))
  }

  // --- selection & saved pairings ---
  function selectUser(userId: string) {
    setSelection((s) => ({ ...s, userId }))
  }
  function selectPreset(presetId: string) {
    setSelection((s) => ({ ...s, presetId }))
  }
  function saveSelection() {
    if (effUserId == null || effPresetId == null) return
    setPairings((prev) =>
      prev.some((p) => p.userId === effUserId && p.presetId === effPresetId)
        ? prev
        : [...prev, { userId: effUserId, presetId: effPresetId }],
    )
  }
  function recallPairing(pair: Pairing) {
    setSelection({ userId: pair.userId, presetId: pair.presetId })
  }
  function removePairing(index: number) {
    setPairings((prev) => prev.filter((_, i) => i !== index))
  }

  function goto(next: number) {
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)))
  }

  return (
    <div className="app">
      <header>
        <h1>{t('app.heading')}</h1>
        <p>{t('app.lead')}</p>
      </header>

      <Stepper steps={STEPS} current={step} onJump={goto} />

      <div className="work">
        {step === 0 && (
          <section className="step-panel">
            <div className="step-head">
              <span className="step-num">1</span>
              <div>
                <h2>{t('users.heading')}</h2>
                <p className="lead">{t('users.lead')}</p>
              </div>
            </div>
            <AppUserForm onAdd={addUser} />
            <AppUserList users={users} onRemove={removeUser} onChange={changeUser} />
          </section>
        )}

        {step === 1 && (
          <section className="step-panel">
            <div className="step-head">
              <span className="step-num">2</span>
              <div>
                <h2>{t('presets.heading')}</h2>
                <p className="lead">{t('presets.lead')}</p>
              </div>
            </div>
            <PresetPanel
              presets={presets}
              editingId={focusedPreset?.id ?? null}
              onSelect={setFocusPresetId}
              onAdd={addPreset}
              onRemove={removePreset}
              onChange={changePreset}
              imageNaturalWidth={focusedNatural?.width ?? null}
            />
            <TachiePreview
              preset={focusedPreset}
              nameText={sampleNameText}
              sampleWhenEmpty
              title={t('preview.title')}
            />
          </section>
        )}

        {step === 2 && (
          <section className="step-panel">
            <div className="step-head">
              <span className="step-num">3</span>
              <div>
                <h2>{t('output.stepHeading')}</h2>
                <p className="lead">{t('output.lead')}</p>
              </div>
            </div>
            <div className="combine-grid">
              <CombinePanel
                users={users}
                presets={presets}
                pairings={pairings}
                userId={effUserId}
                presetId={effPresetId}
                onSelectUser={selectUser}
                onSelectPreset={selectPreset}
                onSave={saveSelection}
                onRecall={recallPairing}
                onRemove={removePairing}
              />
              <TachiePreview
                preset={selectedPreset}
                nameText={selectedUser ? resolveDisplayName(selectedUser) : ''}
                title={t('preview.title')}
              />
            </div>
            <OutputPanel
              user={selectedUser}
              preset={selectedPreset}
              imageNaturalWidth={selectedNatural?.width ?? null}
              imageNaturalHeight={selectedNatural?.height ?? null}
            />
          </section>
        )}

        <div className="stepnav">
          <button
            className="ghost"
            onClick={() => goto(step - 1)}
            style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
          >
            {t('nav.back')}
          </button>
          <div className="spacer" />
          <span className="label">{t('nav.stepOf', step + 1, STEPS.length)}</span>
          <button
            className="primary"
            onClick={() => goto(step + 1)}
            disabled={step === STEPS.length - 1}
          >
            {t('nav.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
