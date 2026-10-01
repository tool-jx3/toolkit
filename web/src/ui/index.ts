/**
 * web/src/ui：設計 token 與共用元件。工具一律從這裡 import：
 *   import { ToolShell, Section, Field, Slider } from '@/ui';
 * 樣式入口：import '@/ui/styles.css'（每個工具的 main.tsx 一次）。
 */
export {
  ANCHOR_LABELS,
  ANCHOR_VALUES,
  AnchorPicker,
  type AnchorPickerProps,
  type AnchorValue,
} from './AnchorPicker';
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonClass,
  IconButton,
  type IconButtonProps,
} from './Button';
export {
  ColorField,
  type ColorFieldProps,
  ColorPicker,
  type ColorPickerProps,
  canUseEyeDropper,
  DEFAULT_SWATCHES,
} from './ColorField';
export {
  type AspectOption,
  CropDialog,
  type CropDialogProps,
  type CropRect,
  DEFAULT_ASPECTS,
} from './CropDialog';
export { cn } from './cn';
export {
  ConfirmDialog,
  type ConfirmDialogProps,
  type ConfirmOptions,
  ConfirmProvider,
  Dialog,
  DialogClose,
  type DialogProps,
  useConfirm,
} from './Dialog';
export {
  animationFormats,
  DEFAULT_FPS_OPTIONS,
  DEFAULT_SCALE_OPTIONS,
  type ExportContext,
  type ExportFormatOption,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  type ExportPanelProps,
  type ExportSettings,
  useWebpSupport,
} from './ExportPanel';
export { Field, type FieldProps, FieldRow, type FieldRowProps, useFieldControl } from './Field';
export { availableWeights, FontPicker, type FontPickerProps, WEIGHT_LABELS } from './FontPicker';
export { GradientField, type GradientFieldProps } from './GradientField';
export { GroupTabs } from './GroupTabs';
export {
  type DroppedImage,
  FileDrop,
  type FileDropProps,
  ImageDrop,
  type ImageDropProps,
} from './ImageDrop';
export { InspirationFooter } from './InspirationFooter';
export { Kbd } from './Kbd';
export { Notice, type NoticeProps, type NoticeTone } from './Notice';
export { NumberInput, type NumberInputProps } from './NumberInput';
export { ProjectMenu, ProjectMenuItem, type ProjectMenuProps } from './ProjectMenu';
export { Section, type SectionProps } from './Section';
export { Segmented, type SegmentedOption, type SegmentedProps } from './Segmented';
export { Select, type SelectGroup, type SelectOption, type SelectProps } from './Select';
export { ShortcutHelp } from './ShortcutHelp';
export { Slider, type SliderProps } from './Slider';
export {
  ALL_STAGE_BACKGROUNDS,
  Stage,
  type StageBackground,
  type StageBackgroundKind,
  type StageProps,
  type StageZoom,
} from './Stage';
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
export { TextArea, type TextAreaProps, TextInput, type TextInputProps } from './TextInput';
export { ThemeToggle } from './ThemeToggle';
export { type ToastOptions, ToastProvider, type ToastTone, useToast } from './Toast';
export { Toggle, type ToggleProps } from './Toggle';
export { ToolHeader, type ToolHeaderProps } from './ToolHeader';
export { ToolShell, type ToolShellProps } from './ToolShell';
export { Tooltip } from './Tooltip';
export { SEGMENT_COLORS, Transport, type TransportProps } from './Transport';
export { getTheme, setTheme, type Theme, useTheme } from './theme';
export { UiProvider } from './UiProvider';
export { UsageSection, type UsageSectionProps } from './UsageSection';
export { type Playback, type PlaybackOptions, usePlayback } from './usePlayback';
