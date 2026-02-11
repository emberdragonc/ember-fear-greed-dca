// utils/inAppBrowser.ts - Detect in-app browsers and provide escape hatches

export type InAppBrowser = 'twitter' | 'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'snapchat' | 'messenger' | 'other' | null;

export interface InAppBrowserInfo {
  isInAppBrowser: boolean;
  browser: InAppBrowser;
  canOpenExternal: boolean;
}

export function detectInAppBrowser(): InAppBrowserInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isInAppBrowser: false, browser: null, canOpenExternal: false };
  }

  const ua = navigator.userAgent.toLowerCase();
  
  // Twitter/X detection
  const isTwitter = ua.includes('twitter') || 
                    ua.includes('twitterandroid') || 
                    ua.includes('twitterios') ||
                    (ua.includes('macintosh') && ua.includes('twitter'));
  
  // Facebook detection
  const isFacebook = ua.includes('fban') || ua.includes('fbios') || ua.includes('facebook');
  
  // Instagram detection
  const isInstagram = ua.includes('instagram');
  
  // TikTok detection
  const isTikTok = ua.includes('musical') || ua.includes('tiktok') || ua.includes('trill');
  
  // LinkedIn detection
  const isLinkedIn = ua.includes('linkedin');
  
  // Snapchat detection
  const isSnapchat = ua.includes('snapchat');
  
  // Messenger detection
  const isMessenger = ua.includes('messenger');
  
  // General in-app webview detection (catch-all)
  const isWebview = ua.includes('webview') || 
                    ua.includes('web_view') ||
                    ua.includes('wv') ||
                    (ua.includes('mobile') && !ua.includes('safari') && !ua.includes('chrome') && !ua.includes('firefox'));
  
  if (isTwitter) {
    return { isInAppBrowser: true, browser: 'twitter', canOpenExternal: true };
  }
  if (isFacebook) {
    return { isInAppBrowser: true, browser: 'facebook', canOpenExternal: true };
  }
  if (isInstagram) {
    return { isInAppBrowser: true, browser: 'instagram', canOpenExternal: true };
  }
  if (isTikTok) {
    return { isInAppBrowser: true, browser: 'tiktok', canOpenExternal: true };
  }
  if (isLinkedIn) {
    return { isInAppBrowser: true, browser: 'linkedin', canOpenExternal: true };
  }
  if (isSnapchat) {
    return { isInAppBrowser: true, browser: 'snapchat', canOpenExternal: true };
  }
  if (isMessenger) {
    return { isInAppBrowser: true, browser: 'messenger', canOpenExternal: true };
  }
  if (isWebview) {
    return { isInAppBrowser: true, browser: 'other', canOpenExternal: true };
  }
  
  return { isInAppBrowser: false, browser: null, canOpenExternal: true };
}

export function getExternalBrowserUrl(): string {
  if (typeof window === 'undefined') return '';
  
  const currentUrl = window.location.href;
  
  // For iOS Safari
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    return currentUrl;
  }
  
  // For Android Chrome
  if (/Android/.test(navigator.userAgent)) {
    return currentUrl;
  }
  
  return currentUrl;
}

export function openInExternalBrowser(): void {
  const url = getExternalBrowserUrl();
  
  // Try to open in external browser
  // For iOS: we need to show a button that uses window.open
  // For Android: we can try intent:// but usually window.open works
  
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    // On iOS, we open in a new window which forces Safari
    window.open(url, '_blank');
  } else {
    // On Android, try opening externally
    window.open(url, '_system');
  }
}

export function getBrowserDisplayName(browser: InAppBrowser): string {
  switch (browser) {
    case 'twitter': return 'Twitter/X';
    case 'facebook': return 'Facebook';
    case 'instagram': return 'Instagram';
    case 'tiktok': return 'TikTok';
    case 'linkedin': return 'LinkedIn';
    case 'snapchat': return 'Snapchat';
    case 'messenger': return 'Messenger';
    case 'other': return 'In-App Browser';
    default: return 'Browser';
  }
}