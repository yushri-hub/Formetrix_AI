// src/services/StorageService.ts

export class StorageService {
  static save<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage save failed:', e);
      return false;
    }
  }

  static load<T>(key: string, defaultValue: T | null = null): T | null {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error('Storage load failed:', e);
      return defaultValue;
    }
  }

  static remove(key: string): boolean {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('Storage remove failed:', e);
      return false;
    }
  }
}