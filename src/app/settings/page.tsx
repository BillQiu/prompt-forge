import ApiKeyManager from "@/components/Settings/ApiKeyManager";
import ProviderManagement from "@/components/Settings/ProviderManagement";
import Navigation from "@/components/Navigation";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* 提供商管理和模型显示 */}
          <ProviderManagement />

          {/* API密钥管理 */}
          <ApiKeyManager />
        </div>
      </div>
    </div>
  );
}
