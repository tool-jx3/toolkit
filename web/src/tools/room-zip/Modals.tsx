/** 依 session.modal 顯示對應的對話框（一次只開一個） */
import { EditDialog } from './dialogs/Edit';
import { FadeDialog } from './dialogs/Fade';
import { MakerDialog } from './dialogs/Maker';
import {
  BrokenDialog,
  BulkDialog,
  InfoDialog,
  MultiPickDialog,
  PartTemplatesDialog,
  PieceTemplateDialog,
  RenameDialog,
  SceneTemplatesDialog,
  SolidDialog,
  SourceDialog,
  TemplateDetailDialog,
} from './dialogs/Misc';
import { useSession } from './store';

export function Modals() {
  const m = useSession((s) => s.modal);
  if (!m) return null;
  switch (m.kind) {
    case 'solid':
      return <SolidDialog />;
    case 'fade':
      return <FadeDialog initial={m.state} />;
    case 'maker':
      return <MakerDialog context={m.context} background={m.background} />;
    case 'edit':
      return <EditDialog key={m.name} name={m.name} context={m.context} stayRoom={m.stayRoom} />;
    case 'multi':
      return <MultiPickDialog kind={m.for} />;
    case 'bulk':
      return <BulkDialog />;
    case 'sceneTemplates':
      return <SceneTemplatesDialog />;
    case 'broken':
      return <BrokenDialog />;
    case 'info':
      return <InfoDialog name={m.name} />;
    case 'rename':
      return <RenameDialog target="materials" />;
    case 'sceneRename':
      return <RenameDialog target="scenes" />;
    case 'partTemplates':
      return <PartTemplatesDialog />;
    case 'source':
      return <SourceDialog target={m.ref} />;
    case 'templateDetail':
      return <TemplateDetailDialog target={m.ref} />;
    case 'pieceTemplate':
      return <PieceTemplateDialog id={m.id} />;
    default:
      return null;
  }
}
