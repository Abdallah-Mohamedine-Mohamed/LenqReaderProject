export function generateDeviceFingerprint(): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let fingerprint = '';

  fingerprint += navigator.userAgent;
  fingerprint += navigator.language;
  fingerprint += screen.colorDepth;
  fingerprint += screen.width + 'x' + screen.height;
  fingerprint += new Date().getTimezoneOffset();
  fingerprint += navigator.hardwareConcurrency || '';
  fingerprint += (navigator as any).deviceMemory || '';

  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 100, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('Browser Fingerprint', 2, 2);
    fingerprint += canvas.toDataURL();
  }

  return hashString(fingerprint);
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function detectSuspiciousActivity(
  tokenData: any,
  currentDeviceFingerprint: string
): Promise<{ suspicious: boolean; reason: string } | null> {
  if (!tokenData.device_fingerprint) {
    return null;
  }

  if (tokenData.device_fingerprint !== currentDeviceFingerprint) {
    return {
      suspicious: true,
      reason: 'Device fingerprint mismatch - different device detected'
    };
  }

  if (tokenData.access_count >= tokenData.max_access_count) {
    return {
      suspicious: true,
      reason: 'Maximum access count exceeded'
    };
  }

  return null;
}
