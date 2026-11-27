import type { EnvId } from '../../model/types';

export interface DrawOpts {
  /** 事件後的破損（門、窗） */
  broken: boolean;
  env: EnvId;
  /** 天花板的高度（設備的座標；接到天花板的設備用） */
  ceil: number | null;
  variant?: string;
}
