import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Home" },
  { to: "/practice", label: "Practice" },
  { to: "/question-bank", label: "Bank" },
  { to: "/progress", label: "Progress" },
  { to: "/settings", label: "Settings" },
];

export function Nav({ isHidden }: { isHidden?: boolean }) {
  return (
    <nav className={`nav-shell top-0 z-20 ${isHidden ? "nav-shell-hidden" : ""}`}>
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="text-sm tracking-wide text-gray-400">ESAT practice</div>
        <div className="nav-group">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-link-active" : "nav-link-idle"}`
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
