// design-sync curated entry — re-exports ONLY the clean, bundlable presentational
// primitives from src/components/ui. Deliberately excludes the Tiptap/next-dynamic
// markdown & comment editors (won't bundle/render standalone outside Next).
// This is the bundle entry (cfg.entry); see .design-sync/NOTES.md.
export { BrandMark, Wordmark } from '@/components/ui/brand';
export {
  StatusChip,
  PriorityBars,
  ModuleTag,
  MilestoneTag,
  DuePill,
  Progress,
  EntityIcon,
} from '@/components/ui/bits';
export { CircleCheck, RefTag } from '@/components/ui/interactive';
export { Modal } from '@/components/ui/modal';
export { Popover, OptionList } from '@/components/ui/popover';
export { IconPicker } from '@/components/ui/icon-picker';
export { DynamicLucide } from '@/components/ui/dyn-icon';
