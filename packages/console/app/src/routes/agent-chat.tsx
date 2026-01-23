import { RouteSectionProps } from "@solidjs/router"

export default function AGUIChatRoute(props: RouteSectionProps) {
  return (
    <div style={{ padding: "20px", background: "lightblue" }}>
      <h1>AG-UI Chat Route</h1>
      <p>This route is working!</p>
      <p>Session would be loaded here with the AG-UI chat component.</p>
    </div>
  )
}
