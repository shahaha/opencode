import { RouteSectionProps } from "@solidjs/router"

export default function PureTest(props: RouteSectionProps) {
  return (
    <div style={{ padding: "20px", background: "lightgreen" }}>
      <h1>Pure Test Component</h1>
      <p>If you see this, routing works!</p>
    </div>
  )
}
