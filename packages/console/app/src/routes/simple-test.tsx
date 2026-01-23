// Simple test component without Suspense
import { RouteSectionProps } from "@solidjs/router"

export default function SimpleTest(props: RouteSectionProps) {
  return (
    <div style={{ padding: "20px", background: "lightgreen" }}>
      <h1>Simple Test Without Suspense</h1>
      <p>If you see this, basic rendering works!</p>
    </div>
  )
}
