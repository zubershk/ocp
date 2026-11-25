import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowRight, faMessage, faCheckDouble, faTableCells, faChartSimple,
  faMobileScreen, faBell, faTerminal, faUsers, faShieldHalved, faBolt,
  faGauge, faGlobe, faUtensils, faMugHot, faCloud, faTruck, faCircleCheck,
  faCircleXmark, faChevronDown, faBars, faXmark, faClock, faBook,
  faChevronLeft, faChevronRight, faPlay, faPause, faArrowUp, faStar, faCopy,
} from '@fortawesome/free-solid-svg-icons';

type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function make(icon: IconDefinition) {
  return function FaIcon({ size, className }: IconProps) {
    return <FontAwesomeIcon icon={icon} className={className} style={size ? { fontSize: size } : undefined} aria-hidden="true" />;
  };
}

export const ArrowRight = make(faArrowRight);
export const MessageSquare = make(faMessage);
export const CheckCheck = make(faCheckDouble);
export const Layout = make(faTableCells);
export const BarChart3 = make(faChartSimple);
export const Smartphone = make(faMobileScreen);
export const Bell = make(faBell);
export const Terminal = make(faTerminal);
export const Users = make(faUsers);
export const ShieldCheck = make(faShieldHalved);
export const Zap = make(faBolt);
export const Gauge = make(faGauge);
export const Globe2 = make(faGlobe);
export const UtensilsCrossed = make(faUtensils);
export const Coffee = make(faMugHot);
export const Cloud = make(faCloud);
export const Truck = make(faTruck);
export const CheckCircle2 = make(faCircleCheck);
export const XCircle = make(faCircleXmark);
export const ChevronDown = make(faChevronDown);
export const Menu = make(faBars);
export const X = make(faXmark);
export const Clock = make(faClock);
export const BookOpen = make(faBook);
export const ChevronLeft = make(faChevronLeft);
export const ChevronRight = make(faChevronRight);
export const Play = make(faPlay);
export const Pause = make(faPause);
export const ArrowUp = make(faArrowUp);
export const Star = make(faStar);
export const Copy = make(faCopy);
