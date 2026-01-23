export default function TestPage() {
  return (
    <div
      style={{
        padding: "2rem",
        background: "#f0f0f0",
        "font-family": "monospace",
        "font-size": "1.2rem",
      }}
    >
      <h1>🚀 Test Route Working!</h1>
      <p>This confirms that SolidJS routing is functional.</p>
      <p>Current time: {new Date().toLocaleString()}</p>
    </div>
  )
}
