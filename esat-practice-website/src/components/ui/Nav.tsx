import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Home" },
  { to: "/practice", label: "Practice" },
  { to: "/question-bank", label: "Bank" },
  { to: "/progress", label: "Progress" },
  { to: "/settings", label: "Settings" },
];

export function Nav() {
  return (
    <nav className="border-b border-gray-100 bg-white sticky top-0 z-20">
      <div className="max-w-4xl mx-auto px-4 py-2 flex items-center">
        <div className="flex gap-1.5 p-1.5 bg-gray-50 border border-gray-100 rounded-full">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-full text-sm transition-colors ${
                isActive
                  ? "bg-indigo-600 text-white font-medium"
                  : "text-gray-400 hover:text-gray-700"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
        </div>
      </div>
    </nav>
  );
}
