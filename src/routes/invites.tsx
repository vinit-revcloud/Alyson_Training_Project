import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Copy,
  Mail,
  Trash2,
  UserPlus,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  X,
  Search,
} from "lucide-react";
import {
  createInvite,
  inviteLink,
  listInvites,
  revokeInvite,
  revokeInvites,
  updateInviteRole,
  updateInvitesRole,
  touchInvite,
  INVITE_EXPIRY_DAYS,
  INVITE_ROLE_OPTIONS,
  inviteRoleLabel,
  type InviteRole,
  type InviteRow,
  getInviteStatus,
  inviteExpiresAt,
  type InviteStatus,
} from "@/lib/invites-api";
import { DEPARTMENTS } from "@/lib/assignments-api";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "@/lib/auth-constants";
import { useSession } from "@/lib/auth";
import { isAdmin } from "@/lib/role-access";
import { toast } from "sonner";

export const Route = createFileRoute("/invites")({
  head: () => ({ meta: [{ title: "Invites — Alyson" }] }),
  component: InvitesPage,
});

const NONE = "__none__";
const ALL = "__all__";

function InvitesPage() {
  const qc = useQueryClient();
  const { roles, loading: sessionLoading, bootstrapping } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("trainer");
  const [department, setDepartment] = useState<string>(NONE);

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>(ALL);
  const [filterStatus, setFilterStatus] = useState<string>(ALL);
  const [filterSent, setFilterSent] = useState<string>(ALL); // today/7d/30d/all

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: invites = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["invites"],
    queryFn: listInvites,
    enabled: isAdmin(roles),
  });

  useEffect(() => {
    if (sessionLoading || bootstrapping) return;
    if (!isAdmin(roles)) {
      navigate({ to: "/" });
    }
  }, [sessionLoading, bootstrapping, roles, navigate]);

  const create = useMutation({
    mutationFn: () =>
      createInvite({
        email,
        role,
        department: department === NONE ? null : department,
      }),
    onSuccess: ({ link, emailSent, emailProcessed }) => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      setEmail("");
      navigator.clipboard?.writeText(link).catch(() => {});
      if (emailProcessed && emailProcessed > 0) {
        toast.success("Invite sent", {
          description: "Sign-up link copied and invite email delivered via SES.",
        });
      } else if (emailSent) {
        toast.success("Invite created", {
          description: "Sign-up link copied. Email queued — run Process Queue if it does not arrive.",
        });
      } else {
        toast.success("Invite created", {
          description: "Sign-up link copied to clipboard. Share it with the invitee.",
        });
      }
    },
    onError: (e) =>
      toast.error("Failed to create invite", {
        description: e instanceof Error ? e.message : "Unknown error",
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      toast.success("Invite revoked");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to revoke"),
  });

  const removeMany = useMutation({
    mutationFn: (ids: string[]) => revokeInvites(ids),
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      setSelected(new Set());
      toast.success(`${ids.length} invite${ids.length === 1 ? "" : "s"} cancelled`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const changeRoleOne = useMutation({
    mutationFn: ({ id, role: r }: { id: string; role: InviteRole }) =>
      updateInviteRole(id, r),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      toast.success("Role updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const changeRoleMany = useMutation({
    mutationFn: ({ ids, role: r }: { ids: string[]; role: InviteRole }) =>
      updateInvitesRole(ids, r),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      toast.success(`Role changed for ${vars.ids.length} invite(s)`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resendOne = useMutation({
    mutationFn: (inv: InviteRow) => touchInvite(inv.id),
    onSuccess: ({ link }) => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      navigator.clipboard?.writeText(link).catch(() => {});
      toast.success("Invite resent", { description: "Fresh link copied to clipboard." });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resendMany = useMutation({
    mutationFn: async (rows: InviteRow[]) => {
      for (const row of rows) {
        await touchInvite(row.id);
      }
    },
    onSuccess: (_, rows) => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      toast.success(`Resent ${rows.length} invite(s)`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    const sentCutoff: Record<string, number> = {
      today: 86400_000,
      "7d": 7 * 86400_000,
      "30d": 30 * 86400_000,
    };
    const q = search.trim().toLowerCase();
    return invites.filter((i) => {
      if (q && !i.email.toLowerCase().includes(q)) return false;
      if (filterRole !== ALL && i.role !== filterRole) return false;
      if (filterStatus !== ALL && getInviteStatus(i) !== filterStatus) return false;
      if (filterSent !== ALL) {
        const cutoff = sentCutoff[filterSent];
        if (cutoff && now - new Date(i.created_at).getTime() > cutoff) return false;
      }
      return true;
    });
  }, [invites, search, filterRole, filterStatus, filterSent]);

  const stats = useMemo(() => {
    let pending = 0,
      accepted = 0,
      expired = 0;
    for (const i of invites) {
      const s = getInviteStatus(i);
      if (s === "Pending") pending++;
      else if (s === "Accepted") accepted++;
      else expired++;
    }
    return { total: invites.length, pending, accepted, expired };
  }, [invites]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const toggleAll = () => {
    if (allVisibleSelected) {
      const next = new Set(selected);
      filtered.forEach((i) => next.delete(i.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((i) => next.add(i.id));
      setSelected(next);
    }
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectedRows = useMemo(
    () => invites.filter((i) => selected.has(i.id)),
    [invites, selected]
  );
  const selectedPending = selectedRows.filter((i) => getInviteStatus(i) !== "Accepted");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      toast.error("Enter an email address");
      return;
    }
    if (!isAllowedEmail(normalized)) {
      toast.error(`Use an @${ALLOWED_EMAIL_DOMAIN} address`);
      return;
    }
    create.mutate();
  };

  if (sessionLoading || bootstrapping || !isAdmin(roles)) {
    return (
      <AdminLayout title="Invites" subtitle="Loading…">
        <div className="py-12 text-center text-muted-foreground">Loading…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Invites"
      subtitle="Invite @cintara.ai teammates and assign their workspace role"
    >
      <div className="space-y-4">
        {isError ? (
          <QueryLoadError message="Could not load invites" onRetry={() => void refetch()} />
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total" value={stats.total} />
          <SummaryCard label="Pending" value={stats.pending} tone="amber" />
          <SummaryCard label="Accepted" value={stats.accepted} tone="emerald" />
          <SummaryCard label="Expired" value={stats.expired} tone="muted" />
        </div>

        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Invite a new user</h2>
          </div>
          <form
            onSubmit={onSubmit}
            className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px_200px_auto]"
          >
            <Input
              type="email"
              placeholder="person@cintara.ai"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-lg border-border bg-background text-sm"
            />
            <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
              <SelectTrigger className="h-10 rounded-lg border-border bg-background text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITE_ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="h-10 rounded-lg border-border bg-background text-sm">
                <SelectValue placeholder="Department (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— No department —</SelectItem>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="submit"
              disabled={create.isPending}
              className="h-10 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
            >
              {create.isPending ? "Inviting…" : "Send invite"}
            </Button>
          </form>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Invites expire {INVITE_EXPIRY_DAYS} days after they're sent. The link is
            copied to your clipboard so you can share it externally.
          </p>
        </Card>

        <Card className="rounded-xl border-border bg-card shadow-soft">
          <div className="flex flex-col gap-3 border-b border-border p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">All invites</h2>
              <span className="text-[12px] text-muted-foreground">
                {filtered.length} of {invites.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 rounded-lg border-border bg-background pl-8 text-[13px]"
                />
              </div>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="h-9 rounded-lg border-border bg-background text-[13px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All roles</SelectItem>
                  {INVITE_ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 rounded-lg border-border bg-background text-[13px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Accepted">Accepted</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSent} onValueChange={setFilterSent}>
                <SelectTrigger className="h-9 rounded-lg border-border bg-background text-[13px]">
                  <SelectValue placeholder="Date sent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any time</SelectItem>
                  <SelectItem value="today">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-accent/40 px-3 py-2">
                <span className="text-[12px] font-medium text-foreground">
                  {selected.size} selected
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 rounded-md border-border text-[12px]"
                    disabled={selectedPending.length === 0 || resendMany.isPending}
                    onClick={() => resendMany.mutate(selectedPending)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Resend
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 rounded-md border-border text-[12px]"
                        disabled={selectedPending.length === 0}
                      >
                        Change role <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="text-[11px]">
                        Set role for {selectedPending.length} pending
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {INVITE_ROLE_OPTIONS.map((o) => (
                        <DropdownMenuItem
                          key={o.value}
                          onClick={() =>
                            changeRoleMany.mutate({
                              ids: selectedPending.map((i) => i.id),
                              role: o.value,
                            })
                          }
                        >
                          {o.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 rounded-md border-destructive/40 text-[12px] text-destructive hover:bg-destructive/10"
                    disabled={removeMany.isPending}
                    onClick={() => {
                      if (confirm(`Cancel ${selected.size} invite(s)?`))
                        removeMany.mutate(Array.from(selected));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                    onClick={() => setSelected(new Set())}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 px-4 py-3">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                      Loading invites…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                      <Mail className="mx-auto mb-2 h-6 w-6" />
                      {isError
                        ? "Invite list unavailable — use Retry above."
                        : invites.length === 0
                          ? "No invites yet. Send one above to get started."
                          : "No invites match the current filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => {
                    const status = getInviteStatus(inv);
                    const accepted = status === "Accepted";
                    const expired = status === "Expired";
                    const link = inviteLink(inv);
                    const exp = inviteExpiresAt(inv.created_at);
                    return (
                      <tr
                        key={inv.id}
                        className="border-b border-border last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selected.has(inv.id)}
                            onCheckedChange={() => toggleOne(inv.id)}
                            aria-label={`Select ${inv.email}`}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {inv.email}
                        </td>
                        <td className="px-4 py-3">
                          {accepted ? (
                            <Badge
                              variant="outline"
                              className="rounded-md border-primary/30 bg-accent text-[10.5px] capitalize text-primary"
                            >
                              {inv.role}
                            </Badge>
                          ) : (
                            <Select
                              value={inv.role}
                              onValueChange={(v) =>
                                changeRoleOne.mutate({
                                  id: inv.id,
                                  role: v as InviteRole,
                                })
                              }
                            >
                              <SelectTrigger className="h-7 w-[110px] rounded-md border-border bg-background text-[12px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {INVITE_ROLE_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {inv.department ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={status} />
                        </td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">
                          {accepted ? "—" : exp.toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {!accepted && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1.5 rounded-md border-border text-[12px]"
                                  onClick={() => {
                                    navigator.clipboard
                                      ?.writeText(link)
                                      .then(() => toast.success("Link copied"))
                                      .catch(() => toast.error("Copy failed"));
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" /> Copy link
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 rounded-md p-0 text-muted-foreground hover:text-primary"
                                  title={expired ? "Refresh & resend" : "Resend"}
                                  onClick={() => resendOne.mutate(inv)}
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 rounded-md p-0 text-muted-foreground hover:text-destructive"
                              title="Cancel invite"
                              onClick={() => {
                                if (confirm(`Revoke invite for ${inv.email}?`)) {
                                  remove.mutate(inv.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

function StatusPill({ status }: { status: InviteStatus }) {
  if (status === "Accepted") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" /> Accepted
      </span>
    );
  }
  if (status === "Expired") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5" /> Expired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-600">
      <Clock className="h-3.5 w-3.5" /> Pending
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "amber" | "emerald" | "muted";
}) {
  const color =
    tone === "amber"
      ? "text-amber-600"
      : tone === "emerald"
        ? "text-emerald-600"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <Card className="rounded-xl border-border bg-card p-4 shadow-soft">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-[24px] font-semibold ${color}`}>{value}</div>
    </Card>
  );
}
