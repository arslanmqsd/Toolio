import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import { parseSeed } from "@/lib/random/seeded";

interface SeedFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** id of the message shown when the seed isn't valid. */
  errorId: string;
}

/** The seed behind generated sample data, so the same output can be made again. */
export default function SeedField({ id, value, onChange, errorId }: SeedFieldProps) {
  const valid = parseSeed(value) !== null;
  return (
    <Field label="Seed" htmlFor={id} help="The same seed and options always make the same output.">
      <CodeInput
        id={id}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        invalid={!valid}
        aria-describedby={valid ? undefined : errorId}
        className="max-w-48"
      />
    </Field>
  );
}
