/**
 * web/src/ui：設計 token 與共用元件。工具一律從這裡 import：
 *   import { ToolShell, Section, Field, Slider } from '@/ui';
 * 樣式入口：import '@/ui/styles.css'（每個工具的 main.tsx 一次）。
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
  ColorField,
  type ColorFieldProps,
  ColorPicker,
  type ColorPickerProps,
  canUseEyeDropper,
  DEFAULT_SWATCHES,
} from './ColorField';
export { type ColorPairItem, ColorPairList, type ColorPairListProps } from './ColorPairList';
export {
  type AspectOption,
  type CropConfirmConfig,
  CropConfirmSummary,
  type CropConfirmSummaryProps,
  CropDialog,
  type CropDialogProps,
  type CropRect,
  DEFAULT_ASPECTS,
} from './CropDialog';
export { CropFrame, type CropFrameProps, type CropFrameRect } from './CropFrame';
export {
  CssExportPanel,
  type CssExportPanelProps,
  type CssExportStatus,
  SourceUrlField,
  type SourceUrlFieldProps,
} from './CssExport';
export {
  CssPreviewFrame,
  type CssPreviewFrameHandle,
  type CssPreviewFrameProps,
  type PreviewBackground,
  type PreviewBackgroundKind,
  type PreviewSize,
  simulateHoverCss,
} from './CssPreviewFrame';
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
export { availableWeights, FontPicker, type FontPickerProps, WEIGHT_LABELS } from './FontPicker';
export { type FontPoolItem, FontPoolList, type FontPoolListProps } from './FontPoolList';
export { GestureScope, type GestureScopeProps } from './GestureScope';
export { GradientField, type GradientFieldProps } from './GradientField';
export { GroupTabs } from './GroupTabs';
export { HsvPanel, type HsvPanelProps, hsvToHex } from './HsvPanel';
export {
  type DroppedImage,
  FileDrop,
  type FileDropProps,
  ImageDrop,
  type ImageDropProps,
} from './ImageDrop';
export { ImageSampler, type ImageSamplerProps, type SamplePoint } from './ImageSampler';
export { InspirationFooter } from './InspirationFooter';
export {
  ISSUE_LEVEL_LABELS,
  type IssueItem,
  type IssueLevel,
  IssueList,
  type IssueListProps,
} from './IssueList';
export { ItemListEditor, type ItemListEditorProps } from './ItemListEditor';
export { Kbd } from './Kbd';
export {
  type LayoutChange,
  LayoutEditor,
  type LayoutEditorProps,
  type LayoutItem,
} from './LayoutEditor';
export {
  LOCAL_FONT_MESSAGES,
  LocalFontDialog,
  type LocalFontDialogProps,
  supportsLocalFontList,
} from './LocalFontDialog';
export {
  type ComposedMessage,
  type ComposerKind,
  type ComposerOption,
  MessageComposer,
  type MessageComposerProps,
  parseComposerText,
} from './MessageComposer';
export { NativeNumberInput, type NativeNumberInputProps, spinStep } from './NativeNumberInput';
export { Notice, type NoticeProps, type NoticeTone } from './Notice';
export { NumberInput, type NumberInputProps } from './NumberInput';
export { ObsGuide, type ObsGuideProps } from './ObsGuide';
export {
  type PanZoomView,
  PanZoomViewport,
  type PanZoomViewportHandle,
  type PanZoomViewportProps,
  type ViewportDrag,
  type ViewportPointer,
} from './PanZoomViewport';
export { type PartOption, PartPicker, type PartPickerProps } from './PartPicker';
export { PathPad, type PathPadLabel, type PathPadProps } from './PathPad';
export {
  ProjectMenu,
  ProjectMenuItem,
  type ProjectMenuProps,
  type ProjectNotice,
} from './ProjectMenu';
export { Section, type SectionProps } from './Section';
export { Segmented, type SegmentedOption, type SegmentedProps } from './Segmented';
export { Select, type SelectGroup, type SelectOption, type SelectProps } from './Select';
export {
  type CardItem,
  SelectableCardList,
  type SelectableCardListProps,
} from './SelectableCardList';
export { ShortcutHelp } from './ShortcutHelp';
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
  type StageBackground,
  type StageBackgroundKind,
  type StagePan,
  type StageProps,
  type StageView,
  type StageZoom,
  useStageScale,
  useStageView,
} from './Stage';
export { type StepItem, StepNav, type StepNavProps, Stepper, type StepperProps } from './Stepper';
export {
  formatCombo,
  isEditableTarget,
  isFormControlTarget,
  matchCombo,
  type Shortcut,
  useShortcuts,
} from './shortcuts';
export { type TabItem, Tabs, type TabsProps } from './Tabs';
export { TemplateGallery, type TemplateGalleryProps, type TemplateItem } from './TemplateGallery';
export {
  applyTestShortcut,
  TEST_SHORTCUTS,
  type TestShortcut,
  type TestShortcutOptions,
  TestValueRow,
  type TestValueRowProps,
  TestValueShortcuts,
  type TestValueShortcutsProps,
  testShortcutLabel,
} from './TestValueRow';
export { TextArea, type TextAreaProps, TextInput, type TextInputProps } from './TextInput';
export {
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
export { ToolShell, type ToolShellProps } from './ToolShell';
export { Tooltip } from './Tooltip';
export { SEGMENT_COLORS, Transport, type TransportProps } from './Transport';
export { getTheme, setTheme, type Theme, useTheme } from './theme';
export { UiProvider } from './UiProvider';
export { UsageSection, type UsageSectionProps } from './UsageSection';
export { useConfirmedReset } from './useConfirmedReset';
export { type Playback, type PlaybackOptions, usePlayback } from './usePlayback';
export { type SortableOptions, useSortable } from './useSortable';
export { WindowDrop, type WindowDropProps } from './WindowDrop';
