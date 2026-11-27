"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";

export type ScheduledMeetingInput = {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  meeting_type: "Internal" | "External" | "Team";
  location: string;
  attendees: string;
  notes: string;
};

const MEETING_TYPES: ScheduledMeetingInput["meeting_type"][] = ["Internal", "External", "Team"];

/**
 * Schedules a meeting in the Meetings module. It is saved as a local meeting record with
 * status "scheduled" and no summary yet; Notetaker picks it up later (part 2).
 */
export function ScheduleMeetingModal({ onClose, onScheduled }: { onClose: () => void; onScheduled: () => void }) {
  const [form, setForm] = useState<ScheduledMeetingInput>({
    title: "",
    date: new Date().toISOString().slice(0, 10),
    start_time: "09:00",
    end_time: "10:00",
    meeting_type: "Internal",
    location: "",
    attendees: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof ScheduledMeetingInput>(key: K, value: ScheduledMeetingInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const canSave = form.title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(form.date) && form.start_time.length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || saving) return;
    if (form.end_time && form.end_time <= form.start_time) {
      setError("The end time must be after the start time.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting: {
            title: form.title.trim(),
            date: form.date,
            start_time: form.start_time,
            end_time: form.end_time,
            meeting_type: form.meeting_type,
            location: form.location.trim(),
            attendees_prime: [],
            attendees_external: form.attendees.split(",").map((name) => name.trim()).filter(Boolean),
            notes: form.notes.trim(),
            status: "scheduled",
            summary: "",
            items: [],
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.error) throw new Error(body.error || "The meeting could not be scheduled.");
      onScheduled();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The meeting could not be scheduled.");
    } finally {
      setSaving(false);
    }
  };

  const field = "mt-1 w-full border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-[#1b1d1e] outline-none focus:border-[#C9AB4C]";

  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="schedule-meeting-title" onSubmit={submit}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}
      className="w-full max-w-md border border-gray-200 bg-[#FFFCFB] p-5 shadow-xl">
      <div className="flex items-start justify-between">
        <h2 id="schedule-meeting-title" className="font-serif text-lg font-bold italic text-[#003366]">Schedule a meeting</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-500 hover:text-gray-800"><X size={16} /></button>
      </div>
      <p className="mt-1 text-xs text-gray-500">Set the meeting here. Pick it in Notetaker when you record.</p>

      <div className="mt-4 grid gap-3">
        <label className="block text-[11px] font-semibold text-gray-600">Meeting title <span className="text-red-600">*</span>
          <input className={field} value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="e.g. Network upgrade review" autoFocus />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-[11px] font-semibold text-gray-600">Date <span className="text-red-600">*</span>
            <input type="date" className={field} value={form.date} onChange={(event) => set("date", event.target.value)} />
          </label>
          <label className="block text-[11px] font-semibold text-gray-600">Start
            <input type="time" className={field} value={form.start_time} onChange={(event) => set("start_time", event.target.value)} />
          </label>
          <label className="block text-[11px] font-semibold text-gray-600">End
            <input type="time" className={field} value={form.end_time} onChange={(event) => set("end_time", event.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[11px] font-semibold text-gray-600">Type
            <select className={field} value={form.meeting_type} onChange={(event) => set("meeting_type", event.target.value as ScheduledMeetingInput["meeting_type"])}>
              {MEETING_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="block text-[11px] font-semibold text-gray-600">Location
            <input className={field} value={form.location} onChange={(event) => set("location", event.target.value)} placeholder="Room or online" />
          </label>
        </div>
        <label className="block text-[11px] font-semibold text-gray-600">Attendees (comma separated)
          <input className={field} value={form.attendees} onChange={(event) => set("attendees", event.target.value)} placeholder="e.g. Alex, Bea" />
        </label>
        <label className="block text-[11px] font-semibold text-gray-600">Agenda or notes
          <textarea rows={3} className={field} value={form.notes} onChange={(event) => set("notes", event.target.value)} />
        </label>
      </div>

      {error && <p role="alert" className="mt-3 border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
        <button type="submit" disabled={!canSave || saving} className="bg-[#003366] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#002244] disabled:opacity-50">{saving ? "Saving…" : "Schedule meeting"}</button>
      </div>
    </form>
  </div>;
}
