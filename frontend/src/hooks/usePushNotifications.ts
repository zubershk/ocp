import { useState, useCallback } from 'react';

interface PushState {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
}

export function usePushNotifications(restaurantName?: string) {
  const [state, setState] = useState<PushState>({
    supported: 'Notification' in window,
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
    subscribed: false,
  });

  const requestPermission = useCallback(async () => {
    if (!state.supported) return false;
    const perm = await Notification.requestPermission();
    setState((prev) => ({ ...prev, permission: perm }));
    return perm === 'granted';
  }, [state.supported]);

  const subscribe = useCallback(async () => {
    if (!state.supported || state.permission !== 'granted') return false;
    try {
      // In production, you'd register with your push service (e.g., Firebase Cloud Messaging)
      // For now, show a test notification
      new Notification(restaurantName || 'Orange Cheese Pizza', {
        body: 'You\'ll be notified when your order status changes!',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
      });
      setState((prev) => ({ ...prev, subscribed: true }));
      return true;
    } catch {
      return false;
    }
  }, [state.supported, state.permission]);

  const sendNotification = useCallback((title: string, body: string, options?: NotificationOptions) => {
    if (state.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.svg', badge: '/favicon.svg', ...options });
    }
  }, [state.permission]);

  return { ...state, requestPermission, subscribe, sendNotification };
}
