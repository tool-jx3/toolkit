/** 復原／重做（磁鐵跑著時先停下來，免得模擬接著改已經復原的內容） */
import { useProject } from '../state/store';
import { stopSim, withoutReheat } from './sim';

export function undo(): void {
  stopSim();
  withoutReheat(() => useProject.temporal.getState().undo());
}

export function redo(): void {
  stopSim();
  withoutReheat(() => useProject.temporal.getState().redo());
}
