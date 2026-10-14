// Mock de expo-notifications para TODOS os testes (moduleNameMapper do package.json, 14/10/2026). Não use
// jest.mock local apontando para este arquivo: com o mapeamento global isso entra em recursão infinita.
export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';
export const AndroidImportance = { DEFAULT: 3 };
export const SchedulableTriggerInputTypes = { WEEKLY: 'weekly', DAILY: 'daily' };

export const getAllScheduledNotificationsAsync = jest.fn(async () => [] as { identifier: string }[]);
export const cancelScheduledNotificationAsync = jest.fn(async () => {});
export const scheduleNotificationAsync = jest.fn(async () => 'id');
export const setNotificationChannelAsync = jest.fn(async () => null);
export const getPermissionsAsync = jest.fn(async () => ({ granted: false, canAskAgain: true }));
export const requestPermissionsAsync = jest.fn(async () => ({ granted: true, canAskAgain: true }));
export const setNotificationHandler = jest.fn();
export const getLastNotificationResponse = jest.fn(() => null as unknown);
export const clearLastNotificationResponse = jest.fn();
export const addNotificationResponseReceivedListener = jest.fn(() => ({ remove: jest.fn() }));
