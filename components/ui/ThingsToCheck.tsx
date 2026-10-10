import Alert from "@/components/ui/Alert";

/** Warnings about a tool's result that's still usable: "2 things to check", then the list. */
export default function ThingsToCheck({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <Alert tone="warn" title={items.length === 1 ? "1 thing to check" : `${items.length} things to check`}>
        <ul className="mt-1 space-y-1.5 text-xs">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Alert>
    </div>
  );
}
