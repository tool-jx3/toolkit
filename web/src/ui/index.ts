/**
 * web/src/ui：設計 token 與共用元件。大多數工具都用的元件從這裡 import：
 *   import { ToolShell, Section, Field, Slider } from '@/ui';
 * 樣式入口：import '@/ui/styles.css'（每個工具的 main.tsx 一次）。
 *
 * 這個總入口連帶的每個元件都會打包進每頁都載入的共用 ui 區塊，所以只收大多數工具用的元件。
 * 只有少數工具用的元件不放這裡，從各自的入口 import（`@/ui/PostEditor`、`@/ui/imagefx`…；
 * DESIGN.md 4.0「分開的入口」，tests/unit/ui-entries.test.ts 檢查總入口沒有連帶載入它們）。
 */

export {
  AdvancedToggle,
  type AdvancedToggleProps,
  getAdvancedMode,
  setAdvancedMode,
  useAdvancedMode,
} from './AdvancedToggle';
export {
  ANCHORS,
  type Anchor,
  AnchorGrid,
  type AnchorGridProps,
  anchorAxes,
} from './AnchorGrid';
export {
  ANCHOR_LABELS,
  ANCHOR_VALUES,
  AnchorPicker,
  type AnchorPickerProps,
  type AnchorValue,
} from './AnchorPicker';
export {
  AudioDrop,
  type AudioDropProps,
  AudioPlayer,
  type AudioPlayerProps,
} from './AudioFile';
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonClass,
  IconButton,
  type IconButtonProps,
} from './Button';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { type ChipItem, Chips, type ChipsProps } from './Chips';
export {
  COLOR_PRESETS_MAX,
  ColorField,
  type ColorFieldProps,
  ColorPicker,
  type ColorPickerProps,
  canUseEyeDropper,
  DEFAULT_SWATCHES,
} from './ColorField';
export {
  ContextMenu,
  type ContextMenuItem,
  type ContextMenuProps,
  type ContextMenuState,
  contextMenuPoint,
} from './ContextMenu';
export { CopyDiagnostics, type CopyDiagnosticsProps } from './CopyDiagnostics';
export { cn } from './cn';
export {
  ChoiceDialog,
  type ChoiceDialogProps,
  type ChoiceOption,
  type ChoiceOptions,
  ChoiceProvider,
  ConfirmDialog,
  type ConfirmDialogProps,
  type ConfirmOptions,
  ConfirmProvider,
  Dialog,
  DialogClose,
  type DialogProps,
  useChoice,
  useConfirm,
} from './Dialog';
export { ErrorBoundary, type ErrorBoundaryProps } from './ErrorBoundary';
export {
  animationFormats,
  DEFAULT_FPS_OPTIONS,
  DEFAULT_SCALE_OPTIONS,
  type ExportBatchOutput,
  type ExportContext,
  type ExportFormatOption,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  type ExportPanelProps,
  type ExportSettings,
  useWebpSupport,
} from './ExportPanel';
export {
  Field,
  type FieldProps,
  FieldRow,
  type FieldRowProps,
  Show,
  useFieldControl,
} from './Field';
export {
  availableWeights,
  FontPicker,
  type FontPickerProps,
  isInheritFont,
  WEIGHT_LABELS,
} from './FontPicker';
export { GestureScope, type GestureScopeProps } from './GestureScope';
export { GroupTabs } from './GroupTabs';
export {
  type DroppedImage,
  FileDrop,
  type FileDropProps,
  ImageDrop,
  type ImageDropProps,
} from './ImageDrop';
export {
  type FrameTransform,
  fitTransform,
  frameIn,
  ImageFrameDialog,
  type ImageFrameDialogProps,
  renderFrame,
  turnAt,
  turnedSize,
  zoomAt,
} from './ImageFrameDialog';
export { InspirationFooter } from './InspirationFooter';
export {
  ISSUE_LEVEL_LABELS,
  type IssueItem,
  type IssueLevel,
  IssueList,
  type IssueListProps,
} from './IssueList';
export { Kbd } from './Kbd';
export {
  LOCAL_FONT_MESSAGES,
  LOCAL_FONT_SAMPLE,
  LocalFontDialog,
  type LocalFontDialogProps,
  supportsLocalFontList,
} from './LocalFontDialog';
export { MenuButton, type MenuButtonItem, type MenuButtonProps } from './MenuButton';
export { NativeNumberInput, type NativeNumberInputProps, spinStep } from './NativeNumberInput';
export { Notice, type NoticeProps, type NoticeTone } from './Notice';
export { NumberInput, type NumberInputProps } from './NumberInput';
export { ProgressBar, type ProgressBarProps } from './ProgressBar';
export {
  type ProjectLoadResult,
  ProjectMenu,
  ProjectMenuItem,
  type ProjectMenuProps,
  type ProjectNotice,
} from './ProjectMenu';
export { type PlaybackShortcutsOptions, playbackShortcuts } from './playbackShortcuts';
export {
  createPointerGesture,
  type GestureSample,
  type PointerGesture,
} from './pointerGesture';
export {
  type RevealInput,
  type RevealResult,
  type RevealSpan,
  revealDelta,
  revealInScroller,
} from './reveal';
export { Section, type SectionProps } from './Section';
export { Segmented, type SegmentedOption, type SegmentedProps } from './Segmented';
export { Select, type SelectGroup, type SelectOption, type SelectProps } from './Select';
export { IN_INPUT_BADGE, ShortcutHelp, type ShortcutHelpProps } from './ShortcutHelp';
export { Slider, type SliderProps } from './Slider';
export {
  LayerList,
  type LayerListItem,
  type LayerListProps,
  type SortableItemState,
  SortableList,
  type SortableListProps,
} from './SortableList';
export {
  ALL_STAGE_BACKGROUNDS,
  Stage,
  type StageAnyBackgroundKind,
  type StageBackground,
  type StageBackgroundKind,
  type StagePan,
  type StageProps,
  type StageView,
  type StageZoom,
  useStageScale,
  useStageView,
} from './Stage';
export {
  comboText,
  formatCombo,
  isEditableTarget,
  isFormControlTarget,
  isMac,
  matchCombo,
  SHORTCUTS_PASS,
  type Shortcut,
  useShortcuts,
  withShortcut,
} from './shortcuts';
export { STAGE_SCENE_SVG, stageSceneUrl } from './stageScene';
export { type TabItem, Tabs, type TabsProps } from './Tabs';
export {
  TemplateGallery,
  type TemplateGalleryProps,
  type TemplateItem,
  type TemplateSearch,
} from './TemplateGallery';
export { TextArea, type TextAreaProps, TextInput, type TextInputProps } from './TextInput';
export {
  selectAllInPlace,
  type TextOutputMessages,
  TextOutputPanel,
  type TextOutputPanelProps,
} from './TextOutputPanel';
export { ThemeToggle } from './ThemeToggle';
export {
  LoopThumb,
  type LoopThumbProps,
  ThumbChoice,
  type ThumbChoiceOption,
  type ThumbChoiceProps,
} from './ThumbChoice';
export {
  ThumbnailImage,
  type ThumbnailItem,
  ThumbnailList,
  type ThumbnailListProps,
  type ThumbnailSource,
} from './ThumbnailList';
export { type ToastOptions, ToastProvider, type ToastTone, useToast } from './Toast';
export { Toggle, type ToggleProps } from './Toggle';
export { ToolHeader, type ToolHeaderProps } from './ToolHeader';
export { type SettingsResize, ToolShell, type ToolShellProps } from './ToolShell';
export { Tooltip } from './Tooltip';
export {
  REWIND_LABEL,
  SEGMENT_COLORS,
  Transport,
  type TransportProps,
} from './Transport';
export { getTheme, setTheme, type Theme, useTheme } from './theme';
export { UiProvider } from './UiProvider';
export { UsageSection, type UsageSectionProps } from './UsageSection';
export { type AudioPlayback, useAudioPlayback } from './useAudioPlayback';
export { useConfirmedReset } from './useConfirmedReset';
export { COARSE_POINTER, useMediaQuery } from './useMediaQuery';
export { type Playback, type PlaybackOptions, usePlayback } from './usePlayback';
export { LONG_PRESS_SLOP, type SortableOptions, useSortable } from './useSortable';
export { useVirtualRows, type VirtualRows, type VirtualRowsOptions } from './useVirtualRows';
export { WindowDrop, type WindowDropProps } from './WindowDrop';
