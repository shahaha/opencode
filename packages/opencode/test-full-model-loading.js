// Test the full updateModelDropdown function
import fetch from "node-fetch"

async function testUpdateModelDropdown() {
  try {
    // Get models from proxy endpoint
    const response = await fetch("http://localhost:9100/ollama/models")
    const data = await response.json()

    console.log(`Fetched ${data.models.length} models from Ollama proxy`)

    // Simulate the classification logic
    const localModels = []
    const cloudModels = []

    data.models.forEach((model) => {
      if (model.remote_model) {
        cloudModels.push(model.name)
      } else {
        localModels.push(model.name)
      }
    })

    console.log(`Local models (${localModels.length}):`, localModels.slice(0, 5), localModels.length > 5 ? "..." : "")
    console.log(`Cloud models (${cloudModels.length}):`, cloudModels)

    // Check if cloud models are present
    if (cloudModels.length > 0) {
      console.log("✅ Cloud models are correctly identified")
    } else {
      console.log("❌ No cloud models found")
    }
  } catch (error) {
    console.error("Test failed:", error.message)
  }
}

testUpdateModelDropdown()
