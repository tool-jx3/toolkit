/**
 * 地圖編輯器：網址沒有 `?id=` 時是地圖一覽，有的時候是那張地圖的編輯畫面（規格 F012）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Shortcut, ToolShell } from '@/ui';
import {
  act,
  deleteKey,
  escapeKey,
  finishKey,
  nudgeKey,
  pickImage,
  redo,
  rotateKey,
  saveNow,
  selectTool,
  undo,
} from './actions';
import { Editor } from './Editor';
import { MapList } from './MapList';
import { TOOL_ID } from './model';
import { S } from './strings';
import { Usage } from './Usage';

type Route = { kind: 'list' } | { kind: 'editor'; id: string };

function readRoute(): Route {
  const id = new URLSearchParams(window.location.search).get('id');
  return id ? { kind: 'editor', id } : { kind: 'list' };
}

function buildShortcuts(): Shortcut[] {
  const T = S.keys.groups.tools;
  const E = S.keys.groups.edit;
  const V = S.keys.groups.view;
  const tool = (keys: string, name: ToolKey): Shortcut => ({
    keys,
    label: S.tools[name],
    group: T,
    handler: () => selectTool(name),
  });
  return [
    tool('v', 'select'),
    tool('b', 'cell'),
    {
      keys: 'r',
      label: `${S.tools.rect}／${S.keys.rotate}`,
      group: T,
      handler: () => rotateKey(false),
    },
    { keys: 'shift+r', label: S.keys.rotateBack, group: E, handler: () => rotateKey(true) },
    tool('e', 'ellipse'),
    tool('l', 'line'),
    tool('p', 'path'),
    tool('g', 'polygon'),
    tool('c', 'curve'),
    tool('shift+c', 'curve-closed'),
    tool('d', 'freehand'),
    tool('t', 'text'),
    { keys: 'i', label: S.tools.image, group: T, handler: () => void pickImage() },
    { keys: 'mod+z', label: S.keys.undo, group: E, handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.keys.redo, group: E, handler: redo },
    { keys: 'mod+s', label: S.keys.save, group: E, handler: saveNow, allowInInput: true },
    { keys: 'mod+g', label: S.keys.group, group: E, handler: act.group },
    { keys: 'shift+mod+g', label: S.keys.ungroup, group: E, handler: act.ungroup },
    { keys: ['delete', 'backspace'], label: S.keys.delete, group: E, handler: deleteKey },
    { keys: 'enter', label: S.keys.finish, group: E, handler: finishKey },
    { keys: 'escape', label: S.keys.cancel, group: E, handler: escapeKey },
    { keys: 'arrowleft', label: S.keys.nudge, group: E, handler: () => nudgeKey(-1, 0, false) },
    { keys: 'arrowright', label: S.keys.nudge, group: E, handler: () => nudgeKey(1, 0, false) },
    { keys: 'arrowup', label: S.keys.nudge, group: E, handler: () => nudgeKey(0, -1, false) },
    { keys: 'arrowdown', label: S.keys.nudge, group: E, handler: () => nudgeKey(0, 1, false) },
    {
      keys: 'shift+arrowleft',
      label: S.keys.nudgeBig,
      group: E,
      handler: () => nudgeKey(-1, 0, true),
    },
    {
      keys: 'shift+arrowright',
      label: S.keys.nudgeBig,
      group: E,
      handler: () => nudgeKey(1, 0, true),
    },
    {
      keys: 'shift+arrowup',
      label: S.keys.nudgeBig,
      group: E,
      handler: () => nudgeKey(0, -1, true),
    },
    {
      keys: 'shift+arrowdown',
      label: S.keys.nudgeBig,
      group: E,
      handler: () => nudgeKey(0, 1, true),
    },
    { keys: 'mod+b', label: S.keys.bold, group: S.keys.groups.text, allowInInput: true },
    { keys: 'mod+i', label: S.keys.italic, group: S.keys.groups.text, allowInInput: true },
    { keys: 'mod+u', label: S.keys.underline, group: S.keys.groups.text, allowInInput: true },
    { keys: 'space', label: S.keys.pan, group: V },
    { keys: 'shift', label: S.keys.shift, group: V },
  ];
}

type ToolKey = keyof typeof S.tools & import('./stores').ToolName;

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = useCallback((id: string) => {
    window.history.pushState(null, '', `?id=${encodeURIComponent(id)}`);
    setRoute({ kind: 'editor', id });
  }, []);

  const back = useCallback((message?: string, replace = false) => {
    const url = window.location.pathname;
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    if (message) setFlash(message);
    setRoute({ kind: 'list' });
  }, []);

  const shortcuts = useMemo(buildShortcuts, []);
  const clearFlash = useCallback(() => setFlash(null), []);

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={route.kind === 'editor' ? shortcuts : []}
      body={
        route.kind === 'list' ? (
          <MapList onOpen={open} flash={flash} onFlashShown={clearFlash} />
        ) : (
          <Editor
            key={route.id}
            id={route.id}
            onBack={() => back()}
            onMissing={() => back(S.list.notFound, true)}
          />
        )
      }
    />
  );
}
