// Force a test-mode React build. @testing-library/react-native's `act` helper
// (and the React it drives) assume NODE_ENV is 'test' or 'development'; a
// NODE_ENV=production in the shell makes act a no-op and every render throws
// "actImplementation is not a function". This must run before any React module
// is imported, so it lives at the top of a setupFile (RNTL/React are only
// imported later, by the test files).
process.env.NODE_ENV = 'test';

// Mock expo-constants
jest.mock('expo-constants', () => ({
  appOwnership: 'expo',
  executionEnvironment: 'storeClient',
  expoConfig: {
    extra: {
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
    },
  },
  ExecutionEnvironment: {
    Bare: 'bare',
    Standalone: 'standalone',
    StoreClient: 'storeClient',
  },
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  Paths: {
    document: '/mock/documents',
    cache: '/mock/cache',
  },
  File: class File {
    constructor(path, uri) {
      this.path = path;
      this.uri = uri;
      this.exists = false;
    }
    copySync() {}
  },
}));

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    withTransactionAsync: jest.fn((fn) => fn()),
    closeSync: jest.fn(),
  })),
}));

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiGet: jest.fn().mockResolvedValue([]),
  multiSet: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
  getAllKeys: jest.fn().mockResolvedValue([]),
}));

// Mock expo-network
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
  }),
}));

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-document-picker
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ assets: [] }),
}));

// Mock lucide-react-native
jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy(
    {},
    {
      get: () => (props) => React.createElement('View', { ...props, testID: 'lucide-icon' }),
    }
  );
});

// Mock @expo-google-fonts/inter
jest.mock('@expo-google-fonts/inter', () => ({
  useFonts: () => [true, null],
  Inter_400Regular: {},
  Inter_500Medium: {},
  Inter_600SemiBold: {},
  Inter_700Bold: {},
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  return {
    ...require('react-native-reanimated/mock'),
    useSharedValue: () => ({ value: 0 }),
    useAnimatedStyle: () => ({}),
    withTiming: (to) => to,
    withSpring: (to) => to,
    interpolate: (value) => value,
    Extrapolate: { CLAMP: 'clamp' },
  };
});

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signInWithPassword: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      signUp: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
    })),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'test' }, error: null }),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://test.com' } })),
      })),
    },
  }),
  SupabaseAuthClient: class {},
  SupabaseClient: class {},
}));

// Mock expo-auth-session
jest.mock('expo-auth-session', () => ({
  useAuthRequest: () => [{}, () => {}],
  makeRedirectUri: () => 'exp://127.0.0.1:19000/--/auth',
  ResponseType: { Token: 'token' },
}));

// Mock expo-web-browser
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
  dismissAuthSession: jest.fn(),
}));

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  return {
    PanGestureHandler: ({ children }) => React.createElement('View', null, children),
    TapGestureHandler: ({ children, onHandlerStateChange }) => React.createElement('View', { onClick: onHandlerStateChange }, children),
    State: { END: 'END' },
  };
});

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }) => React.createElement('View', null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: ({ children }) => React.createElement('View', null, children),
  };
});

// Suppress console.error for expected warnings
const originalError = console.error;
console.error = (...args) => {
  if (
    args[0]?.includes?.('Warning: ReactDOM.render is no longer supported') ||
    args[0]?.includes?.('act(...)') ||
    args[0]?.includes?.('useLayoutEffect does nothing on the server')
  ) {
    return;
  }
  originalError.apply(console, args);
};