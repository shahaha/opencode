import { RouteSectionProps } from "@solidjs/router"

export default function MinimalTest(props: RouteSectionProps) {
  return (
    <div style={{ padding: "40px", background: "#f5f5f5", "font-family": "system-ui" }}>
      <h1 style={{ color: "#333" }}>Minimal Test Page</h1>
      <p style={{ color: "#666" }}>This is a minimal page to test routing.</p>
      <p style={{ color: "#666" }}>No complex imports, no async data, no external dependencies.</p>
    </div>
  )
}
