"use client"

import React, { useState } from 'react';
import { Zap, Calculator, Menu, X } from 'lucide-react';

// Import your tool components
import VoltageDropCalculator from './voltage-drop/page';
import CableSizeSelector from './cable-selector/page';

const LogoRounded = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <rect x="0" y="0" width="24" height="24" rx="6" fill="#FACC15" />
    <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" fill="#0B0F19" />
  </svg>
);

const ToolsPage = () => {
  const [activeTool, setActiveTool] = useState('voltage-drop');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Define your tools here - add more as you create them
  const tools = [
    { 
      id: 'voltage-drop', 
      name: 'Voltage Drop Calculator', 
      icon: Zap,
      // component: VoltageDropCalculator // Uncomment when importing
    },
    { 
      id: 'cable-selector', 
      name: 'Cable Size Selector', 
      icon: Calculator,
      // component: CableSizeSelector // Uncomment when importing
    },
    // Add more tools here as you create them
    // { id: 'conduit-fill', name: 'Conduit Fill', icon: Package },
  ];

  const currentTool = tools.find(t => t.id === activeTool);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <style jsx global>{`
        * {
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
        }
        input, select {
          user-select: text;
          -webkit-user-select: text;
        }
        body {
          overscroll-behavior: none;
          touch-action: pan-y;
        }
      `}</style>

      <div className="flex min-h-screen">
        {/* Left Sidebar - Tool Selection */}
        <aside className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          fixed lg:sticky top-0 left-0 h-screen
          w-64 bg-neutral-900 border-r border-white/10
          transition-transform duration-300 ease-in-out
          z-40 overflow-y-auto
        `}>
          {/* Sidebar Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LogoRounded className="h-6 w-6" />
              <h1 className="text-lg font-bold tracking-tight">Regs</h1>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1.5 hover:bg-white/10 rounded transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tool List */}
          <div className="p-4">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
              Calculators
            </h2>
            <nav className="space-y-1">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => {
                      setActiveTool(tool.id);
                      // Close sidebar on mobile after selection
                      if (window.innerWidth < 1024) {
                        setSidebarOpen(false);
                      }
                    }}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                      font-medium text-sm transition
                      ${activeTool === tool.id
                        ? 'bg-yellow-400 text-neutral-950'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{tool.name}</span>
                  </button>
                );
              })}
            </nav>

            {/* Back to Search Link (optional) */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <a
                href="/search"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Back to Search</span>
              </a>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          {/* Mobile Menu Button */}
          <div className="lg:hidden sticky top-0 z-30 bg-neutral-900 border-b border-white/10 p-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition"
            >
              <Menu className="w-5 h-5" />
              <span className="font-medium">{currentTool?.name || 'Tools'}</span>
            </button>
          </div>

          {/* Tool Content */}
          <div className="p-4">
            {activeTool === 'voltage-drop' && (
              <div className="max-w-4xl mx-auto">
                <div className="bg-neutral-900/80 rounded-xl border-2 border-white/10 p-6">
                  <h2 className="text-xl font-bold mb-4">Voltage Drop Calculator</h2>
                  <div className="text-yellow-400 text-sm mb-4">
                    ⚠️ Import your VoltageDropCalculator component here
                  </div>
                  <code className="text-xs text-white/60">
                    {`import VoltageDropCalculator from './voltage-drop/page';`}
                  </code>
                  {/* <VoltageDropCalculator /> */}
                </div>
              </div>
            )}

            {activeTool === 'cable-selector' && (
              <div className="max-w-4xl mx-auto">
                <div className="bg-neutral-900/80 rounded-xl border-2 border-white/10 p-6">
                  <h2 className="text-xl font-bold mb-4">Cable Size Selector</h2>
                  <div className="text-yellow-400 text-sm mb-4">
                    ⚠️ Import your CableSizeSelector component here
                  </div>
                  <code className="text-xs text-white/60">
                    {`import CableSizeSelector from './cable-selector/page';`}
                  </code>
                  {/* <CableSizeSelector /> */}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

export default ToolsPage;