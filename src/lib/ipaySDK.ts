export const IPAY_PUBLIC_KEY = 'pk_0ac56b86849d4fdca1e44df11a7328e0';

export interface IPayCheckoutConfig {
  amount: string;
  environment: 'live' | 'test';
  key: string;
  transactionId: string;
  redirectUrl?: string;
  callbackUrl?: string;
}

export function loadIPaySDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="i-pay.money/checkout.js"]')) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://i-pay.money/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load iPay SDK'));

    document.body.appendChild(script);
  });
}

export function createIPayButton(config: IPayCheckoutConfig): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ipaymoney-button w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-semibold py-3 rounded-lg hover:from-amber-600 hover:to-yellow-700 transition-all';
  button.setAttribute('data-amount', config.amount);
  button.setAttribute('data-environement', config.environment);
  button.setAttribute('data-key', config.key);
  button.setAttribute('data-transaction-id', config.transactionId);

  if (config.redirectUrl) {
    button.setAttribute('data-redirect-url', config.redirectUrl);
  }

  if (config.callbackUrl) {
    button.setAttribute('data-callback-url', config.callbackUrl);
  }

  button.textContent = 'Payer avec iPay';

  return button;
}

export async function initializeIPayCheckout(
  containerId: string,
  config: IPayCheckoutConfig
): Promise<void> {
  await loadIPaySDK();

  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container with id "${containerId}" not found`);
  }

  const button = createIPayButton(config);
  container.appendChild(button);
}

export function generateTransactionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${timestamp}-${random}`;
}

export function getIPayCallbackUrl(paymentId: string): string {
  return `${window.location.origin}/api/ipay-callback?payment_id=${paymentId}`;
}

export function getIPayRedirectUrl(paymentId: string): string {
  return `${window.location.origin}/payment-status?payment_id=${paymentId}`;
}
