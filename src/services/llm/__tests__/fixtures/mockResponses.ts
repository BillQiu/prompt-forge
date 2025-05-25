import { TextResponse, ImageResponse, StreamChunk } from "../../BaseAdapter";

export const MOCK_RESPONSES = {
  textSuccess: {
    content: "This is a test response from the AI model.",
    metadata: {
      model: "test-model",
      usage: {
        promptTokens: 10,
        completionTokens: 15,
        totalTokens: 25,
      },
      finishReason: "stop",
    },
  } as TextResponse,

  textError: {
    message: "API request failed",
    code: "API_ERROR",
    status: 500,
  },

  streamSuccess: [
    { content: "Hello", isComplete: false },
    { content: " world", isComplete: false },
    { content: "!", isComplete: false },
    {
      content: "",
      isComplete: true,
      metadata: {
        model: "test-model",
        usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
        finishReason: "stop",
      },
    },
  ] as StreamChunk[],

  imageSuccess: [
    {
      url: "https://example.com/test-image-1.png",
      metadata: {
        model: "test-image-model",
        size: "1024x1024",
        prompt: "Test image prompt",
        finishReason: "stop",
      },
    },
  ] as ImageResponse[],

  networkError: {
    message: "Network error: Unable to connect to API",
    code: "NETWORK_ERROR",
  },

  authError: {
    message: "Invalid API key provided",
    code: "INVALID_API_KEY",
    status: 401,
  },

  rateLimitError: {
    message: "Rate limit exceeded. Please try again later",
    code: "RATE_LIMIT_EXCEEDED",
    status: 429,
  },
};

export const createMockStream = (
  chunks: string[]
): ReadableStream<StreamChunk> => {
  let index = 0;

  return new ReadableStream<StreamChunk>({
    start(controller) {
      const sendNext = () => {
        if (index < chunks.length) {
          controller.enqueue({
            content: chunks[index],
            isComplete: false,
          });
          index++;
          setTimeout(sendNext, 10); // 模拟异步延迟
        } else {
          // 发送完成信号
          controller.enqueue({
            content: "",
            isComplete: true,
            metadata: {
              model: "test-model",
              usage: {
                promptTokens: 5,
                completionTokens: chunks.length,
                totalTokens: 5 + chunks.length,
              },
              finishReason: "stop",
            },
          });
          controller.close();
        }
      };
      sendNext();
    },
  });
};
