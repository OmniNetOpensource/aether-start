import { createElement, type SVGProps } from 'react';
import {
  AlertCircle as alertCircle,
  AlertTriangle as alertTriangle,
  ArrowUp as arrowUp,
  Ban as ban,
  Bot as bot,
  Braces as braces,
  Check as check,
  CheckCircle2 as checkCircle2,
  ChevronDown as chevronDown,
  ChevronLeft as chevronLeft,
  ChevronRight as chevronRight,
  Copy as copy,
  ExternalLink as externalLink,
  Eye as eye,
  FileText as fileText,
  Folder as folder,
  FolderOpen as folderOpen,
  Gift as gift,
  GitBranch as gitBranch,
  Globe as globe,
  Image as image,
  ImagePlus as imagePlus,
  Info as info,
  Link2 as link2,
  Loader2 as loader2,
  LogOut as logOut,
  MessageSquareText as messageSquareText,
  MoreHorizontal as moreHorizontal,
  Palette as palette,
  Paperclip as paperclip,
  Pencil as pencil,
  Pin as pin,
  PinOff as pinOff,
  Plus as plus,
  Quote as quote,
  RotateCcw as rotateCcw,
  Search as search,
  Settings as settings,
  Share2 as share2,
  Square as square,
  Trash2 as trash2,
  Wrench as wrench,
  X as x,
  XCircle as xCircle,
  type IconNode,
} from 'lucide';

export type LucideIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
};

function IconElement(props: { node: IconNode[number] }) {
  switch (props.node[0]) {
    case 'circle':
    case 'line':
    case 'path':
    case 'rect':
      return createElement(props.node[0], props.node[1]);
    default:
      throw new Error(`Unsupported Lucide SVG element: ${props.node[0]}`);
  }
}

const createLucideIcon = (iconNode: IconNode) =>
  function LucideIcon({
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className,
    ...props
  }: LucideIconProps) {
    const resolvedStrokeWidth =
      absoluteStrokeWidth && typeof strokeWidth === 'number' && typeof size === 'number'
        ? (strokeWidth * 24) / size
        : strokeWidth;

    return (
      <svg
        {...props}
        xmlns='http://www.w3.org/2000/svg'
        width={size}
        height={size}
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap='round'
        strokeLinejoin='round'
        className={className}
        aria-hidden='true'
      >
        {iconNode.map((node, index) => (
          <IconElement key={`${node[0]}-${index}`} node={node} />
        ))}
      </svg>
    );
  };

export const AlertCircle = createLucideIcon(alertCircle);
export const AlertCircleIcon = AlertCircle;
export const AlertTriangleIcon = createLucideIcon(alertTriangle);
export const ArrowUp = createLucideIcon(arrowUp);
export const Ban = createLucideIcon(ban);
export const Bot = createLucideIcon(bot);
export const Braces = createLucideIcon(braces);
export const Check = createLucideIcon(check);
export const CheckCircle2 = createLucideIcon(checkCircle2);
export const CheckCircle2Icon = CheckCircle2;
export const ChevronDown = createLucideIcon(chevronDown);
export const ChevronLeft = createLucideIcon(chevronLeft);
export const ChevronRight = createLucideIcon(chevronRight);
export const Copy = createLucideIcon(copy);
export const ExternalLink = createLucideIcon(externalLink);
export const Eye = createLucideIcon(eye);
export const FileText = createLucideIcon(fileText);
export const Folder = createLucideIcon(folder);
export const FolderOpen = createLucideIcon(folderOpen);
export const Gift = createLucideIcon(gift);
export const GitBranch = createLucideIcon(gitBranch);
export const Globe = createLucideIcon(globe);
export const Image = createLucideIcon(image);
export const ImagePlus = createLucideIcon(imagePlus);
export const InfoIcon = createLucideIcon(info);
export const Link2 = createLucideIcon(link2);
export const Loader2 = createLucideIcon(loader2);
export const LogOut = createLucideIcon(logOut);
export const MessageSquareText = createLucideIcon(messageSquareText);
export const MoreHorizontal = createLucideIcon(moreHorizontal);
export const Palette = createLucideIcon(palette);
export const Paperclip = createLucideIcon(paperclip);
export const Pencil = createLucideIcon(pencil);
export const Pin = createLucideIcon(pin);
export const PinOff = createLucideIcon(pinOff);
export const Plus = createLucideIcon(plus);
export const Quote = createLucideIcon(quote);
export const RotateCcw = createLucideIcon(rotateCcw);
export const Search = createLucideIcon(search);
export const Settings = createLucideIcon(settings);
export const Share2 = createLucideIcon(share2);
export const Square = createLucideIcon(square);
export const Trash2 = createLucideIcon(trash2);
export const Wrench = createLucideIcon(wrench);
export const X = createLucideIcon(x);
export const XIcon = X;
export const XCircle = createLucideIcon(xCircle);
