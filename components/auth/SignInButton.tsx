"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import SignInDialog from "./SignInDialog";

/** Primary "Sign in" button that opens the sign-in dialog. */
export default function SignInButton({ label = "Sign in" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {label}
      </Button>
      <SignInDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
