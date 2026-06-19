import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, CircleHelp, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type InterviewGuideVariant = "hub" | "tests" | "session";

const STORAGE_KEY = "alyson:interview-guide-dismissed";

function isDismissed(variant: InterviewGuideVariant): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    return list.includes(variant);
  } catch {
    return false;
  }
}

function dismissVariant(variant: InterviewGuideVariant) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(variant)) list.push(variant);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function GuideSection({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white">
        {step}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <div className="mt-1 space-y-1 text-[12px] leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

function HubGuideBody() {
  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Use this area to screen <strong className="font-medium text-foreground">external job candidates</strong>.
        It is separate from employee training on Assignments — interview tests never get assigned to
        staff automatically.
      </p>
      <GuideSection step="1" title="Create an interview test (one-time setup)">
        <p>
          Go to{" "}
          <Link to="/interviews/assessments" className="font-medium text-violet-700 underline-offset-2 hover:underline">
            Interview tests
          </Link>{" "}
          and click <strong>Create interview test</strong>. Generate questions with AI, validate them,
          and save. You do <em>not</em> need to link a course unless you want class material to inform
          the questions.
        </p>
      </GuideSection>
      <GuideSection step="2" title="Schedule candidates">
        <p>
          For one candidate, click <strong>Schedule interview</strong>. Enter name, email, and the{" "}
          <strong>job title they are applying for</strong> (e.g. &quot;Marketing Analyst&quot;) — this
          appears in their invite email. Pick the interview test and delivery mode (online, paper, or
          hybrid).
        </p>
        <p>
          For many candidates at once, use <strong>Bulk upload</strong> — download the Excel template,
          fill one row per person, and import. You can set a default test and schedule dates in the
          dialog when rows leave those columns blank.
        </p>
      </GuideSection>
      <GuideSection step="3" title="On interview day — proctor the test">
        <ul className="list-inside list-disc space-y-1">
          <li>Send the candidate the magic link (email or copy from Manage).</li>
          <li>
            Candidate opens the link in <strong>incognito / another browser</strong> and waits in the
            waiting room.
          </li>
          <li>
            When you are on the video call and ready, click <strong>Open test</strong> on their row —
            they can then press <strong>Start test</strong>.
          </li>
          <li>Use <strong>Manage</strong> to watch status, resend the link, or add proctor notes.</li>
        </ul>
      </GuideSection>
      <GuideSection step="4" title="Review results">
        <p>
          After submission, AI evaluation runs automatically. Open <strong>Manage</strong> for scores
          and hire recommendation, or see all candidates on{" "}
          <Link to="/hiring/reports" className="font-medium text-violet-700 underline-offset-2 hover:underline">
            Hiring Reports
          </Link>
          .
        </p>
      </GuideSection>
      <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
        <strong>Status quick reference:</strong>{" "}
        <em>scheduled</em> = invite sent · <em>waiting</em> = candidate in waiting room ·{" "}
        <em>opened</em> = you unlocked the test · <em>in progress</em> = taking test ·{" "}
        <em>evaluated</em> = AI review ready
      </div>
    </div>
  );
}

function TestsGuideBody() {
  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Interview tests live in a dedicated pool. They appear here and when scheduling — not on the
        employee Assignments page.
      </p>
      <GuideSection step="1" title="Create a test">
        <p>
          Click <strong>Create interview test</strong>. Walk through Profile → Upload material (optional)
          → Generate → Review. Use <strong>Validate</strong> then <strong>Save assessment</strong>.
        </p>
      </GuideSection>
      <GuideSection step="2" title="Link to a course? (usually leave OFF)">
        <p>
          On the review step, <strong>Link to a course class</strong> is off by default. Turn it on
          only if you want AI questions grounded in specific course content. It does{" "}
          <em>not</em> assign the test to learners.
        </p>
      </GuideSection>
      <GuideSection step="3" title="Use when scheduling">
        <p>
          After saving, go to{" "}
          <Link to="/interviews" className="font-medium text-violet-700 underline-offset-2 hover:underline">
            Interviews
          </Link>{" "}
          → <strong>Schedule interview</strong> and pick your test from the dropdown. Use{" "}
          <strong>Preview</strong> to sanity-check questions first.
        </p>
      </GuideSection>
    </div>
  );
}

function SessionGuideBody() {
  return (
    <div className="space-y-3 text-[12px] leading-relaxed text-muted-foreground">
      <p>
        This page is your control room for <strong className="text-foreground">one candidate session</strong>.
      </p>
      <ul className="list-inside list-disc space-y-1.5">
        <li>
          <strong>Proctor actions</strong> — Resend invite, copy magic link, <strong>Open test</strong>{" "}
          (when candidate is waiting), cancel or delete session.
        </li>
        <li>
          <strong>Profile / Answers</strong> — AI evaluation, hire recommendation, and question-level
          review after submission.
        </li>
        <li>
          <strong>Paper test</strong> — For in-person paper mode: upload photos, then run AI grading.
        </li>
        <li>
          <strong>Events</strong> — Browser activity log (tab switches, etc.) for proctoring.
        </li>
      </ul>
      <p>
        If status is <em>waiting</em>, the candidate is ready — click <strong>Open test</strong> on
        this page or from the interviews list before they can start.
      </p>
    </div>
  );
}

const TITLES: Record<InterviewGuideVariant, string> = {
  hub: "How to run candidate interviews",
  tests: "How to create interview tests",
  session: "Managing this interview session",
};

export function InterviewGuide({
  variant,
  className,
}: {
  variant: InterviewGuideVariant;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => isDismissed(variant));

  if (hidden) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("gap-1.5 text-[12px]", className)}
        onClick={() => {
          setHidden(false);
          setOpen(true);
        }}
      >
        <CircleHelp className="h-3.5 w-3.5" />
        Show guide
      </Button>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <Card className="overflow-hidden rounded-xl border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white shadow-soft dark:from-violet-950/30 dark:to-background">
        <div className="flex items-start gap-2 border-b border-violet-100 px-4 py-3 dark:border-violet-900/40">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <CollapsibleTrigger className="min-w-0 flex-1 text-left">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-violet-950 dark:text-violet-100">
                {TITLES[variant]}
              </p>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-violet-600 transition-transform",
                  open && "rotate-180",
                )}
              />
            </div>
            <p className="mt-0.5 text-[11px] text-violet-800/80 dark:text-violet-300/80">
              Step-by-step instructions for HR and hiring managers
            </p>
          </CollapsibleTrigger>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            aria-label="Dismiss guide"
            onClick={() => {
              dismissVariant(variant);
              setHidden(true);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <CollapsibleContent>
          <div className="px-4 py-4">
            {variant === "hub" && <HubGuideBody />}
            {variant === "tests" && <TestsGuideBody />}
            {variant === "session" && <SessionGuideBody />}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
