import { t } from '../i18n'

export interface StepDef {
  /** 顯示標籤的 i18n key（例：使用者登錄）。也當作 React 的 key，所以不隨語言變動。 */
  key: string
  /** 補充說明的 i18n key（窄螢幕時隱藏）。 */
  desc: string
}

interface Props {
  steps: StepDef[]
  /** 目前的步驟（從 0 開始）。 */
  current: number
  onJump: (index: number) => void
}

/** 附編號的步驟列。每個分頁都可以直接跳過去。 */
export default function Stepper({ steps, current, onJump }: Props) {
  return (
    <nav className="stepper" aria-label={t('stepper.aria')}>
      {steps.map((s, i) => (
        <button
          key={s.key}
          type="button"
          className={`step-tab${i < current ? ' done' : ''}`}
          aria-current={i === current ? 'step' : undefined}
          onClick={() => onJump(i)}
        >
          <span className="n">{i + 1}</span>
          <span className="t">
            <span className="k">{t(s.key)}</span>
            <span className="d">{t(s.desc)}</span>
          </span>
        </button>
      ))}
    </nav>
  )
}
