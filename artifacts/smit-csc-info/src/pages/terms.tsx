import { useLanguage } from "@/lib/i18n";
import { useIsPrime } from "@/hooks/use-prime";
import { Crown, FileText } from "lucide-react";
import { TERMS_DOCS, type LegalSection } from "@/lib/legal-content";

export default function Terms() {
  const { language } = useLanguage();
  const isPrime = useIsPrime();
  const doc = TERMS_DOCS[language] ?? TERMS_DOCS.en;

  return (
    <div className={isPrime ? "bg-gradient-to-b from-purple-50/40 via-white to-amber-50/30" : ""}>
      {isPrime && (
        <section className="relative bg-gradient-to-br from-purple-950 via-purple-900 to-amber-900 px-4 py-14 overflow-hidden">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-amber-400/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />
          <div className="container mx-auto max-w-4xl relative z-10">
            <div className="inline-flex items-center gap-2 bg-amber-400/15 border border-amber-300/30 backdrop-blur-sm text-amber-200 px-3 py-1 rounded-full text-xs font-bold mb-4">
              <Crown className="h-3.5 w-3.5" /> PRIME MEMBER
            </div>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg">
                <FileText className="h-6 w-6 text-purple-950" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-black text-white" data-testid="terms-title">{doc.title}</h1>
                <p className="text-amber-100/80 text-sm mt-1">{doc.effectiveDate} · {doc.lastUpdated}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {!isPrime && (
          <>
            <h1 className="text-3xl font-bold text-primary mb-2" data-testid="terms-title">{doc.title}</h1>
            <p className="text-sm text-muted-foreground mb-1">{doc.effectiveDate}</p>
            <p className="text-sm text-muted-foreground mb-8">{doc.lastUpdated}</p>
          </>
        )}

        <div className={`${isPrime ? "bg-gradient-to-r from-purple-50 to-amber-50 border border-amber-200/60 text-purple-900" : "bg-blue-50 border border-blue-200 text-blue-800"} rounded-lg p-4 mb-8 text-sm`}>
          {renderIntroWithLink(doc.intro)}
        </div>

        <div className="space-y-10 text-sm leading-relaxed text-foreground">
          {doc.sections.map((s, i) => <SectionBlock key={i} section={s} />)}

          <section>
            <h2 className="text-xl font-bold mb-3 text-primary">{doc.contact.title}</h2>
            <p className="text-muted-foreground mb-2">{doc.contact.businessLine}</p>
            <p className="text-muted-foreground mb-1">
              <span className="font-semibold">{doc.contact.addressLabel}</span> {doc.contact.address}
            </p>
            <p className="text-muted-foreground mb-3">
              <span className="font-semibold">{doc.contact.emailLabel}</span>{" "}
              <a href={`mailto:${doc.contact.email}`} className="text-primary underline">
                {doc.contact.email}
              </a>
            </p>
            <p className="text-muted-foreground text-xs italic">{doc.contact.grievanceLine}</p>
          </section>

          <div className="border-t pt-6 text-center text-muted-foreground text-xs">
            {doc.footer}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: LegalSection }) {
  return (
    <section>
      <h2 className="text-xl font-bold mb-3 text-primary">{section.title}</h2>
      {section.body && <p className="text-muted-foreground mb-3">{section.body}</p>}
      {section.callout && (
        <div className={`rounded-lg p-3 mb-3 border ${
          section.callout.tone === "warn"
            ? "bg-red-50 border-red-200"
            : section.callout.tone === "success"
            ? "bg-green-50 border-green-200"
            : "bg-blue-50 border-blue-200"
        }`}>
          {section.callout.title && (
            <p className={`font-semibold text-xs uppercase tracking-wide ${
              section.callout.tone === "warn"
                ? "text-red-800"
                : section.callout.tone === "success"
                ? "text-green-800"
                : "text-blue-800"
            }`}>{section.callout.title}</p>
          )}
          <p className={`text-xs mt-1 ${
            section.callout.tone === "warn"
              ? "text-red-700"
              : section.callout.tone === "success"
              ? "text-green-700"
              : "text-blue-700"
          }`}>{section.callout.text}</p>
        </div>
      )}
      {section.items && (
        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
          {section.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      )}
      {section.subsections && (
        <div className="space-y-4 mt-2">
          {section.subsections.map((sub, i) => (
            <div key={i}>
              <h3 className="font-semibold mb-2">{sub.title}</h3>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                {sub.items.map((item, j) => <li key={j}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function renderIntroWithLink(intro: string) {
  const url = "https://smitcscinfo.com/";
  if (!intro.includes(url)) return intro;
  const [before, after] = intro.split(url);
  return (
    <>
      {before}
      <a href={url} className="underline" target="_blank" rel="noopener noreferrer">{url}</a>
      {after}
    </>
  );
}
