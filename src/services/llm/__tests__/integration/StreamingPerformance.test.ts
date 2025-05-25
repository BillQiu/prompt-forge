import { describe, it, expect, beforeEach } from "vitest";
import { MockAdapter } from "../../adapters/MockAdapter";
import { MOCK_API_KEYS, TEST_PROMPTS } from "../fixtures/testModels";
import { createMockStream } from "../fixtures/mockResponses";

describe("流响应延迟", () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  it("流响应延迟", async () => {
    adapter.setFastMode(); // 设置快速模式以降低延迟

    const startTime = Date.now();
    const response = await adapter.generateText(
      TEST_PROMPTS.simple,
      {
        model: "mock-fast-model",
        stream: true,
      },
      MOCK_API_KEYS.valid
    );

    expect(response).toBeInstanceOf(ReadableStream);

    if (response instanceof ReadableStream) {
      const reader = response.getReader();
      let firstChunkTime: number | null = null;
      let totalChunks = 0;
      let completedTime: number | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          totalChunks++;

          // 记录第一个chunk的时间（TTFB - Time To First Byte）
          if (firstChunkTime === null) {
            firstChunkTime = Date.now();
          }

          // 记录完成时间
          if (value.isComplete) {
            completedTime = Date.now();
          }
        }
      } finally {
        reader.releaseLock();
      }

      // 性能断言
      const ttfb = firstChunkTime! - startTime;
      const totalTime = completedTime! - startTime;

      expect(ttfb, "Time to first byte should be reasonable").toBeLessThan(100);
      expect(
        totalTime,
        "Total streaming time should be reasonable"
      ).toBeLessThan(500);
      expect(totalChunks, "Should receive multiple chunks").toBeGreaterThan(1);

      console.log(`流处理性能:
        - 首字节时间 (TTFB): ${ttfb}ms
        - 总用时: ${totalTime}ms
        - 总块数: ${totalChunks}
        - 平均每块时间: ${(totalTime / totalChunks).toFixed(2)}ms`);
    }
  });

  it("应该在合理时间内处理长文本流", async () => {
    adapter.updateConfig({ delay: 10 }); // 轻微延迟

    const longPrompt = TEST_PROMPTS.complex;
    const startTime = Date.now();

    const response = await adapter.generateText(
      longPrompt,
      {
        model: "mock-gpt-4",
        stream: true,
        maxTokens: 1000,
      },
      MOCK_API_KEYS.valid
    );

    if (response instanceof ReadableStream) {
      const reader = response.getReader();
      const chunks = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(
        totalTime,
        "Long text streaming should complete in reasonable time"
      ).toBeLessThan(2000);
      expect(
        chunks.length,
        "Should receive many chunks for long text"
      ).toBeGreaterThan(5);
    }
  });

  it("应该正确处理流中断和恢复", async () => {
    adapter.setFastMode();

    const response = await adapter.generateText(
      TEST_PROMPTS.simple,
      {
        model: "mock-gpt-4",
        stream: true,
      },
      MOCK_API_KEYS.valid
    );

    if (response instanceof ReadableStream) {
      const reader = response.getReader();

      // 读取一些chunks然后释放reader
      const { done, value } = await reader.read();
      expect(done).toBe(false);
      expect(value).toBeDefined();

      reader.releaseLock();

      // 获取新的reader并继续读取
      const newReader = response.getReader();
      const remainingChunks = [];

      try {
        while (true) {
          const { done, value } = await newReader.read();
          if (done) break;
          remainingChunks.push(value);
        }
      } finally {
        newReader.releaseLock();
      }

      expect(remainingChunks.length).toBeGreaterThan(0);
    }
  });

  it("应该正确报告流处理吞吐量", async () => {
    adapter.setFastMode();

    const testContent =
      "This is a test message for throughput measurement. ".repeat(20);
    adapter.updateConfig({ customResponse: testContent });

    const startTime = Date.now();
    const response = await adapter.generateText(
      TEST_PROMPTS.simple,
      {
        model: "mock-fast-model",
        stream: true,
      },
      MOCK_API_KEYS.valid
    );

    if (response instanceof ReadableStream) {
      const reader = response.getReader();
      let totalContentLength = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value.content) {
            totalContentLength += value.content.length;
          }
        }
      } finally {
        reader.releaseLock();
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const throughput = totalContentLength / (totalTime / 1000); // 字符/秒

      expect(throughput, "Throughput should be reasonable").toBeGreaterThan(
        100
      ); // 至少100字符/秒

      console.log(`流处理吞吐量:
        - 总字符数: ${totalContentLength}
        - 处理时间: ${totalTime}ms
        - 吞吐量: ${throughput.toFixed(2)} 字符/秒`);
    }
  });

  it("应该处理空流和错误流", async () => {
    // 测试空响应流
    adapter.updateConfig({ customResponse: "" });

    const response = await adapter.generateText(
      TEST_PROMPTS.simple,
      {
        model: "mock-fast-model",
        stream: true,
      },
      MOCK_API_KEYS.valid
    );

    if (response instanceof ReadableStream) {
      const reader = response.getReader();
      const chunks = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      // 即使内容为空，也应该有完成信号
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.isComplete).toBe(true);
    }
  });
});
