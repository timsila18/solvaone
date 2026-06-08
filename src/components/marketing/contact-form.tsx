"use client";

import { useActionState } from "react";
import { submitContactMessage } from "@/app/contact/actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

const initialState = { status: "idle", message: "" };

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContactMessage, initialState);
  return (
    <form action={action} className="space-y-4 rounded-lg border border-black/10 p-5 dark:border-white/10">
      <Input name="name" placeholder="Full name" required />
      <Input name="email" type="email" placeholder="Email address" required />
      <Input name="phone" placeholder="Phone or WhatsApp" />
      <Input name="subject" placeholder="Subject" required />
      <Textarea name="message" className="min-h-32" placeholder="How can SolvaOne help?" required />
      <Button type="submit" disabled={pending}>{pending ? "Sending" : "Send message"}</Button>
      {state.message ? (
        <p className={state.status === "success" ? "text-sm font-bold text-brand-blue" : "text-sm font-bold text-black dark:text-white"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
