import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BackupContact, BackupContactInput, HandoffBoardItem } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Sheet } from "../../components/Sheet";
import { Select } from "../../components/Select";
import { TouchButton } from "../../components/TouchButton";
import { Toggle } from "../../components/Toggle";
import { useActiveActor } from "../household/ActorSwitcher";
import { cn } from "../../lib/cn";

const field =
  "w-full rounded-inner border border-line-strong bg-surface px-3 py-2.5 text-body text-ink " +
  "placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent-2/50";

const label = "text-meta font-medium text-ink-3";

interface Props {
  open: boolean;
  onClose: () => void;
  mode: "request-backup" | "contact";
  /** request-backup mode: the obligation to request backup for. */
  obligation?: HandoffBoardItem;
  /** contact mode: pass an existing contact to edit, omit to create one. */
  contact?: BackupContact;
}

/**
 * Bottom sheet with two modes: (a) request backup — pick a contact and leave a
 * note; (b) add/edit a backup contact. Both submit through the typed api
 * client and invalidate the handoff/contact caches on success.
 */
export function HandoffEditorSheet({ open, onClose, mode, obligation, contact }: Props) {
  const queryClient = useQueryClient();
  const { actor } = useActiveActor();
  const isAdult = actor?.role === "adult";

  const { data: contactsData } = useQuery({
    queryKey: ["backup-contacts"],
    queryFn: () => api.backupContacts.list(),
  });
  const contacts = (contactsData?.contacts ?? []).filter((c) => c.active);

  const [contactId, setContactId] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [priority, setPriority] = useState("1");
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (mode === "request-backup") {
      setContactId("");
      setNote("");
    } else {
      setName(contact?.name ?? "");
      setRelationship(contact?.relationship ?? "");
      setPhone(contact?.phone ?? "");
      setPriority(String(contact?.priority ?? 1));
      setActive(contact?.active ?? true);
      setNotes(contact?.notes ?? "");
    }
  }, [open, mode, contact]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["handoffs"] });
    queryClient.invalidateQueries({ queryKey: ["backup-contacts"] });
  };

  const requestBackup = useMutation({
    mutationFn: () =>
      api.handoffs.requestBackup(obligation!.id, {
        actorId: actor!.id,
        backupContactId: contactId || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const saveContact = useMutation({
    mutationFn: (input: BackupContactInput) =>
      contact ? api.backupContacts.update(contact.id, input) : api.backupContacts.create(input),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const canSaveContact = name.trim().length > 0 && relationship.trim().length > 0 && phone.trim().length > 0;

  const saveContactInput = (): BackupContactInput => ({
    name: name.trim(),
    relationship: relationship.trim(),
    phone: phone.trim(),
    priority: Number(priority) || 1,
    active,
    notes: notes.trim() || undefined,
  });

  if (mode === "request-backup") {
    return (
      <Sheet open={open} onClose={onClose} title="Request backup">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className={label}>Contact</span>
            <Select
              label="Backup contact"
              value={contactId}
              onChange={setContactId}
              options={[
                { value: "", label: "No specific contact" },
                ...contacts.map((c) => ({
                  value: c.id,
                  label: `${c.name} · ${c.relationship}`,
                })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={label}>Note</span>
            <textarea
              className={cn(field, "resize-none")}
              aria-label="Note"
              rows={3}
              placeholder="What do you need covered?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 border-t border-line pt-4">
            <TouchButton variant="ghost" onClick={onClose}>
              Cancel
            </TouchButton>
            <div className="flex-1" />
            <TouchButton
              variant="primary"
              disabled={!isAdult || !obligation || requestBackup.isPending}
              onClick={() => requestBackup.mutate()}
            >
              {requestBackup.isPending ? "Sending…" : "Request backup"}
            </TouchButton>
          </div>
          {!isAdult && <p className="text-body text-ink-3">Adults only</p>}
          {requestBackup.isError && (
            <p className="text-body text-danger">Couldn't request backup. Try again.</p>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={contact ? "Edit contact" : "Add contact"}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={label}>Name</span>
          <input
            className={field}
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grandma"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Relationship</span>
          <input
            className={field}
            aria-label="Relationship"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="Grandma"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={label}>Phone</span>
            <input
              className={field}
              aria-label="Phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="555-0100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>Priority</span>
            <input
              className={field}
              aria-label="Priority"
              type="number"
              min={1}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-inner border border-line bg-surface px-3 py-2">
          <span className="text-body text-ink-2">Active</span>
          <Toggle checked={active} onChange={setActive} label="Active" />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Notes</span>
          <textarea
            className={cn(field, "resize-none")}
            aria-label="Notes"
            rows={2}
            placeholder="Details…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 border-t border-line pt-4">
          <TouchButton variant="ghost" onClick={onClose}>
            Cancel
          </TouchButton>
          <div className="flex-1" />
          <TouchButton
            variant="primary"
            disabled={!isAdult || !canSaveContact || saveContact.isPending}
            onClick={() => saveContact.mutate(saveContactInput())}
          >
            {saveContact.isPending ? "Saving…" : contact ? "Save" : "Add"}
          </TouchButton>
        </div>
        {!isAdult && <p className="text-body text-ink-3">Adults only</p>}
        {saveContact.isError && (
          <p className="text-body text-danger">Couldn't save the contact. Try again.</p>
        )}
      </div>
    </Sheet>
  );
}
