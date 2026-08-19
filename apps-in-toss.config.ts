import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 콘솔에 등록한 앱 ID와 반드시 일치해야 함
  appName: 'cvs-event-navi',

  brand: {
    primaryColor: '#2563eb'
  },

  permissions: [
    { name: 'geolocation', access: 'access' },
  ],

  webBundleDir: 'dist'
});
