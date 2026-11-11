import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.haruapps.harumusic',
  appName: 'HaruMusic',
  webDir: 'out/renderer',
  server: {
    androidScheme: 'https'
  },
  android: {
    // The embedded Node API is loopback-only HTTP. The Android network security
    // config below keeps cleartext enabled for localhost/127.0.0.1 only.
    allowMixedContent: process.env.CAPACITOR_ALLOW_MIXED_CONTENT === '1'
  },
  plugins: {
    SystemBars: { insetsHandling: 'disable' },
    Nodejs: {
      nodeDir: 'nodejs',
      startMode: 'manual'
    },
    StatusBar: {
      overlaysWebView: true,
      backgroundColor: '#ffffff'
    }
  }
};

export default config;
