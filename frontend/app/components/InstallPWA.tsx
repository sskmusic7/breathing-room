"use client";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "breathing-room:install-dismissed";

const isIOS = () => {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
};

export const InstallPWA = () => {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [isInStandalone, setIsInStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setIsIOSDevice(isIOS());
    setIsInStandalone(isStandalone());
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {}

    const handler = (e: Event) => {
      e.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(e as BeforeInstallPromptEvent);
    };
    
    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const onClick = (evt: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    evt.preventDefault();
    if (!promptInstall) {
      return;
    }
    promptInstall.prompt();
  };

  const onDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const onIOSInstructionsClick = () => {
    setShowIOSInstructions(!showIOSInstructions);
  };

  // Don't show anything if already installed (standalone mode)
  if (isInStandalone || dismissed) {
    return null;
  }

  // Don't show anything if no PWA support and not iOS
  if (!supportsPWA && !isIOSDevice) {
    return null;
  }

  return (
    <div className="fixed bottom-24 inset-x-4 z-50 flex justify-center">
      <div className="bg-card rounded-2xl p-4 border border-line max-w-sm">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-mint rounded-full flex items-center justify-center">
            📱
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-ink text-sm">Install App</h4>
            <p className="text-xs text-muted">
              {isIOSDevice ? "Add to Home Screen" : "Add to home screen"}
            </p>
          </div>
          {supportsPWA && !isIOSDevice ? (
            <button 
              onClick={onClick} 
              type="button"
              className="bg-ink hover:bg-ink text-white font-medium py-2 px-4 rounded-2xl transition-colors duration-200 text-sm"
            >
              Install
            </button>
          ) : isIOSDevice ? (
            <button 
              onClick={onIOSInstructionsClick} 
              type="button"
              className="bg-ink hover:bg-ink text-white font-medium py-2 px-4 rounded-2xl transition-colors duration-200 text-sm"
            >
              How?
            </button>
          ) : null}
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-muted text-lg leading-none px-1">
            ✕
          </button>
        </div>
        
        {showIOSInstructions && isIOSDevice && (
          <div className="mt-4 pt-4 border-t border-line">
            <div className="text-xs text-muted space-y-2">
              <p className="font-semibold">To install this app on iOS:</p>
                             <div className="space-y-1">
                 <p>1. Tap the Share button <span className="inline-block">📤</span></p>
                 <p>2. Scroll down and tap &quot;Add to Home Screen&quot;</p>
                 <p>3. Tap &quot;Add&quot; to confirm</p>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
