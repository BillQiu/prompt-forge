import { ModelInfo } from "../../BaseAdapter";

export const TEST_MODELS: Record<string, ModelInfo> = {
  textGeneration: {
    id: "test-text-model",
    name: "Test Text Model",
    description: "A test model for text generation",
    capabilities: {
      textGeneration: true,
      imageGeneration: false,
      streaming: true,
      contextLength: 4096,
    },
    pricing: {
      inputCostPer1KTokens: 0.001,
      outputCostPer1KTokens: 0.002,
    },
  },
  imageGeneration: {
    id: "test-image-model",
    name: "Test Image Model",
    description: "A test model for image generation",
    capabilities: {
      textGeneration: false,
      imageGeneration: true,
      streaming: false,
      contextLength: 2048,
    },
    pricing: {
      inputCostPer1KTokens: 0.04,
      outputCostPer1KTokens: 0.04,
    },
  },
  multiModal: {
    id: "test-multimodal-model",
    name: "Test Multimodal Model",
    description: "A test model for both text and image generation",
    capabilities: {
      textGeneration: true,
      imageGeneration: true,
      streaming: true,
      contextLength: 8192,
    },
    pricing: {
      inputCostPer1KTokens: 0.01,
      outputCostPer1KTokens: 0.03,
    },
  },
};

export const MOCK_API_KEYS = {
  valid: "sk-test-valid-key-12345",
  invalid: "sk-test-invalid-key",
  empty: "",
};

export const TEST_PROMPTS = {
  simple: "Hello, world!",
  complex:
    "Write a detailed explanation of how machine learning works, including examples of different algorithms and their use cases.",
  code: "Write a Python function that calculates the factorial of a number.",
  chinese: "请用中文解释人工智能的基本概念。",
};
