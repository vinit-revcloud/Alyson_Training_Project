import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { fetchDatabaseStorageStatsFn } from "@/lib/database-storage.functions";

export function DatabaseStorageBanner() {
  const load = useServerFn(fetchDatabaseStorageStatsFn);
  const { data } = useQuery({
    queryKey: ["database-storage-stats"],
    queryFn: () => load(),
    staleTime: 300_000,
    refetchInterval: 600_000,
  });

  if (!data?.warn) return null;

  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-900 dark:text-amber-200">
      <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
      Neon database storage is at {data.usedPct}% ({data.usedMb} MB / {data.limitMb} MB free tier).
      Archive or delete unused data (old email logs, draft attempts, test profiles) before hitting the limit.{" "}
      <Link to="/settings" className="font-medium underline">
        Settings
      </Link>
    </div>
  );
}
