import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  ClipboardList,
  FileSpreadsheet,
  Layers,
  MapPinned,
  ShieldCheck,
} from 'lucide-react';

const features = [
  {
    icon: Boxes,
    title: 'Product and item tracking',
    text: 'Manage SKUs, physical stock IDs, asset tags, serial numbers, status, and condition in one place.',
  },
  {
    icon: ClipboardList,
    title: 'Controlled stock movement',
    text: 'Record purchases, deployments, repairs, transfers, lost items, found items, sold items, and adjustments.',
  },
  {
    icon: MapPinned,
    title: 'Location-aware inventory',
    text: 'Connect assets to departments, rooms, locations, and floor plan map positions for faster audits.',
  },
  {
    icon: ShieldCheck,
    title: 'Department access control',
    text: 'Keep superadmin, admin, and staff workflows separated by assigned department responsibilities.',
  },
];

const workflow = [
  'Add products and categories',
  'Create physical inventory items',
  'Assign departments and locations',
  'Track movement history',
  'Review reports and requests',
];

export default function Landing() {
  const isLoggedIn = !!localStorage.getItem('token');
  const primaryHref = isLoggedIn ? '/dashboard' : '/login';

  return (
    <main className="min-h-screen bg-[#f7fafc] text-slate-950">
      <section className="relative overflow-hidden bg-[#0f172a] text-white">
        <div className="absolute inset-0 opacity-20">
          <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,#38bdf8_0,transparent_34%),radial-gradient(circle_at_82%_26%,#22c55e_0,transparent_28%),linear-gradient(135deg,#0f172a_0%,#1e293b_48%,#111827_100%)]" />
        </div>

        <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <img src="/icons/logo-img-white.svg" alt="IMS" className="h-11 w-11" />
            <div>
              <p className="text-lg font-bold leading-tight">IMS</p>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-sky-200">Inventory</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-md px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              Login
            </Link>
            <Link
              to={primaryHref}
              className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-100"
            >
              {isLoggedIn ? 'Open App' : 'Get Started'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-5 pb-12 pt-8 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:pb-16 lg:pt-14">
          <div className="max-w-2xl">
            <p className="mb-4 inline-flex items-center rounded-md border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-sm font-semibold text-sky-100">
              Built for IT assets, supplies, and multi-department stock control
            </p>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              Inventory Management System
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-200">
              Track products, physical inventory items, departments, locations, floor plans, requests, and stock movement history from one secure workspace.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to={primaryHref}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-300"
              >
                {isLoggedIn ? 'Go to Dashboard' : 'Start Managing Inventory'}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center justify-center rounded-md border border-white/25 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Register with Invite
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-2xl backdrop-blur">
            <div className="rounded-md bg-slate-950 p-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Dashboard</p>
                  <p className="text-xs text-slate-400">SCADA Office</p>
                </div>
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Products', '128', 'Product types'],
                  ['Inventory Items', '642', 'Tagged units'],
                  ['Total Stock', '1,284', 'Quantity on hand'],
                  ['Inventory Value', 'PHP 482K', 'Current stock'],
                ].map(([label, value, caption]) => (
                  <div key={label} className="rounded-md border border-slate-800 bg-slate-900 p-4">
                    <p className="text-2xl font-bold text-white">{value}</p>
                    <p className="mt-1 text-sm font-medium text-sky-200">{label}</p>
                    <p className="text-xs text-slate-500">{caption}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <Layers className="h-4 w-4 text-emerald-300" />
                    Floor Plan Coverage
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 16 }).map((_, index) => (
                      <span
                        key={index}
                        className={`h-8 rounded ${index % 5 === 0 ? 'bg-emerald-400' : index % 3 === 0 ? 'bg-sky-400' : 'bg-slate-700'}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <FileSpreadsheet className="h-4 w-4 text-amber-300" />
                    Movement Queue
                  </div>
                  <div className="space-y-2">
                    {['Deployment approved', 'Transfer pending', 'Low stock alert'].map((item) => (
                      <div key={item} className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-sky-100 text-sky-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-sky-700">Daily workflow</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-950">From receiving to reporting, every movement stays traceable.</h2>
            <p className="mt-4 leading-7 text-slate-600">
              IMS keeps the operational flow simple: create the item, assign where it belongs, move it with a recorded reason, and review the history when audits or requests come in.
            </p>
          </div>

          <div className="grid gap-3">
            {workflow.map((item, index) => (
              <div key={item} className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-950 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <p className="font-semibold text-slate-800">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">Ready to organize your inventory?</h2>
          <p className="mt-2 text-slate-600">Login to continue managing assets, or register with an invite from your administrator.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to={primaryHref}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            {isLoggedIn ? 'Open Dashboard' : 'Login'}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-100"
          >
            Register
          </Link>
        </div>
      </section>
    </main>
  );
}
