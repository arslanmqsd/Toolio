import { ImageResponse } from "next/og";

/** A 1200×630 sample share image for the Open Graph Preview's example, so it loads nothing from other sites. */
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0F1A26 0%, #2F6690 100%)",
          color: "#F5F7FA",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 40, opacity: 0.8 }}>toolio.dev</div>
        <div style={{ fontSize: 96, fontWeight: 700, marginTop: 16 }}>Toolio</div>
        <div style={{ fontSize: 44, marginTop: 16, opacity: 0.9 }}>Free online developer tools</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
