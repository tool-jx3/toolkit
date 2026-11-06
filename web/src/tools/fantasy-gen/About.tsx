/**
 * 「關於規則內容與授權」：做法的出處、用到的 SRD 與署名文（照原文）、本站翻譯與修改的說明、本站自己寫的部分、
 * 名字的語料、地名的 CC0。和 THIRD_PARTY_NOTICES 列的是同一份。
 */
import { INKNOMU_SOURCE } from '@/core/names/corpus';
import { Section } from '@/ui';
import { ATTRIBUTIONS, CC_BY_4, CC0, UPSTREAM } from './attributions';
import { TOOL_ID } from './logic';
import { S } from './strings';

const LINK = 'text-accent underline break-all';

export function About() {
  return (
    <Section title={S.about.title} persistKey={`${TOOL_ID}:about`} defaultOpen={false}>
      <div data-testid="about-rules" className="flex flex-col gap-2 text-sm leading-relaxed">
        <p className="m-0">
          {S.about.lead}（
          <a className={LINK} href={UPSTREAM.url} target="_blank" rel="noopener noreferrer">
            {UPSTREAM.name}
          </a>
          ）
        </p>
        <p className="m-0 text-muted">{S.about.compat}</p>
        <p className="m-0 text-xs font-semibold text-muted">{S.about.statementTitle}</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {ATTRIBUTIONS.map((a) => (
            <li
              key={a.id}
              data-testid="attribution"
              className="rounded-md border border-border bg-surface-2 p-2"
            >
              <p className="m-0 font-medium">
                <a className={LINK} href={a.url} target="_blank" rel="noopener noreferrer">
                  {a.name}
                </a>
              </p>
              <p className="m-0 break-words text-xs" lang="en">
                {a.statement}
              </p>
            </li>
          ))}
        </ul>
        <p className="m-0">
          {S.about.modified}
          {S.about.license}：
          <a className={LINK} href={CC_BY_4.url} target="_blank" rel="noopener noreferrer">
            {CC_BY_4.name}
          </a>
          。
        </p>
        <p className="m-0">{S.about.own}</p>
        <p className="m-0">
          {S.about.names}（
          <a className={LINK} href={INKNOMU_SOURCE.url} target="_blank" rel="noopener noreferrer">
            {INKNOMU_SOURCE.name}
          </a>
          ）
        </p>
        <p className="m-0">
          {S.about.cc0}（
          <a className={LINK} href={CC0.url} target="_blank" rel="noopener noreferrer">
            {CC0.name}
          </a>
          ）
        </p>
        <p className="m-0 text-xs text-muted">{S.about.noticesHint}</p>
      </div>
    </Section>
  );
}
