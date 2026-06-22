import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/hiring/pipeline")({
  component: () => <Outlet />,
});
