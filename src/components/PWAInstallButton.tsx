import { useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        className="pwa-install-btn"
        onClick={() => void install()}
        title="Install NEXUS as an offline desktop/mobile application"
      >
        <Download size={14} />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          className="pwa-install-btn"
          onClick={() => setShowIOSGuide(true)}
          title="Install NEXUS on iOS Safari"
        >
          <Download size={14} />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="pwa-ios-modal-backdrop" role="dialog" aria-modal="true" aria-label="Install on iPhone or iPad">
            <div className="pwa-ios-modal">
              <div className="pwa-ios-modal-head">
                <h3>Install NEXUS Offline</h3>
                <button
                  className="pwa-ios-close"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                >
                  <X size={15} />
                </button>
              </div>
              <ol className="pwa-ios-steps">
                <li>Tap the <strong>Share</strong> button in your Safari toolbar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              </ol>
              <button className="action-btn primary" onClick={() => setShowIOSGuide(false)}>
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="offline-status-banner" role="status" aria-live="polite">
      <WifiOff size={13} />
      <span>Offline Mode — Cached local indexes active</span>
    </div>
  );
}
