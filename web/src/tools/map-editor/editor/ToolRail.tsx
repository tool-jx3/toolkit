/**
 * 工具列（F023）：基本圖形／地圖／共通三組。寬畫面直排、窄畫面橫排（可以橫向捲動）。
 */
import {
  Armchair,
  BrickWall,
  Circle,
  Egg,
  Grid3x3,
  House,
  Image as ImageIcon,
  MousePointer2,
  PaintRoller,
  PenLine,
  Pentagon,
  Slash,
  Spline,
  Square,
  Type,
  Waypoints,
} from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { cn, IconButton, withShortcut } from '@/ui';
import { pickImage, selectTool } from '../actions';
import { type ToolName, useEditor } from '../stores';
import { S } from '../strings';

interface RailItem {
  tool: ToolName | 'image';
  icon: ReactNode;
  key?: string;
}

const GROUPS: { id: keyof typeof S.toolGroups; items: RailItem[] }[] = [
  {
    id: 'basic',
    items: [
      { tool: 'select', icon: <MousePointer2 />, key: 'v' },
      { tool: 'cell', icon: <Grid3x3 />, key: 'b' },
      { tool: 'rect', icon: <Square />, key: 'r' },
      { tool: 'ellipse', icon: <Circle />, key: 'e' },
      { tool: 'line', icon: <Slash />, key: 'l' },
      { tool: 'path', icon: <Waypoints />, key: 'p' },
      { tool: 'polygon', icon: <Pentagon />, key: 'g' },
      { tool: 'curve', icon: <Spline />, key: 'c' },
      { tool: 'curve-closed', icon: <Egg />, key: 'shift+c' },
    ],
  },
  {
    id: 'map',
    items: [
      { tool: 'ground', icon: <PaintRoller /> },
      { tool: 'wall', icon: <BrickWall /> },
      { tool: 'room', icon: <House /> },
      { tool: 'decor', icon: <Armchair /> },
    ],
  },
  {
    id: 'common',
    items: [
      { tool: 'freehand', icon: <PenLine />, key: 'd' },
      { tool: 'text', icon: <Type />, key: 't' },
      { tool: 'image', icon: <ImageIcon />, key: 'i' },
    ],
  },
];

export function ToolRail({ className }: { className?: string }) {
  const tool = useEditor((s) => s.tool);
  return (
    <nav
      aria-label={S.toolbar}
      className={cn(
        'flex min-w-0 flex-row items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-surface p-1 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto',
        className,
      )}
      data-testid="tool-rail"
    >
      {GROUPS.map((g, gi) => (
        <Fragment key={g.id}>
          {gi > 0 ? (
            <span
              aria-hidden
              className="mx-0.5 h-6 w-px shrink-0 bg-border lg:mx-0 lg:my-0.5 lg:h-px lg:w-6"
            />
          ) : null}
          <fieldset className="m-0 flex min-w-0 shrink-0 flex-row gap-0.5 border-0 p-0 lg:flex-col">
            <legend className="sr-only">{S.toolGroups[g.id]}</legend>
            {g.items.map((it) => {
              const name = S.tools[it.tool];
              const label = it.key ? withShortcut(name, it.key) : name;
              const active = it.tool === tool;
              return (
                <IconButton
                  key={it.tool}
                  icon={it.icon}
                  label={label}
                  variant="ghost"
                  pressed={it.tool === 'image' ? undefined : active}
                  onClick={() => (it.tool === 'image' ? void pickImage() : selectTool(it.tool))}
                  data-tool={it.tool}
                  className="shrink-0"
                />
              );
            })}
          </fieldset>
        </Fragment>
      ))}
    </nav>
  );
}
