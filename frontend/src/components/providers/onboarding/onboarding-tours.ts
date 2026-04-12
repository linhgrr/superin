/**
 * Onboarding tours — pure data definitions, no React dependency.
 */

import type { DriveStep } from "driver.js";

export type TourId = "welcome" | "dashboard" | "apps" | "chat" | "store";

export const TOURS: Record<TourId, DriveStep[]> = {
  welcome: [
    {
      element: ".sidebar-brand",
      popover: {
        title: "Welcome to Superin!",
        description: "Your personal AI-powered workspace. Let's take a quick tour to get you started.",
        side: "right",
        align: "start",
      },
    },
    {
      element: ".sidebar",
      popover: {
        title: "Navigation Sidebar",
        description: "Access your dashboard, installed apps, and the App Store from here. Everything is just one click away.",
        side: "right",
        align: "start",
      },
    },
    {
      element: "[href='/dashboard']",
      popover: {
        title: "Dashboard",
        description: "Your command center. See all your widgets and get a quick overview of everything that matters.",
        side: "right",
        align: "center",
      },
    },
    {
      element: ".chat-container",
      popover: {
        title: "AI Assistant — Your Digital Partner",
        description: "Chat naturally with Superin AI to manage tasks, track expenses, create calendar events, or ask questions. It understands context and can take actions across all your apps.",
        side: "left",
        align: "center",
      },
    },
    {
      element: ".dashboard-grid-layout",
      popover: {
        title: "Interactive Widgets",
        description: "Your widgets show key information from all installed apps. Drag to rearrange, click to interact, and hover for quick actions.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "[href='/store']",
      popover: {
        title: "App Store",
        description: "Install apps like Finance, Todo, Calendar to extend your workspace with new widgets and AI capabilities.",
        side: "right",
        align: "center",
      },
    },
  ],
  dashboard: [
    {
      element: ".dashboard-grid-layout",
      popover: {
        title: "Your Widget Grid",
        description: "This is your personalized workspace. Each widget displays live data from your apps. Drag and drop any widget to rearrange your layout exactly how you want it.",
        side: "top",
        align: "start",
      },
    },
    {
      element: ".widget-card",
      popover: {
        title: "Widget Cards",
        description: "Each card shows key metrics and updates in real-time. Hover to see interactive elements. Click to dive deeper into the app.",
        side: "top",
        align: "center",
      },
    },
    {
      element: ".btn-secondary:has(svg)",
      popover: {
        title: "Customize Your Dashboard",
        description: "Click here to add new widgets, remove ones you don't need, or manage which apps appear on your dashboard.",
        side: "bottom",
        align: "end",
      },
    },
    {
      element: ".rgl-item-view",
      popover: {
        title: "Drag to Reorganize",
        description: "Grab any widget by its header and drag to a new position. Your layout is automatically saved and synced.",
        side: "top",
        align: "center",
      },
    },
    {
      element: ".chat-container",
      popover: {
        title: "Quick AI Actions",
        description: "Use the chat to quickly add data without opening apps. Try: \"Add expense $50 for lunch\" or \"Create task buy milk tomorrow\"",
        side: "left",
        align: "center",
      },
    },
  ],
  apps: [
    {
      element: ".app-item.active",
      popover: {
        title: "App Navigation",
        description: "Installed apps appear here with color-coded icons. The active app is highlighted. Click any app to open its full interface.",
        side: "right",
        align: "center",
      },
    },
    {
      element: ".app-header-title",
      popover: {
        title: "App Context",
        description: "Each app has dedicated pages: Overview for summaries, Transactions for lists, Categories for organization, and Settings for preferences.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: ".sidebar",
      popover: {
        title: "Switch Between Apps",
        description: "Easily jump between apps without losing your place. Your dashboard widgets stay updated in the background.",
        side: "right",
        align: "center",
      },
    },
  ],
  chat: [
    {
      element: ".chat-container",
      popover: {
        title: "AI Chat Interface",
        description: "Your personal AI assistant that understands natural language. Ask questions, create data, or get insights across all your connected apps.",
        side: "left",
        align: "center",
      },
    },
    {
      element: ".chat-header",
      popover: {
        title: "Superin AI — Powered by Linhdz",
        description: "Our AI understands context from all your apps. It can cross-reference data and take intelligent actions on your behalf.",
        side: "left",
        align: "start",
      },
    },
    {
      element: ".chat-messages",
      popover: {
        title: "Conversation History",
        description: "All your conversations are preserved. Scroll up to see previous interactions and context the AI remembers about you.",
        side: "left",
        align: "center",
      },
    },
    {
      element: ".chat-input",
      popover: {
        title: "Natural Language Input",
        description: "Type naturally like you're chatting with a friend. Examples:\n• \"Spent $45 on groceries\"\n• \"What did I spend last month?\"\n• \"Schedule team meeting Friday 3pm\"\n• \"Add task review Q3 report urgent\"",
        side: "top",
        align: "center",
      },
    },
    {
      element: ".chat-send-btn",
      popover: {
        title: "Send or Press Enter",
        description: "Click the send button or simply press Enter to send your message. Use Shift+Enter for multi-line messages.",
        side: "top",
        align: "end",
      },
    },
    {
      element: ".message-bubble-assistant",
      popover: {
        title: "AI Responses & Actions",
        description: "The AI responds conversationally and can present data, suggest actions, or ask clarifying questions. It may also trigger app-specific tools automatically.",
        side: "left",
        align: "center",
      },
    },
  ],
  store: [
    {
      element: ".store-card:first-child",
      popover: {
        title: "Available Apps",
        description: "Browse curated apps designed for productivity. Each app adds new capabilities to your workspace and dashboard.",
        side: "bottom",
        align: "center",
      },
    },
    {
      element: ".badge-primary",
      popover: {
        title: "Filter by Category",
        description: "Quickly find apps for Finance, Productivity, Health, and more. Use filters to discover the right tools for your workflow.",
        side: "bottom",
        align: "center",
      },
    },
    {
      element: ".btn-primary",
      popover: {
        title: "One-Click Install",
        description: "Click Install to add an app. Widgets appear automatically on your dashboard, and AI capabilities are instantly available in chat.",
        side: "left",
        align: "center",
      },
    },
    {
      element: ".store-card",
      popover: {
        title: "App Details",
        description: "Each card shows what widgets and AI tools the app provides. Read descriptions to understand how it integrates with your workflow.",
        side: "bottom",
        align: "start",
      },
    },
  ],
};
