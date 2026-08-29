import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

/** Shared playback state + controls for the compact and full-screen players. */
export function usePlayer() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["media"], queryFn: api.media, refetchInterval: 10_000 });
  const command = useMutation({
    mutationFn: api.mediaCommand,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });
  return { state: data, command };
}
