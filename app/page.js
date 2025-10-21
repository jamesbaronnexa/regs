"use client"

import React, { useState } from 'react';
import { Search, Wrench, Calculator, Zap, Menu, X } from 'lucide-react';

// Import your actual components
import VoltageDropCalculator from './tools/voltage-drop/page';
import CableSizeSelector from './tools/cable-selector/page';
import SearchPage from './search/page';

const LogoRounded = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <rect x="0" y="0" width="24" height="24" rx="6" fill="#FACC15" />
    <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" fill="#0B0F19" />
  </svg>
);

// Main App Component
const RegsApp = () => {
  const [mainTab, setMainTab] = useState('search');
  const [activeTool, setActiveTool] = useState('voltage-drop');
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const tools = [
    { id: 'voltage-drop', name: 'Voltage Drop Calculator', icon: Zap },
    { id: 'cable-selector', name: 'Cable Size Selector', icon: Calculator },
  ];

  const handleToolSelect = (toolId) => {
    setActiveTool(toolId);
  };

  const handleTabChange = (tab) => {
    setMainTab(tab);
  };

  // Hide loading screen after 1.5 seconds
  React.useEffect(() => {
    setTimeout(() => {
      setIsInitialLoading(false);
    }, 1500);
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {isInitialLoading && (
        <div className="fixed inset-0 bg-neutral-950 z-50 flex flex-col items-center justify-center gap-4">
          <LogoRounded className="h-24 w-24" />
          <h1 className="text-2xl font-bold tracking-tight text-white">Regs</h1>
        </div>
      )}

      <style jsx global>{`
        * {
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
        }
        input, select, textarea {
          user-select: text;
          -webkit-user-select: text;
        }
        button {
          user-select: none;
          -webkit-user-select: none;
        }
        body {
          overscroll-behavior: none;
          touch-action: pan-y;
        }
        html {
          height: 100%;
          overflow: hidden;
        }
        body {
          height: 100%;
          overflow: hidden;
        }
      `}</style>

      {/* Header */}
      <header className="bg-neutral-900 border-b border-white/10 sticky top-0 z-50">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-2">
            <LogoRounded className="h-6 w-6 sm:h-7 sm:w-7" />
            <h1 className="text-base sm:text-lg font-bold tracking-tight">Regs</h1>
          </div>

          {/* Main Navigation Tabs */}
          <nav className="flex gap-1.5 sm:gap-2">
            <button
              onClick={() => handleTabChange('search')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg font-semibold text-sm sm:text-base transition active:scale-95 ${
                mainTab === 'search'
                  ? 'bg-yellow-400 text-neutral-950'
                  : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Search</span>
            </button>
            <button
              onClick={() => handleTabChange('tools')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg font-semibold text-sm sm:text-base transition active:scale-95 ${
                mainTab === 'tools'
                  ? 'bg-yellow-400 text-neutral-950'
                  : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Tools</span>
            </button>
          </nav>
        </div>
      </header>

      <div className="flex h-[calc(100vh-57px)] sm:h-[calc(100vh-61px)] overflow-hidden">
        {/* Compact Vertical Tab Bar - Tools Menu */}
        {mainTab === 'tools' && (
          <aside className="flex flex-col bg-neutral-900 border-r border-white/10 overflow-y-auto">
            <nav className="flex flex-col">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => handleToolSelect(tool.id)}
                    className={`
                      flex flex-col items-center justify-center gap-1.5 px-2 py-3 sm:px-3 sm:py-4
                      font-medium text-xs transition active:scale-95 border-b border-white/5
                      min-w-[60px] sm:min-w-[70px]
                      ${activeTool === tool.id
                        ? 'bg-yellow-400 text-neutral-950'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                      }
                    `}
                    title={tool.name}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-[10px] sm:text-xs text-center leading-tight max-w-[50px] sm:max-w-[60px]">
                      {tool.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {mainTab === 'search' ? (
            <SearchPage />
          ) : (
            <>
              {activeTool === 'voltage-drop' && <VoltageDropCalculator />}
              {activeTool === 'cable-selector' && <CableSizeSelector />}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default RegsApp;