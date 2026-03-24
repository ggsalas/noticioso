// Mock AsyncStorage for Jest testing
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

// Enable jest-dom matchers from @testing-library/react-native
import "@testing-library/react-native/matchers";