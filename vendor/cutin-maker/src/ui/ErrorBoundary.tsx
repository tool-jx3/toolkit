import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n';

const ISSUES_URL = 'https://github.com/Taku-Taku-Taku/cutin-maker/issues';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 描画・エンコードで throw したときに白画面にしない。
 * 壊れた共有URLを踏んだ人が復帰できる導線でもある。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[cutin-maker]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-[640px] p-6">
        <h1 className="text-lg font-bold text-red-300">{t('err.title')}</h1>
        <p className="mt-2 text-sm text-neutral-300">
          {t('err.body')}
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-neutral-800 bg-neutral-900 p-3 text-[11px] text-neutral-400">
          {error.message}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              // 共有URLを捨ててから読み直す（壊れた hash が原因なら復帰する）
              location.hash = '';
              location.reload();
            }}
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-sky-400"
          >
            {t('err.restart')}
          </button>
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
          >
            {t('err.report')}
          </a>
        </div>
      </div>
    );
  }
}
