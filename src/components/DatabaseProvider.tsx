"use client";

import React, { useEffect, useState } from "react";
import { initializeDatabase } from "@/services/db";

interface DatabaseProviderProps {
  children: React.ReactNode;
}

export default function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initDB = async () => {
      try {
        const success = await initializeDatabase();
        if (success) {
          setIsInitialized(true);
          console.log("✅ Database initialized successfully");
        } else {
          setError("数据库初始化失败");
          console.error("❌ Database initialization failed");
        }
      } catch (err) {
        setError("数据库初始化时发生错误");
        console.error("❌ Database initialization error:", err);
      }
    };

    initDB();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️ 数据库错误</div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            正在初始化数据库...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
