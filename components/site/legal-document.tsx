import { Scale } from 'lucide-react';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import type { CommunityPolicySection } from '@/lib/legal/community-policy';

export function LegalDocument({
  eyebrow,
  title,
  description,
  sections,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  sections: readonly CommunityPolicySection[];
  children?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-background/90">
        <div className="mx-auto max-w-[1440px]">
          <SiteHeader current="market" />
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="flex items-center gap-2 text-xs font-bold tracking-[.16em] text-primary">
          <Scale aria-hidden="true" className="size-4" /> {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-[-.04em] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
          {description}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          시행 예정일: Community 공개일
        </p>
        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
            >
              <h2
                id={`${section.id}-title`}
                className="text-xl font-bold tracking-tight"
              >
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.items && (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
          {children}
        </div>
      </article>
      <div className="mx-auto max-w-[1440px]">
        <SiteFooter />
      </div>
    </main>
  );
}
