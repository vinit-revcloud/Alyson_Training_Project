import { createFileRoute, Link, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/learn/")({
  beforeLoad: () => {
    throw redirect({ to: "/learn/dashboard" });
  },
});
