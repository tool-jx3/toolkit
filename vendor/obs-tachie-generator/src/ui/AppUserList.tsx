import type { AppUser } from '../lib/types'
import { t } from '../i18n'

interface Props {
  users: AppUser[]
  onRemove: (id: string) => void
  /** 編輯「畫面上顯示的名字」。 */
  onChange: (user: AppUser) => void
}

/**
 * 已登錄使用者（誰）的清單。不持有立繪，所以只有 ID 與名字。
 * 只有「畫面上顯示的名字」可以在這裡直接編輯（不必重新登錄就能改稱呼）。
 */
export default function AppUserList({ users, onRemove, onChange }: Props) {
  return (
    <div className="panel">
      <h2>{t('userList.heading', users.length)}</h2>
      {users.length === 0 ? (
        <p className="empty">{t('userList.empty')}</p>
      ) : (
        users.map((u) => (
          <div className="user-item" key={u.id}>
            <div className="meta">
              <div className="name">{u.name || t('userList.noName')}</div>
              <div className="id">{u.id}</div>
            </div>
            <div className="field" style={{ flex: '1 1 180px', minWidth: 0 }}>
              <label htmlFor={`ul-display-${u.id}`}>{t('userList.display')}</label>
              <input
                id={`ul-display-${u.id}`}
                type="text"
                // 同樣文字的標籤會依人數排好幾個，所以讓讀螢幕軟體知道是誰的欄位。
                aria-label={t('userList.display.aria', u.name || u.id)}
                placeholder={u.name || t('userList.display.unset')}
                value={u.displayName ?? ''}
                onChange={(e) => onChange({ ...u, displayName: e.target.value })}
              />
            </div>
            <button className="danger" onClick={() => onRemove(u.id)}>
              {t('action.remove')}
            </button>
          </div>
        ))
      )}
    </div>
  )
}
