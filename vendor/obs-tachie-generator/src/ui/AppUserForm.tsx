import { useState } from 'react'
import type { AppUser } from '../lib/types'
import { t, tRich } from '../i18n'

interface Props {
  onAdd: (user: AppUser) => void
}

/**
 * 登錄「誰」的表單。只有 Discord 使用者 ID＋顯示名稱（圖片不在這裡）。
 * 外觀在預設集那邊準備，輸出時再配對組合。
 */
export default function AppUserForm({ onAdd }: Props) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  // 存 i18n key，算繪時才取譯文（切換語言後跟著換）。空字串表示沒有錯誤。
  const [errorKey, setErrorKey] = useState('')

  function submit() {
    setErrorKey('')
    const cleanId = id.replace(/[^0-9]/g, '')
    if (!cleanId) {
      setErrorKey('userForm.err.noId')
      return
    }
    onAdd({ id: cleanId, name: name.trim(), displayName: displayName.trim() })
    setId('')
    setName('')
    setDisplayName('')
  }

  return (
    <div className="panel">
      <h2>{t('userForm.heading')}</h2>
      <div className="row">
        <div className="field">
          <label htmlFor="uf-id">{t('userForm.id')}</label>
          <input
            id="uf-id"
            type="text"
            inputMode="numeric"
            placeholder="123456789012345678"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="uf-name">{t('userForm.name')}</label>
          <input
            id="uf-name"
            type="text"
            placeholder={t('userForm.name.placeholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="uf-display">{t('userForm.display')}</label>
          <input
            id="uf-display"
            type="text"
            placeholder={t('userForm.display.placeholder')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
      </div>

      <p className="hint" style={{ marginTop: 0 }}>
        {tRich('userForm.hint1', <b style={{ color: 'var(--text)' }}>{t('userForm.hint1.who')}</b>)}
        <br />
        {tRich(
          'userForm.hint2',
          <b style={{ color: 'var(--text)' }}>{t('userForm.hint2.display')}</b>,
        )}
      </p>

      {errorKey && (
        <p className="hint" style={{ color: 'var(--danger)' }} role="alert">
          {t(errorKey)}
        </p>
      )}

      <button className="primary" onClick={submit}>
        {t('action.add')}
      </button>
    </div>
  )
}
