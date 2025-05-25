import ApiKeyManager from "@/components/Settings/ApiKeyManager";
import Navigation from "@/components/Navigation";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <ApiKeyManager />
        </div>
      </div>
    </div>
  );
}
