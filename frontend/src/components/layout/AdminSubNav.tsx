import { Link, useLocation } from 'react-router-dom';
import { Pizza, MessageCircle, Settings, BarChart3, Users, ScrollText, LayoutGrid, Megaphone, Image, Tag, Bot, Store } from 'lucide-react';

const items = [
  { to: '/admin', label: 'Orders', icon: Pizza, exact: true },
  { to: '/admin/catalog', label: 'Menu', icon: LayoutGrid },
  { to: '/admin/chats', label: 'Chats', icon: MessageCircle },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/team', label: 'Team', icon: Users },
  { to: '/admin/logs', label: 'Audit', icon: ScrollText },
  { to: '/admin/brand', label: 'Brand', icon: Megaphone },
  { to: '/admin/offers', label: 'Offers', icon: Tag },
  { to: '/admin/banners', label: 'Banners', icon: Image },
  { to: '/admin/bot-workflows', label: 'Bot', icon: Bot },
  { to: '/admin/business-config', label: 'Config', icon: Store },
];

interface AdminSubNavProps {
  activeOverride?: string;
}

export default function AdminSubNav({ activeOverride }: AdminSubNavProps) {
  const location = useLocation();

  return (
    <div className="flex gap-1 p-1 bg-stone-100 rounded-2xl w-fit text-sm flex-wrap">
      {items.map((item) => {
        const isActive = activeOverride
          ? activeOverride === item.to
          : item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
        const Icon = item.icon;

        if (isActive) {
          return (
            <span key={item.to} className="px-3 py-1.5 rounded-xl bg-zinc-900 text-white font-semibold text-xs inline-flex items-center gap-1.5">
              <Icon size={12} /> {item.label}
            </span>
          );
        }

        return (
          <Link
            key={item.to}
            to={item.to}
            className="px-3 py-1.5 rounded-xl hover:bg-white font-medium text-xs transition-colors inline-flex items-center gap-1.5 text-zinc-600"
          >
            <Icon size={12} /> {item.label}
          </Link>
        );
      })}
    </div>
  );
}
