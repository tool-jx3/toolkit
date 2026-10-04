/**
 * 3D：方向盤（DirectionPad）、3D 預覽區（Viewport3D）與 core/three 的檢視（轉動鏡頭、算繪迴圈、GLB）。
 * three.js 只在按下「載入 3D 示範」後才動態載入（展示頁的主檔不含 three.js）。
 */
import { Box, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '@/core/files';
import { Button, DirectionPad, Field, type PadVector, Section, Viewport3D } from '@/ui';
import type { ThreeDemo as Demo } from './threeScene';

export function ThreeDemo() {
  const [dir, setDir] = useState<PadVector>({ x: 0.5, y: 0.5 });
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [glb, setGlb] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const demo = useRef<Demo | null>(null);

  useEffect(() => {
    if (!on || !canvas.current) return;
    let alive = true;
    setBusy(true);
    void import('./threeScene').then(({ createThreeDemo }) => {
      if (!alive || !canvas.current) return;
      demo.current = createThreeDemo(canvas.current);
      setBusy(false);
    });
    return () => {
      alive = false;
      demo.current?.dispose();
      demo.current = null;
    };
  }, [on]);

  useEffect(() => {
    demo.current?.setLight(dir.x, dir.y);
  }, [dir]);

  return (
    <Section title="3D（DirectionPad、Viewport3D、core/three）">
      <div className="flex flex-wrap items-start gap-4">
        <Field label="光源方向" hint="拖曳或用方向鍵（Shift 一次 4 格），Home 回到預設。">
          <DirectionPad value={dir} onChange={setDir} defaultValue={{ x: 0.5, y: 0.5 }} />
        </Field>
        <p className="m-0 text-xs text-muted tabular-nums" data-testid="pad-value">
          x {dir.x.toFixed(2)}、y {dir.y.toFixed(2)}
        </p>
      </div>
      {on ? (
        <Viewport3D
          canvasRef={canvas}
          aspect={4 / 3}
          background="#1f2937"
          busy={busy ? '載入 three.js…' : null}
          canvasLabel="3D 示範：拖曳轉動、滾輪縮放"
          maxViewportHeight="360px"
          toolbar={
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw />}
                onClick={() => demo.current?.view.orbit(Math.PI / 6, 0)}
              >
                轉 30°
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Box />}
                onClick={async () => setGlb(formatBytes((await demo.current?.glbBytes()) ?? 0))}
              >
                試算 GLB 大小
              </Button>
            </>
          }
          footer={
            <span className="text-xs text-muted">
              {glb ? `GLB：${glb}` : '畫布一律透明，底色鋪在後面。'}
            </span>
          }
        />
      ) : (
        <Button onClick={() => setOn(true)} className="self-start">
          載入 3D 示範
        </Button>
      )}
    </Section>
  );
}
