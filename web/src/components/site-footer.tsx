import { LINKS } from "@/lib/constants";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-sm text-zinc-500">
          Built by{" "}
          <a
            href={LINKS.portfolio}
            className="text-zinc-300 transition hover:text-white"
            target="_blank"
            rel="noreferrer"
          >
            Parth Kadam
          </a>
        </p>
        <div className="flex items-center gap-5 text-sm text-zinc-500">
          <a
            href={LINKS.github}
            className="transition hover:text-zinc-200"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            href={LINKS.x}
            className="transition hover:text-zinc-200"
            target="_blank"
            rel="noreferrer"
          >
            X
          </a>
          <a
            href={LINKS.portfolio}
            className="transition hover:text-zinc-200"
            target="_blank"
            rel="noreferrer"
          >
            Portfolio
          </a>
        </div>
      </div>
    </footer>
  );
}
