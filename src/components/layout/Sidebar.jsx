import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Users,
  BarChart3,
  Map,
  Settings,
} from 'lucide-react';

const navigation = [
  { name: 'דאשבורד', href: '/', icon: LayoutDashboard },
  { name: 'משלוחים', href: '/deliveries', icon: Package },
  { name: 'שליחים', href: '/couriers', icon: Users },
  { name: 'ניתוחים', href: '/analytics', icon: BarChart3 },
  { name: 'זונות מחיר', href: '/zones', icon: Map },
  { name: 'הגדרות', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white border-l border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">M.M.H</h1>
            <p className="text-xs text-gray-500">Delivery System</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            צריך עזרה?
          </h3>
          <p className="text-xs text-gray-600 mb-3">
            צור קשר עם התמיכה שלנו
          </p>
          <button className="w-full bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700 transition-colors">
            פנה לתמיכה
          </button>
        </div>
      </div>
    </aside>
  );
}
