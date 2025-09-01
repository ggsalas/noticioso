import { storageService } from "./StorageService";

describe("StorageService", () => {
  beforeEach(async () => {
    await storageService.clear();
  });

  afterEach(async () => {
    await storageService.clear();
  });

  test("should store and retrieve a string value", async () => {
    const key = "testString";
    const value = "Hello World";
    
    await storageService.setItem(key, value);
    const result = await storageService.getItem<string>(key);
    
    expect(result).toBe(value);
  });

  test("should store and retrieve an object value", async () => {
    const key = "testObject";
    const value = { name: "Test", count: 42 };
    
    await storageService.setItem(key, value);
    const result = await storageService.getItem<typeof value>(key);
    
    expect(result).toEqual(value);
  });

  test("should return null for non-existent key", async () => {
    const result = await storageService.getItem("nonexistent");
    expect(result).toBeNull();
  });

  test("should remove an item", async () => {
    const key = "testRemove";
    const value = "test value";
    
    await storageService.setItem(key, value);
    await storageService.removeItem(key);
    const result = await storageService.getItem(key);
    
    expect(result).toBeNull();
  });

  test("should clear all items", async () => {
    await storageService.setItem("key1", "value1");
    await storageService.setItem("key2", "value2");
    
    await storageService.clear();
    
    const result1 = await storageService.getItem("key1");
    const result2 = await storageService.getItem("key2");
    
    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });

  test("should handle array values", async () => {
    const key = "testArray";
    const value = [1, 2, 3, "test"];
    
    await storageService.setItem(key, value);
    const result = await storageService.getItem<typeof value>(key);
    
    expect(result).toEqual(value);
  });
});