import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCourseStudyCards, recordStudyActivity, type StudyCard } from "@/lib/learn-api";
import { useSession } from "@/lib/auth";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/learn/courses/$courseId/study")({
  component: StudyFlow,
});

function StudyFlow() {
  const { courseId } = Route.useParams();
  const { user } = useSession();
  const [index, setIndex] = useState(0);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["study-cards", courseId],
    queryFn: () => getCourseStudyCards(courseId),
  });

  const record = useMutation({
    mutationFn: (card: StudyCard) =>
      recordStudyActivity({
        userId: user!.id,
        courseId,
        classId: card.classId,
        sectionId: card.sectionId,
        cardKey: card.id,
      }),
  });

  const card = cards[index];
  const progress = cards.length ? Math.round(((index + 1) / cards.length) * 100) : 0;

  const advance = async () => {
    if (card && user) {
      try {
        await record.mutateAsync(card);
      } catch {
        toast.error("Could not save progress");
      }
    }
    if (index < cards.length - 1) setIndex((i) => i + 1);
    else toast.success("Course study complete!");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center text-sm text-muted-foreground">
        Loading cards…
      </div>
    );
  }

  if (!cards.length) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-muted-foreground">No study content published yet.</p>
        <Button asChild variant="link" className="mt-2">
          <Link to="/learn/courses">Back to courses</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/learn/courses">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Courses
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          Card {index + 1} of {cards.length} · {progress}%
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center p-4">
        <Card className="mx-auto w-full max-w-lg p-6 shadow-glow">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            {card.type === "quiz" ? "Quick quiz" : "Study card"}
          </p>
          <h2 className="mt-2 text-lg font-semibold">{card.title}</h2>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {card.body}
          </div>
          {card.type === "quiz" && card.questions?.length ? (
            <ul className="mt-4 space-y-3">
              {card.questions.map((q) => (
                <li key={q.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{q.prompt}</p>
                  {q.options?.length ? (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {q.options.map((o) => (
                        <li key={o}>• {o}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      <div className="sticky bottom-16 border-t border-border bg-card p-4">
        <Button className="w-full" size="lg" onClick={advance} disabled={record.isPending}>
          {index < cards.length - 1 ? (
            <>
              Next card
              <ChevronRight className="ml-1 h-4 w-4" />
            </>
          ) : (
            "Finish"
          )}
        </Button>
      </div>
    </div>
  );
}
