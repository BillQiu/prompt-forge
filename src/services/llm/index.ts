// 导出基础适配器接口和类型
export type {
  BaseAdapter,
  AdapterFactory,
  BaseGenerationOptions,
  TextGenerationOptions,
  ImageGenerationOptions,
  TextResponse,
  ImageResponse,
  StreamChunk,
  ModelInfo,
} from "./BaseAdapter";

export { LLMAdapterError } from "./BaseAdapter";

// 导出 Mock 适配器
export { MockAdapter, MockAdapterFactory } from "./adapters/MockAdapter";

// 导出中央 LLM 服务
export { llmService, LLMServiceClass } from "./LLMService";

// 导入类型用于工具函数
import type { TextResponse, StreamChunk } from "./BaseAdapter";

// 导出类型守卫和工具函数
export const isStreamResponse = (
  response: TextResponse | ReadableStream<StreamChunk>
): response is ReadableStream<StreamChunk> => {
  return response instanceof ReadableStream;
};

export const isTextResponse = (
  response: TextResponse | ReadableStream<StreamChunk>
): response is TextResponse => {
  return !isStreamResponse(response);
};
