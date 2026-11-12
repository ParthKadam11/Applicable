"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { SignInPrompt } from "@/components/sign-in-prompt";

type Props = {
  jobId: string;
  saved: boolean;
  onSavedChange?: (saved: boolean) => void;
};

export function SaveJobButton({ jobId, saved, onSavedChange }: Props) {
  const { data } = useSession();
  const [localSaved, setLocalSaved] = useState(saved);
  const [pending, setPending] = useState(false);
  const [prompt, setPrompt] = useState(false);

  async function toggle() {
    if (!data?.user) {
      setPrompt(true);
      return;
    }
    const next = !localSaved;
    setLocalSaved(next);
    onSavedChange?.(next);
    setPending(true);
    try {
      const res = await fetch(`/api/me/saved/${jobId}`, {
        method: next ? "POST" : "DELETE",
      });
      if (res.status === 401) {
        setLocalSaved(!next);
        onSavedChange?.(!next);
        setPrompt(true);
        return;
      }
      if (!res.ok) {
        setLocalSaved(!next);
        onSavedChange?.(!next);
      }
    } catch {
      setLocalSaved(!next);
      onSavedChange?.(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => void toggle()}
        className={`font-mono text-[11px] uppercase ${
          localSaved ? "text-mark-deep" : "text-mute hover:text-ink"
        } disabled:opacity-50`}
        aria-pressed={localSaved}
      >
        {localSaved ? "Saved" : "Save"}
      </button>
      <SignInPrompt
        open={prompt}
        message="Sign in to save this job"
        onClose={() => setPrompt(false)}
      />
    </>
  );
}
