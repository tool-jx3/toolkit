import { FONTS } from '../core/fonts';
import { t } from '../i18n';
import { Dialog } from './kit';

export const REPO_URL = 'https://github.com/Taku-Taku-Taku/cutin-maker';

const OSS = [
  { name: 'React', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'UPNG.js', license: 'MIT', url: 'https://github.com/photopea/UPNG.js' },
  { name: 'gifenc', license: 'MIT', url: 'https://github.com/mattdesl/gifenc' },
  { name: 'Vite', license: 'MIT', url: 'https://github.com/vitejs/vite' },
  { name: 'Tailwind CSS', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss' },
];

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">{children}</h3>;
}

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={t('about.title')}>
      <div className="max-h-[70vh] overflow-y-auto pr-1 text-sm leading-relaxed text-neutral-300">
        <p>{t('about.intro')}</p>

        <H>{t('about.unofficial')}</H>
        <p>
          {t('about.unofficial.p1')}
          <strong className="text-neutral-100">{t('about.unofficial.strong')}</strong>
          {t('about.unofficial.p2')}
        </p>

        <H>{t('about.privacy')}</H>
        <p>
          {t('about.privacy.p1')}
          <strong className="text-neutral-100">{t('about.privacy.strong')}</strong>
          {t('about.privacy.p2')}
          <code className="text-neutral-400">#</code>
          {t('about.privacy.p3')}
        </p>

        <H>{t('about.output')}</H>
        <p>{t('about.output.body')}</p>

        <H>{t('about.disclaimer')}</H>
        <p>{t('about.disclaimer.body')}</p>

        <H>{t('about.license')}</H>
        <p className="mb-1">
          {t('about.license.p1')}
          <a className="text-sky-300 underline" href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer noopener">
            {t('about.license.full')}
          </a>
          {t('about.license.p2')}
        </p>
        <p className="mb-1">{t('about.license.oss')}</p>
        <ul className="mb-2 list-disc pl-5 text-[13px] text-neutral-400">
          {OSS.map((o) => (
            <li key={o.name}>
              <a className="underline hover:text-neutral-200" href={o.url} target="_blank" rel="noreferrer noopener">
                {o.name}
              </a>{' '}
              — {o.license}
            </li>
          ))}
        </ul>
        <p className="mb-1">
          {t('about.fonts.p1')}
          <a className="text-sky-300 underline" href="./licenses/OFL.txt" target="_blank" rel="noreferrer noopener">
            SIL Open Font License 1.1
          </a>
          {t('about.fonts.p2')}
        </p>
        <ul className="list-disc pl-5 text-[13px] text-neutral-400">
          {FONTS.map((f) => (
            <li key={f.id}>
              {f.family.replace(/"/g, '')}（{f.label}）
            </li>
          ))}
        </ul>

        <H>{t('about.source')}</H>
        <p>
          <a className="text-sky-300 underline" href={REPO_URL} target="_blank" rel="noreferrer noopener">
            {REPO_URL.replace('https://', '')}
          </a>
        </p>
      </div>
    </Dialog>
  );
}

/** 全画面共通のフッタ。非公式である旨は畳まずに常時出す */
export function Footer({ onAbout }: { onAbout: () => void }) {
  return (
    <footer className="mx-auto mt-8 max-w-[1400px] border-t border-neutral-800 px-4 py-4 text-[11px] text-neutral-500">
      <p>{t('footer.note')}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <button type="button" onClick={onAbout} className="underline hover:text-neutral-300">
          {t('footer.about')}
        </button>
        <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="underline hover:text-neutral-300">
          GitHub
        </a>
      </div>
    </footer>
  );
}
