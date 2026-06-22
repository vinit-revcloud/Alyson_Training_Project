import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { PipelineBoard } from "@/components/hiring/PipelineBoard";
import { HiringWorkflowStrip } from "@/components/hiring/HiringWorkflowStrip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createPipelineFn, listPipelinesFn } from "@/lib/hiring-pipeline/hiring-pipeline.functions";
import { DEPARTMENTS, HIRING_ROLE_TO_DEPARTMENT } from "@/lib/departments";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/hiring/pipeline/")({
  head: () => ({ meta: [{ title: "Hiring Pipeline — Alyson" }] }),
  component: PipelineBoardPage,
});

const HIRING_ROLES = Object.keys(HIRING_ROLE_TO_DEPARTMENT);

function PipelineBoardPage() {
  const load = useServerFn(listPipelinesFn);
  const create = useServerFn(createPipelineFn);
  const qc = useQueryClient();

  const { data: pipelines = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["hiring-pipelines"],
    queryFn: () => load(),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(HIRING_ROLES[0] ?? "Data Scientist + AI Builder");

  const targetDepartment = HIRING_ROLE_TO_DEPARTMENT[role] ?? DEPARTMENTS[0];

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          candidateName: name,
          candidateEmail: email,
          targetRole: role,
          targetDepartment,
        },
      }),
    onSuccess: () => {
      toast.success("Candidate added — schedule Tech Round 1 (AI) next");
      setOpen(false);
      setName("");
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["hiring-pipelines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout
      title="Hiring Pipeline"
      subtitle="Track candidates from tech screens through onboarding"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add candidate
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add candidate to pipeline</DialogTitle>
              <DialogDescription>
                Starts at Tech Round 1. Use a{" "}
                <span className="font-medium text-foreground">@cintara.ai</span> email if they will
                need trial workspace access later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cand-name">Full name</Label>
                <Input
                  id="cand-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cand-email">Email</Label>
                <Input
                  id="cand-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane.smith@cintara.ai"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hiring role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HIRING_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Onboarding track: <span className="font-medium text-foreground">{targetDepartment}</span>
                  {" · "}includes AI Builder + Business Process for all roles
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => createMut.mutate()}
                disabled={!name.trim() || !email.trim() || createMut.isPending}
              >
                {createMut.isPending ? "Creating…" : "Start pipeline at Tech Round 1"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <HiringWorkflowStrip className="mb-5" />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading pipeline…</p>
      ) : isError ? (
        <QueryLoadError message="Could not load hiring pipeline" onRetry={() => void refetch()} />
      ) : (
        <PipelineBoard pipelines={pipelines} />
      )}
    </AdminLayout>
  );
}
