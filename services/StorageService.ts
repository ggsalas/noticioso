import AsyncStorage from "@react-native-async-storage/async-storage";

export class StorageService {
  async getItem<T>(key: string): Promise<T | null> {
    let jsonValue: string | null;

    try {
      jsonValue = await AsyncStorage.getItem(key);
    } catch (error) {
      throw new Error(`Failed to get item with key "${key}": ${error}`);
    }

    // if the key do not exist in the store
    if (jsonValue === null) {
      return null;
    }

    try {
      return JSON.parse(jsonValue) as T;
    } catch {
      // If JSON parsing fails, return the raw value as T
      return jsonValue as T;
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const jsonValue = JSON.stringify(value);
      await AsyncStorage.setItem(key, jsonValue);
    } catch (error) {
      throw new Error(`Failed to set item with key "${key}": ${error}`);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      throw new Error(`Failed to remove item with key "${key}": ${error}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      throw new Error(`Failed to clear storage: ${error}`);
    }
  }
}

export const storageService = new StorageService();
