'use client';

import { useState, useEffect } from 'react';
import { detectInAppBrowser, getBrowserDisplayName, openInExternalBrowser, InAppBrowserInfo } from '@/lib/inAppBrowser';

export function InAppBrowserWarning() {
  const [browserInfo, setBrowserInfo] = useState<InAppBrowserInfo | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const info = detectInAppBrowser();
    setBrowserInfo(info);
  }, []);

  if (!isMounted || !browserInfo?.isInAppBrowser || !isVisible) {
    return null;
  }

  const browserName = getBrowserDisplayName(browserInfo.browser);

  const handleOpenInBrowser = () => {
    openInExternalBrowser();
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-3 shadow-lg">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div className="text-sm">
            <p className="font-semibold">
              You&apos;re viewing this in {browserName}
            </p>
            <p className="opacity-90 text-xs">
              WalletConnect may not work properly. Open in your browser for the best experience.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenInBrowser}
            className="px-4 py-2 bg-white text-orange-600 rounded-lg font-semibold text-sm hover:bg-gray-100 transition-colors whitespace-nowrap"
          >
            Open in Browser
          </button>
          <button
            onClick={handleDismiss}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Dismiss warning"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}