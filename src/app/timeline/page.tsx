"use client";

import TimelineView from "@/components/TimelineView";
import Navigation from "@/components/Navigation";
import ConversationModal from "@/components/ConversationModal";

export default function TimelinePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto py-8 px-4">
        <div className="pl-4 md:pl-8">
          {" "}
          {/* 给导航栏预留空间 */}
          <TimelineView />
        </div>
      </div>
      <ConversationModal />
    </div>
  );
}
