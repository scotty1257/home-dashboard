import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { HomeCommand } from "@home-dashboard/contracts";
import { api } from "../../lib/api";

/** Shared command hook for smart-home actions with optimistic invalidation. */
export function useHomeCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: HomeCommand) => api.homeCommand(command),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}
