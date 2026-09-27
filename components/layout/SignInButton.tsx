"use client";

export default function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => {
        // TODO: open the auth modal once auth exists.
      }}
      className="rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:color-mix(in_srgb,var(--accent)_88%,white)]"
    >
      Sign in
    </button>
  );
}
