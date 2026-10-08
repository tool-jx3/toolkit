/** 使用方式（說明對話框與一覽下方的可收合區塊；規格 F010、F192） */
import { S } from './strings';

export function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ol className="mt-2">
        {S.usage.steps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <ul className="mt-2">
        {S.usage.notes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}
