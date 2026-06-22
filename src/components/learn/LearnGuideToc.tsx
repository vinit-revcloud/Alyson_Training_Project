import { cn } from "@/lib/utils";

export type GuideHeading = { id: string; text: string; level: number };

export function LearnGuideToc({ headings }: { headings: GuideHeading[] }) {
  if (!headings.length) return null;

  return (
    <aside className="learn-toc hidden w-[var(--learn-toc-width)] shrink-0 border-l border-[var(--learn-border)] bg-[var(--learn-card)] p-4 xl:block">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        On this page
      </p>
      <ul className="mt-3 space-y-1.5 text-xs">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn(
                "text-muted-foreground hover:text-[var(--learn-accent)]",
                h.level === 2 && "pl-2",
                h.level === 3 && "pl-4",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
