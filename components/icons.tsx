import * as React from "react";
import {
  Archive as PhArchive,
  ArrowCounterClockwise as PhArrowCounterClockwise,
  ArrowDown as PhArrowDown,
  ArrowLeft as PhArrowLeft,
  ArrowRight as PhArrowRight,
  ArrowUp as PhArrowUp,
  ArrowsClockwise as PhArrowsClockwise,
  ArrowsLeftRight as PhArrowsLeftRight,
  Bed as PhBed,
  Broom as PhBroom,
  CalendarCheck as PhCalendarCheck,
  CalendarDots as PhCalendarDots,
  Camera as PhCamera,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUpDown as PhCaretUpDown,
  ChartBar as PhChartBar,
  ChartLineUp as PhChartLineUp,
  ChatCenteredText as PhChatCenteredText,
  Check as PhCheck,
  CheckCircle as PhCheckCircle,
  Checks as PhChecks,
  Circle as PhCircle,
  Clock as PhClock,
  ClockCounterClockwise as PhClockCounterClockwise,
  Columns as PhColumns,
  Copy as PhCopy,
  CornersOut as PhCornersOut,
  CreditCard as PhCreditCard,
  DoorOpen as PhDoorOpen,
  DotsThree as PhDotsThree,
  DownloadSimple as PhDownloadSimple,
  Drop as PhDrop,
  Eye as PhEye,
  FilePdf as PhFilePdf,
  FileText as PhFileText,
  Flask as PhFlask,
  FolderOpen as PhFolderOpen,
  Heartbeat as PhHeartbeat,
  Hospital as PhHospital,
  Hourglass as PhHourglass,
  IdentificationCard as PhIdentificationCard,
  ImageSquare as PhImageSquare,
  Info as PhInfo,
  List as PhList,
  LockKey as PhLockKey,
  ListChecks as PhListChecks,
  MagnifyingGlass as PhMagnifyingGlass,
  Microscope as PhMicroscope,
  Minus as PhMinus,
  NotePencil as PhNotePencil,
  PencilSimple as PhPencilSimple,
  Phone as PhPhone,
  Pill as PhPill,
  Plus as PhPlus,
  Prescription as PhPrescription,
  Printer as PhPrinter,
  Prohibit as PhProhibit,
  Pulse as PhPulse,
  Queue as PhQueue,
  Receipt as PhReceipt,
  ShieldCheck as PhShieldCheck,
  ShoppingBag as PhShoppingBag,
  SignOut as PhSignOut,
  Smiley as PhSmiley,
  SmileySad as PhSmileySad,
  SpinnerGap as PhSpinnerGap,
  SquaresFour as PhSquaresFour,
  Star as PhStar,
  Stethoscope as PhStethoscope,
  TestTube as PhTestTube,
  Timer as PhTimer,
  TrashSimple as PhTrashSimple,
  TrendUp as PhTrendUp,
  UploadSimple as PhUploadSimple,
  User as PhUser,
  TreeStructure as PhTreeStructure,
  UserCheck as PhUserCheck,
  UserGear as PhUserGear,
  UserPlus as PhUserPlus,
  UserSwitch as PhUserSwitch,
  Users as PhUsers,
  UsersThree as PhUsersThree,
  Wallet as PhWallet,
  Warning as PhWarning,
  WarningCircle as PhWarningCircle,
  WarningOctagon as PhWarningOctagon,
  Wrench as PhWrench,
  X as PhX,
} from "@phosphor-icons/react/ssr";
import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";

export type { IconProps, IconWeight };

export type IconComponent = Icon;

/**
 * Same wrapper as the Ralli Wolf icon set: every glyph is Phosphor, rendered
 * duotone by default so the family reads consistently across the app.
 */
function duotone(Base: Icon, displayName: string): IconComponent {
  const Wrapped = React.forwardRef<SVGSVGElement, IconProps>(
    ({ weight = "duotone", ...props }, ref) => (
      <Base ref={ref} weight={weight} {...props} />
    )
  );
  Wrapped.displayName = displayName;
  return Wrapped;
}

// Names shared with the Ralli Wolf icon module.
export const Activity = /*#__PURE__*/ duotone(PhPulse, "Activity");
export const AlertCircle = /*#__PURE__*/ duotone(
  PhWarningCircle,
  "AlertCircle"
);
export const AlertTriangle = /*#__PURE__*/ duotone(PhWarning, "AlertTriangle");
export const ArrowDownIcon = /*#__PURE__*/ duotone(
  PhArrowDown,
  "ArrowDownIcon"
);
export const ArrowLeft = /*#__PURE__*/ duotone(PhArrowLeft, "ArrowLeft");
export const ArrowRight = /*#__PURE__*/ duotone(PhArrowRight, "ArrowRight");
export const ArrowRightLeft = /*#__PURE__*/ duotone(
  PhArrowsLeftRight,
  "ArrowRightLeft"
);
export const ArrowUpIcon = /*#__PURE__*/ duotone(PhArrowUp, "ArrowUpIcon");
export const Ban = /*#__PURE__*/ duotone(PhProhibit, "Ban");
export const BarChart = /*#__PURE__*/ duotone(PhChartBar, "BarChart");
export const ChartNoAxesCombined = /*#__PURE__*/ duotone(
  PhChartLineUp,
  "ChartNoAxesCombined"
);
export const Check = /*#__PURE__*/ duotone(PhCheck, "Check");
export const CheckCheck = /*#__PURE__*/ duotone(PhChecks, "CheckCheck");
export const CheckCircle2 = /*#__PURE__*/ duotone(
  PhCheckCircle,
  "CheckCircle2"
);
export const CircleCheckIcon = /*#__PURE__*/ duotone(
  PhCheckCircle,
  "CircleCheckIcon"
);
export const ChevronDown = /*#__PURE__*/ duotone(PhCaretDown, "ChevronDown");
export const ChevronLeft = /*#__PURE__*/ duotone(PhCaretLeft, "ChevronLeft");
export const ChevronRight = /*#__PURE__*/ duotone(PhCaretRight, "ChevronRight");
export const ChevronsUpDown = /*#__PURE__*/ duotone(
  PhCaretUpDown,
  "ChevronsUpDown"
);
export const Circle = /*#__PURE__*/ duotone(PhCircle, "Circle");
export const Clock = /*#__PURE__*/ duotone(PhClock, "Clock");
export const Columns = /*#__PURE__*/ duotone(PhColumns, "Columns");
export const Copy = /*#__PURE__*/ duotone(PhCopy, "Copy");
export const CreditCard = /*#__PURE__*/ duotone(PhCreditCard, "CreditCard");
export const Download = /*#__PURE__*/ duotone(PhDownloadSimple, "Download");
export const Edit = /*#__PURE__*/ duotone(PhPencilSimple, "Edit");
export const Eye = /*#__PURE__*/ duotone(PhEye, "Eye");
export const FileText = /*#__PURE__*/ duotone(PhFileText, "FileText");
export const Info = /*#__PURE__*/ duotone(PhInfo, "Info");
export const InfoIcon = /*#__PURE__*/ duotone(PhInfo, "InfoIcon");
export const LayoutGrid = /*#__PURE__*/ duotone(PhSquaresFour, "LayoutGrid");
export const ListChecks = /*#__PURE__*/ duotone(PhListChecks, "ListChecks");
export const Loader2Icon = /*#__PURE__*/ duotone(PhSpinnerGap, "Loader2Icon");
export const Lock = /*#__PURE__*/ duotone(PhLockKey, "Lock");
export const LogOut = /*#__PURE__*/ duotone(PhSignOut, "LogOut");
export const Menu = /*#__PURE__*/ duotone(PhList, "Menu");
export const MoreHorizontal = /*#__PURE__*/ duotone(
  PhDotsThree,
  "MoreHorizontal"
);
export const Maximize2 = /*#__PURE__*/ duotone(PhCornersOut, "Maximize2");
export const Minus = /*#__PURE__*/ duotone(PhMinus, "Minus");
export const OctagonXIcon = /*#__PURE__*/ duotone(
  PhWarningOctagon,
  "OctagonXIcon"
);
export const Phone = /*#__PURE__*/ duotone(PhPhone, "Phone");
export const Plus = /*#__PURE__*/ duotone(PhPlus, "Plus");
export const ReceiptText = /*#__PURE__*/ duotone(PhReceipt, "ReceiptText");
export const RefreshCw = /*#__PURE__*/ duotone(PhArrowsClockwise, "RefreshCw");
export const Search = /*#__PURE__*/ duotone(PhMagnifyingGlass, "Search");
export const ShieldCheck = /*#__PURE__*/ duotone(PhShieldCheck, "ShieldCheck");
export const Star = /*#__PURE__*/ duotone(PhStar, "Star");
export const Trash2 = /*#__PURE__*/ duotone(PhTrashSimple, "Trash2");
export const TrendingUp = /*#__PURE__*/ duotone(PhTrendUp, "TrendingUp");
export const TriangleAlert = /*#__PURE__*/ duotone(PhWarning, "TriangleAlert");
export const TriangleAlertIcon = /*#__PURE__*/ duotone(
  PhWarning,
  "TriangleAlertIcon"
);
export const Upload = /*#__PURE__*/ duotone(PhUploadSimple, "Upload");
export const User = /*#__PURE__*/ duotone(PhUser, "User");
export const UserCheck = /*#__PURE__*/ duotone(PhUserCheck, "UserCheck");
export const Users = /*#__PURE__*/ duotone(PhUsers, "Users");
export const Wallet = /*#__PURE__*/ duotone(PhWallet, "Wallet");
export const X = /*#__PURE__*/ duotone(PhX, "X");

// Hospital-domain glyphs, same family and weight.
export const Archive = /*#__PURE__*/ duotone(PhArchive, "Archive");
export const BedIcon = /*#__PURE__*/ duotone(PhBed, "BedIcon");
export const Broom = /*#__PURE__*/ duotone(PhBroom, "Broom");
export const CalendarCheck = /*#__PURE__*/ duotone(
  PhCalendarCheck,
  "CalendarCheck"
);
export const CalendarDays = /*#__PURE__*/ duotone(
  PhCalendarDots,
  "CalendarDays"
);
export const Camera = /*#__PURE__*/ duotone(PhCamera, "Camera");
export const ChatText = /*#__PURE__*/ duotone(PhChatCenteredText, "ChatText");
export const DoorOpen = /*#__PURE__*/ duotone(PhDoorOpen, "DoorOpen");
export const Droplet = /*#__PURE__*/ duotone(PhDrop, "Droplet");
export const FilePdf = /*#__PURE__*/ duotone(PhFilePdf, "FilePdf");
export const Flask = /*#__PURE__*/ duotone(PhFlask, "Flask");
export const FolderOpen = /*#__PURE__*/ duotone(PhFolderOpen, "FolderOpen");
export const Heartbeat = /*#__PURE__*/ duotone(PhHeartbeat, "Heartbeat");
export const HospitalIcon = /*#__PURE__*/ duotone(PhHospital, "HospitalIcon");
export const Hourglass = /*#__PURE__*/ duotone(PhHourglass, "Hourglass");
export const IdCard = /*#__PURE__*/ duotone(PhIdentificationCard, "IdCard");
export const ImageSquare = /*#__PURE__*/ duotone(PhImageSquare, "ImageSquare");
export const Sitemap = /*#__PURE__*/ duotone(PhTreeStructure, "Sitemap");
export const ShoppingBag = /*#__PURE__*/ duotone(PhShoppingBag, "ShoppingBag");
export const UserGear = /*#__PURE__*/ duotone(PhUserGear, "UserGear");
export const Microscope = /*#__PURE__*/ duotone(PhMicroscope, "Microscope");
export const NotePencil = /*#__PURE__*/ duotone(PhNotePencil, "NotePencil");
export const Pill = /*#__PURE__*/ duotone(PhPill, "Pill");
export const PrescriptionIcon = /*#__PURE__*/ duotone(
  PhPrescription,
  "PrescriptionIcon"
);
export const Printer = /*#__PURE__*/ duotone(PhPrinter, "Printer");
export const QueueIcon = /*#__PURE__*/ duotone(PhQueue, "QueueIcon");
export const RotateCcw = /*#__PURE__*/ duotone(
  PhArrowCounterClockwise,
  "RotateCcw"
);
export const History = /*#__PURE__*/ duotone(
  PhClockCounterClockwise,
  "History"
);
export const Smiley = /*#__PURE__*/ duotone(PhSmiley, "Smiley");
export const SmileySad = /*#__PURE__*/ duotone(PhSmileySad, "SmileySad");
export const Stethoscope = /*#__PURE__*/ duotone(PhStethoscope, "Stethoscope");
export const TestTube = /*#__PURE__*/ duotone(PhTestTube, "TestTube");
export const Timer = /*#__PURE__*/ duotone(PhTimer, "Timer");
export const UserPlus = /*#__PURE__*/ duotone(PhUserPlus, "UserPlus");
export const UserSwitch = /*#__PURE__*/ duotone(PhUserSwitch, "UserSwitch");
export const UsersThree = /*#__PURE__*/ duotone(PhUsersThree, "UsersThree");
export const Wrench = /*#__PURE__*/ duotone(PhWrench, "Wrench");
