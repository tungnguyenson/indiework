/**
 * Icon facade over lucide-react. The design spec is a 24-grid, ~1.7px rounded
 * stroke, currentColor set — Lucide matches it closely (per the handoff, an
 * approved substitute for the prototype's hand-drawn set). One place to keep
 * stroke width + names consistent with the design vocabulary.
 */
import {
  List,
  Columns3,
  Inbox,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Check,
  Flag,
  Calendar,
  Search,
  SlidersHorizontal,
  Copy,
  Trash2,
  MoreHorizontal,
  Settings,
  Sun,
  Moon,
  ArrowRight,
  ArrowUp,
  Target,
  Layers,
  Box,
  EyeOff,
  Lock,
  Sparkles,
  Globe,
  Link,
  Zap,
  GripVertical,
  Pin,
  Tag,
  Pencil,
  Table,
  KeyRound,
  Folder,
  Eye,
  ArrowLeft,
  ListFilter,
  ListTree,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Download,
  CornerDownRight,
  Baseline,
  Archive,
  ArchiveRestore,
  Maximize2,
  LogOut,
  CircleAlert,
  LoaderCircle,
  type LucideProps,
} from 'lucide-react';

type IconProps = Omit<LucideProps, 'ref'> & { size?: number };

const make =
  (Cmp: React.ComponentType<LucideProps>) =>
  ({ size = 18, strokeWidth = 1.7, ...rest }: IconProps) => (
    <Cmp size={size} strokeWidth={strokeWidth} absoluteStrokeWidth {...rest} />
  );

export const Ic = {
  list: make(List),
  board: make(Columns3),
  inbox: make(Inbox),
  plus: make(Plus),
  close: make(X),
  chevronDown: make(ChevronDown),
  chevronRight: make(ChevronRight),
  check: make(Check),
  flag: make(Flag),
  calendar: make(Calendar),
  search: make(Search),
  filter: make(SlidersHorizontal),
  sliders: make(SlidersHorizontal),
  filterFunnel: make(ListFilter),
  copy: make(Copy),
  trash: make(Trash2),
  dots: make(MoreHorizontal),
  eye: make(Eye),
  arrowLeft: make(ArrowLeft),
  settings: make(Settings),
  sun: make(Sun),
  moon: make(Moon),
  arrowRight: make(ArrowRight),
  arrowUp: make(ArrowUp),
  target: make(Target),
  layers: make(Layers),
  cube: make(Box),
  eyeOff: make(EyeOff),
  lock: make(Lock),
  sparkle: make(Sparkles),
  globe: make(Globe),
  link: make(Link),
  bolt: make(Zap),
  grip: make(GripVertical),
  pin: make(Pin),
  tag: make(Tag),
  edit: make(Pencil),
  table: make(Table),
  key: make(KeyRound),
  folder: make(Folder),
  listTree: make(ListTree),
  paperclip: make(Paperclip),
  fileText: make(FileText),
  image: make(ImageIcon),
  download: make(Download),
  cornerDownRight: make(CornerDownRight),
  type: make(Baseline),
  archive: make(Archive),
  restore: make(ArchiveRestore),
  maximize: make(Maximize2),
  logout: make(LogOut),
  alert: make(CircleAlert),
  loader: make(LoaderCircle),
};

export type IconName = keyof typeof Ic;

/** Resolve an icon by string key (e.g. a module's `icon`), with a fallback. */
export function iconByName(name: string | null | undefined, fallback: IconName = 'cube') {
  return (name && name in Ic ? Ic[name as IconName] : Ic[fallback]);
}

/**
 * A stored icon value is either an emoji glyph or a Lucide key — the two spaces
 * are disjoint, so we infer the kind from the value (no discriminator column).
 * Lucide names (facade keys + canonical kebab names) are lowercase ASCII words;
 * anything else (🚀, ◈, …) is an emoji/glyph to render verbatim.
 */
export function isEmojiValue(value: string | null | undefined): boolean {
  return !!value && !/^[a-z0-9-]+$/.test(value);
}
