"use client";

import Button from "@/components/ui/Button";

export default function SignInButton() {
  return (
    <Button
      variant="primary"
      onClick={() => {
        // TODO: open the auth modal once auth exists.
      }}
    >
      Sign in
    </Button>
  );
}
