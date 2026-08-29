import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PermissionCategory, PermissionRequestInput } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Sheet } from "../../components/Sheet";
import { TouchButton } from "../../components/TouchButton";
import { useActiveActor } from "../household/ActorSwitcher";
import { CATEGORY_LABEL } from "./PermissionQueue";

const field =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink " +
  "placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent-2/50";

const label = "text-xs font-semibold uppercase tracking-wide text-ink-3";

/** Literal list (a derived one would touch the circularly-imported label map at module scope). */
const CATEGORIES: PermissionCategory[] = [
  "sleepover",
  "screen-time",
  "ride",
  "purchase",
  "outing",
  "school",
  "other",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet for filing a new permission request. Anyone can ask — a child
 * creating their own request is the normal flow — and the submit is attributed
 * to the active actor (createdBy). Validation errors from the API surface
 * inline instead of failing silently.
 */
export function PermissionRequestSheet({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const { members, actor } = useActiveActor();
  const children = members.filter((m) => m.role === "child" && m.active);

  const [category, setCategory] = useState<PermissionCategory>("other");
  const [childId, setChildId] = useState("");
  const [question, setQuestion] = useState("");
  const [occursAt, setOccursAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    if (!open) return;
    setCategory("other");
    setChildId("");
    setQuestion("");
    setOccursAt("");
    setExpiresAt("");
  }, [open]);

  // Default the child select once the household resolves (sheet may open first).
  useEffect(() => {
    if (open && childId === "" && children.length > 0) setChildId(children[0]!.id);
  }, [open, childId, children]);

  const create = useMutation({
    mutationFn: (input: PermissionRequestInput) => api.permissions.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
      onClose();
    },
  });

  const canSubmit =
    actor !== null && childId !== "" && question.trim().length > 0 && !create.isPending;

  const submit = () => {
    if (!canSubmit || actor === null) return;
    create.mutate({
      childId,
      category,
      question: question.trim(),
      occursAt: occursAt ? new Date(occursAt).toISOString() : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      createdBy: actor.id,
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title="New permission request">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={label}>Child</span>
          <select
            className={field}
            aria-label="Child"
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
          >
            {children.length === 0 && <option value="">No children in household</option>}
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Category</span>
          <select
            className={field}
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as PermissionCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Question</span>
          <textarea
            className={cn(field, "resize-none")}
            aria-label="Question"
            rows={2}
            placeholder="Can I sleep over at Maya's on Friday?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={label}>Happens at (optional)</span>
            <input
              className={field}
              aria-label="Happens at"
              type="datetime-local"
              value={occursAt}
              onChange={(e) => setOccursAt(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>Answer expires (optional)</span>
            <input
              className={field}
              aria-label="Answer expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-line pt-4">
          <TouchButton variant="ghost" onClick={onClose}>
            Cancel
          </TouchButton>
          <div className="flex-1" />
          <TouchButton variant="primary" disabled={!canSubmit} onClick={submit}>
            {create.isPending ? "Submitting…" : "Submit"}
          </TouchButton>
        </div>
        {create.isError && (
          <p className="text-sm text-danger" role="alert">
            {create.error instanceof Error && create.error.message
              ? `Couldn't submit the request — ${create.error.message}`
              : "Couldn't submit the request. Try again."}
          </p>
        )}
      </div>
    </Sheet>
  );
}
