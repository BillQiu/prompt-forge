import ApiKeyManager from "@/components/Settings/ApiKeyManager";
import ProviderManagement from "@/components/Settings/ProviderManagement";
import ProviderConfigManager from "@/components/Settings/ProviderConfigManager";
import CustomModelManager from "@/components/Settings/CustomModelManager";
import Navigation from "@/components/Navigation";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* 提供商管理和模型显示 */}
          <ProviderManagement />

          {/* 提供商配置管理 */}
          <ProviderConfigManager />

          {/* 自定义模型管理 */}
          <CustomModelManager />

          {/* API密钥管理 */}
          <ApiKeyManager />
        </div>
      </div>
    </div>
  );
}
