/**
 * 帳號與畫面分頁（F01～F11）：大頭貼、帳號、名稱、認證徽章、動態外圈；狀態列、圖示、時間（用現在的時間）、電量、字級。
 */
import { Clock } from 'lucide-react';
import { useAssetBitmaps } from '@/core/assets';
import { Button, Field, FileDrop, Section, Slider, ThumbnailImage } from '@/ui';
import { Check, ImageButtons, ResetButton, TextField, useNotify } from '../controls';
import { addImageFiles } from '../media';
import { BATTERY_RANGE, defaultProfile, defaultScreen, FONT_SCALE_RANGE, LIMITS } from '../model';
import { thumbSource } from '../render/screens';
import { assets, edit, gesture, useDoc } from '../store';
import { S } from '../strings';

/** 現在的時間「時:分」（時不補零、分補零，同原作） */
export function clockNow(d = new Date()): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function CommonPanel() {
  const profile = useDoc((s) => s.data.profile);
  const screen = useDoc((s) => s.data.screen);
  const notify = useNotify();
  useAssetBitmaps(assets, profile.avatar?.kind === 'asset' ? [profile.avatar.id] : []);
  const src = thumbSource(profile.avatar);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sectionProfile} persistKey="social-post:account">
        <Field label={S.avatar}>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-3">
              <span
                className="size-14 shrink-0 overflow-hidden rounded-full bg-surface-3"
                data-testid="avatar-thumb"
              >
                {src ? <ThumbnailImage source={src} /> : null}
              </span>
              <ImageButtons
                target={{ kind: 'avatar' }}
                hasImage={!!profile.avatar}
                label={S.avatar}
                onRemove={() =>
                  edit((d) => {
                    d.profile.avatar = null;
                  })
                }
              />
            </div>
            <FileDrop
              aria-label={S.avatar}
              accept="image/*"
              paste="off"
              compact
              filterByAccept={false}
              label={S.avatar}
              buttonLabel={S.avatarPick}
              onFiles={(files) => void addImageFiles(files, { kind: 'avatar' }).then(notify)}
            />
          </div>
        </Field>
        <TextField
          label={S.username}
          value={profile.username}
          max={LIMITS.username}
          onChange={(v) =>
            edit((d) => {
              d.profile.username = v;
            })
          }
        />
        <TextField
          label={S.name}
          hint={S.nameHint}
          value={profile.name}
          max={LIMITS.name}
          onChange={(v) =>
            edit((d) => {
              d.profile.name = v;
            })
          }
        />
        <Check
          label={S.verified}
          checked={profile.verified}
          onChange={(v) =>
            edit((d) => {
              d.profile.verified = v;
            })
          }
        />
        <Check
          label={S.ring}
          checked={profile.ring}
          onChange={(v) =>
            edit((d) => {
              d.profile.ring = v;
            })
          }
        />
      </Section>
      <Section title={S.sectionScreen} persistKey="social-post:screen">
        <Check
          label={S.status}
          checked={screen.status}
          onChange={(v) =>
            edit((d) => {
              d.screen.status = v;
            })
          }
        />
        <Check
          label={S.statusIcons}
          checked={screen.icons}
          onChange={(v) =>
            edit((d) => {
              d.screen.icons = v;
            })
          }
        />
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              label={S.clock}
              value={screen.clock}
              max={LIMITS.clock}
              onChange={(v) =>
                edit((d) => {
                  d.screen.clock = v;
                })
              }
            />
          </div>
          <Button
            icon={<Clock />}
            onClick={() =>
              edit((d) => {
                d.screen.clock = clockNow();
              })
            }
          >
            {S.clockNow}
          </Button>
        </div>
        <Field label={S.battery}>
          <Slider
            value={screen.battery}
            min={BATTERY_RANGE[0]}
            max={BATTERY_RANGE[1]}
            unit="%"
            onChange={gesture.live((v: number) =>
              edit((d) => {
                d.screen.battery = Math.round(v);
              }),
            )}
            onCommit={gesture.commit}
          />
        </Field>
        <Field label={S.fontScale} hint={S.fontScaleHint}>
          <Slider
            value={Math.round(screen.fontScale * 100)}
            min={FONT_SCALE_RANGE[0] * 100}
            max={FONT_SCALE_RANGE[1] * 100}
            step={5}
            unit="%"
            onChange={gesture.live((v: number) =>
              edit((d) => {
                d.screen.fontScale = Math.round(v / 5) / 20;
              }),
            )}
            onCommit={gesture.commit}
          />
        </Field>
      </Section>
      <ResetButton
        label={S.resetCommon}
        confirmText={S.confirmResetCommon}
        onReset={() =>
          edit((d) => {
            d.profile = defaultProfile();
            d.screen = defaultScreen();
          })
        }
      />
    </div>
  );
}
