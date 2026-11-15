/**
 * 文件：劇本名、匯出（列印／PDF、HTML、文字、劇本排版台的格式）、文件的預覽（和列印、HTML 是同一份）。
 */
import {
  ClipboardCopy,
  Download,
  FileCode2,
  FileText,
  Library,
  Printer,
  SquarePen,
} from 'lucide-react';
import { useMemo } from 'react';
import { copyText, downloadText, safeFileName } from '@/core/files';
import { PAPER_SIZES, printPages } from '@/core/paged';
import { getTool, hrefToTool } from '@/registry';
import { Button, buttonClass, Field, MenuButton, TextInput, useToast } from '@/ui';
import { setStep, setTitle } from '../actions';
import { getDeck } from '../data';
import {
  DOC_CSS,
  documentFile,
  documentHtml,
  editorMarkdown,
  outlineText,
} from '../model/document';
import { autoTitle, type Scenario, titleOf } from '../model/scenario';
import { usePrefs } from '../store';
import { S } from '../strings';
import { textGesture } from './hooks';

export const fileBase = (sc: Scenario): string =>
  safeFileName(titleOf(getDeck(sc.deck), sc), { fallback: S.doc.untitled, maxLength: 60 });

export function printScenario(sc: Scenario): Promise<HTMLIFrameElement> {
  const deck = getDeck(sc.deck);
  return printPages({
    title: titleOf(deck, sc),
    css: DOC_CSS,
    pages: [documentHtml(deck, sc)],
    size: PAPER_SIZES.A4,
    pageMargin: '12mm',
  });
}

const editor = getTool('scenario-editor');

export function SheetView({ sc }: { sc: Scenario }) {
  const deck = getDeck(sc.deck);
  const toast = useToast();
  const patch = usePrefs((s) => s.patch);
  const html = useMemo(() => documentHtml(deck, sc), [deck, sc]);
  const base = fileBase(sc);
  return (
    <div className="flex flex-col gap-3" data-testid="sheet">
      <header className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <h2 className="m-0 text-lg font-bold text-fg">{S.sheet.title}</h2>
        <p className="m-0 text-sm text-muted">{S.sheet.lead}</p>
        <Field label={S.sheet.titleLabel}>
          <TextInput
            value={sc.title}
            maxLength={60}
            placeholder={autoTitle(deck, sc)}
            data-field="title"
            onFocus={textGesture.begin}
            onBlur={textGesture.commit}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        {/* biome-ignore lint/a11y/useSemanticElements: 一組匯出的按鈕，不是表單分組 */}
        <div className="flex flex-wrap gap-2" role="group" aria-label={S.sheet.exportLabel}>
          <Button
            variant="primary"
            icon={<Printer />}
            data-testid="print"
            title={S.sheet.printHint}
            onClick={() => {
              void printScenario(sc);
              toast({ title: S.sheet.printing, description: S.sheet.printHint, replace: true });
            }}
          >
            {S.sheet.print}
          </Button>
          <Button
            icon={<FileCode2 />}
            onClick={() => {
              downloadText(documentFile(deck, sc), `${base}.html`, 'text/html;charset=utf-8');
              toast({ title: S.sheet.savedHtml, tone: 'success', replace: true });
            }}
          >
            {S.sheet.html}
          </Button>
          <Button
            icon={<FileText />}
            onClick={() => {
              downloadText(outlineText(deck, sc), `${base}.txt`);
              toast({ title: S.sheet.savedText, tone: 'success', replace: true });
            }}
          >
            {S.sheet.text}
          </Button>
          <MenuButton
            label={S.sheet.toEditor}
            icon={<SquarePen />}
            items={[
              {
                label: S.sheet.toEditorCopy,
                description: S.sheet.toEditorHint,
                icon: <ClipboardCopy />,
                'data-testid': 'md-copy',
                onSelect: async () => {
                  const ok = await copyText(editorMarkdown(deck, sc)).catch(() => false);
                  toast(
                    ok
                      ? { title: S.sheet.copiedMd, tone: 'success', replace: true }
                      : {
                          title: S.sheet.copyFailed,
                          description: S.sheet.copyFailedHint,
                          tone: 'danger',
                          replace: true,
                        },
                  );
                },
              },
              {
                label: S.sheet.toEditorDownload,
                icon: <Download />,
                'data-testid': 'md-download',
                onSelect: () => {
                  downloadText(
                    editorMarkdown(deck, sc),
                    `${base}.md`,
                    'text/markdown;charset=utf-8',
                  );
                  toast({ title: S.sheet.savedMd, tone: 'success', replace: true });
                },
              },
            ]}
          />
          {editor ? (
            <a
              className={buttonClass('ghost', 'md')}
              href={hrefToTool(editor)}
              target="_blank"
              rel="noopener"
            >
              {S.sheet.editorLink}
            </a>
          ) : null}
        </div>
      </header>
      <div className="min-w-0 overflow-x-auto rounded-lg bg-surface-3 p-2 sm:p-4">
        <style>{DOC_CSS}</style>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 文件的 HTML 由 documentHtml 產生，使用者的字一律跳脫 */}
        <div data-testid="document" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button variant="ghost" onClick={() => setStep('plot')}>
          {S.back(S.steps.plot.label)}
        </Button>
        <span className="flex-1" />
        <Button icon={<Library />} onClick={() => patch({ view: 'library' })}>
          {S.sheet.toLibrary}
        </Button>
      </div>
    </div>
  );
}
