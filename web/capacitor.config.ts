import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mailtasks.app',
  appName: 'MailTasks',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#4f46e5', showSpinner: false },
    LocalNotifications: { smallIcon: 'ic_stat_notify', iconColor: '#4f46e5' },
  },
}

export default config
