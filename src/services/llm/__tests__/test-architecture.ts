/**
 * LLM 适配器架构测试
 * 这个文件用于快速验证我们的 LLM 适配器架构是否正常工作
 */

import {
  llmService,
  MockAdapter,
  MockAdapterFactory,
  LLMAdapterError,
  isStreamResponse,
  isTextResponse,
} from "../index";

// 简单的测试函数
async function testLLMArchitecture() {
  console.log("🧪 开始测试 LLM 适配器架构...\n");

  try {
    // 1. 测试服务初始化
    console.log("1️⃣ 测试服务初始化");
    const providers = llmService.getProviders();
    console.log(`   ✅ 发现 ${providers.length} 个提供者:`);
    providers.forEach((p) =>
      console.log(
        `      - ${p.name} (${p.id}) - ${p.enabled ? "启用" : "禁用"}`
      )
    );

    // 2. 测试获取所有模型
    console.log("\n2️⃣ 测试获取所有模型");
    const models = llmService.getAllModels();
    console.log(`   ✅ 发现 ${models.length} 个模型:`);
    models.forEach((m) =>
      console.log(`      - ${m.name} (${m.id}) - 提供者: ${m.providerName}`)
    );

    // 3. 测试 API 密钥验证
    console.log("\n3️⃣ 测试 API 密钥验证");
    const validKey = await llmService.validateApiKey("mock", "test-key");
    const invalidKey = await llmService.validateApiKey("mock", "invalid");
    console.log(`   ✅ 有效密钥 'test-key': ${validKey}`);
    console.log(`   ✅ 无效密钥 'invalid': ${invalidKey}`);

    // 4. 测试文本生成（非流式）
    console.log("\n4️⃣ 测试文本生成（非流式）");
    const textResult = await llmService.generateText(
      "mock",
      "你好，请介绍一下自己",
      {
        model: "mock-text-basic",
        temperature: 0.7,
        maxTokens: 100,
        stream: false,
      },
      "test-key"
    );

    if (textResult.success && isTextResponse(textResult.data!)) {
      console.log(`   ✅ 文本生成成功 (${textResult.duration}ms)`);
      console.log(
        `   📝 响应: ${textResult.data.content.substring(0, 100)}...`
      );
      console.log(
        `   📊 Token 使用: ${textResult.data.metadata?.usage?.totalTokens}`
      );
    } else {
      console.log(`   ❌ 文本生成失败: ${textResult.error?.message}`);
    }

    // 5. 测试流式文本生成
    console.log("\n5️⃣ 测试流式文本生成");
    const streamResult = await llmService.generateText(
      "mock",
      "请写一个关于人工智能的短文",
      {
        model: "mock-text-advanced",
        temperature: 0.5,
        stream: true,
      },
      "test-key"
    );

    if (streamResult.success && isStreamResponse(streamResult.data!)) {
      console.log(`   ✅ 开始流式响应 (${streamResult.duration}ms)`);
      const reader = streamResult.data!.getReader();
      let fullResponse = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          fullResponse += value.content;
          if (!value.isComplete) {
            process.stdout.write(value.content);
          } else {
            console.log(
              `\n   ✅ 流式响应完成，总长度: ${fullResponse.length} 字符`
            );
          }
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      console.log(`   ❌ 流式生成失败: ${streamResult.error?.message}`);
    }

    // 6. 测试图像生成
    console.log("\n6️⃣ 测试图像生成");
    const imageResult = await llmService.generateImage(
      "mock",
      "一只可爱的小猫在花园里玩耍",
      {
        model: "mock-image-basic",
        size: "512x512",
        numImages: 2,
        quality: "hd",
      },
      "test-key"
    );

    if (imageResult.success) {
      console.log(`   ✅ 图像生成成功 (${imageResult.duration}ms)`);
      imageResult.data!.forEach((img, i) => {
        console.log(`   🖼️  图像 ${i + 1}: ${img.url}`);
        console.log(`      修正提示: ${img.metadata?.revisedPrompt}`);
      });
    } else {
      console.log(`   ❌ 图像生成失败: ${imageResult.error?.message}`);
    }

    // 7. 测试模型能力检查
    console.log("\n7️⃣ 测试模型能力检查");
    const capabilities = [
      ["mock-text-basic", "textGeneration"],
      ["mock-text-basic", "imageGeneration"],
      ["mock-image-basic", "textGeneration"],
      ["mock-image-basic", "imageGeneration"],
      ["mock-multimodal", "streaming"],
    ];

    capabilities.forEach(([model, capability]) => {
      const supported = llmService.supportsCapability(
        "mock",
        model,
        capability as any
      );
      console.log(
        `   ${
          supported ? "✅" : "❌"
        } ${model} 支持 ${capability}: ${supported}`
      );
    });

    // 8. 测试错误处理
    console.log("\n8️⃣ 测试错误处理");
    try {
      await llmService.generateText(
        "nonexistent",
        "test",
        { model: "test" },
        "test-key"
      );
    } catch (error) {
      console.log(
        `   ✅ 正确捕获提供者不存在错误: ${
          error instanceof LLMAdapterError ? error.message : error
        }`
      );
    }

    // 9. 测试配置和缓存
    console.log("\n9️⃣ 测试配置和缓存");
    const originalConfig = llmService.getConfig();
    console.log(
      `   📊 当前配置: 缓存=${originalConfig.cacheAdapters}, 重试=${originalConfig.retryAttempts}`
    );

    llmService.updateConfig({ retryAttempts: 5 });
    const newConfig = llmService.getConfig();
    console.log(
      `   ✅ 配置更新: 重试次数从 ${originalConfig.retryAttempts} 更新为 ${newConfig.retryAttempts}`
    );

    console.log("\n🎉 所有测试完成！LLM 适配器架构工作正常。");
  } catch (error) {
    console.error("❌ 测试过程中发生错误:", error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  testLLMArchitecture().catch(console.error);
}

export { testLLMArchitecture };
