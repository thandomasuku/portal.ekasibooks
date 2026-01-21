"use client";

type FooterLink = {
  label: string;
  href: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function PortalFooter({
  brandName = "eKasiBooks",
  year = new Date().getFullYear(),
  links,
  right,
  compact,
}: {
  brandName?: string;
  year?: number;
  links: FooterLink[];
  right?: React.ReactNode;
  compact?: boolean;
}) {
 return (
  <footer className={cx("mt-16", compact ? "pb-3" : "pb-0")}>
    {/* Full-width footer */}
    <div className="w-full bg-gradient-to-br from-[#0b2a3a] via-[#0e3a4f] to-[#215D63] text-white">
      <div className="mx-auto max-w-[1600px] px-6 py-10">
        {/* Top row */}
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          {/* Left */}
          <div className="max-w-md">
            <div className="text-base font-semibold text-white">
              {brandName} Portal
            </div>
            <p className="mt-2 text-sm text-white">
              Secure access for authentication, billing, and account management.
              Business operations are handled inside the application.
            </p>
          </div>

          {/* Center links */}
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-white underline-offset-4 hover:underline"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Right */}
          <div className="text-sm text-white">
  {right ? (
  <div className="text-white [&_*]:text-white">
    {right}
  </div>
) : (
  <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/50">
    <span className="h-2 w-2 rounded-full bg-emerald-400" />
    Secure portal
  </span>
)}

</div>

        </div>

        {/* Bottom row */}
        <div className="mt-10 border-t border-white/30 pt-4">
          <p className="text-center text-xs text-white">
            {brandName} © {year}. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  </footer>
);
}
