// Test model classification
const testModels = [
  {
    name: "llama3.2:latest",
    model: "llama3.2:latest",
    modified_at: "2025-03-14T23:47:40.973423622+08:00",
    size: 2019393189,
    digest: "a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72",
    details: {
      parent_model: "",
      format: "gguf",
      family: "llama",
      families: ["llama"],
      parameter_size: "3.2B",
      quantization_level: "Q4_K_M",
    },
  },
  {
    name: "glm-4.7:cloud",
    model: "glm-4.7:cloud",
    remote_model: "glm-4.7",
    remote_host: "https://ollama.com:443",
    modified_at: "2026-01-22T13:40:47.729728623+08:00",
    size: 327,
    digest: "0236088648195aa13eaa52faa8152e8ac4fd7e4e137939d57a2a5576a8fd3df8",
    details: {
      parent_model: "",
      format: "",
      family: "",
      families: null,
      parameter_size: "",
      quantization_level: "",
    },
  },
]

const localModels = []
const cloudModels = []

testModels.forEach((model) => {
  if (model.remote_model) {
    cloudModels.push(model)
  } else {
    localModels.push(model)
  }
})

console.log(
  "Local models:",
  localModels.map((m) => m.name),
)
console.log(
  "Cloud models:",
  cloudModels.map((m) => m.name),
)
