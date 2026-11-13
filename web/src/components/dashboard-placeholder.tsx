type Props = {
  title: string;
  description?: string;
};

/** Temporary route shell until the tab is built out. */
export function DashboardPlaceholder({ title, description }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1.5 max-w-xl text-pretty text-[14px] text-mute sm:text-[15px]">
          {description ?? "Coming soon — placeholder while we plan this tab."}
        </p>
      </div>
      <div className="rounded-2xl border border-dashed border-line bg-white/70 px-5 py-16 text-center text-[13px] text-mute">
        Content for {title} will land here.
      </div>
    </div>
  );
}
