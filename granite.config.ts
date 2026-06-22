import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'cvs-event-navi', // 콘솔에 등록한 앱 ID와 반드시 일치해야 함
  brand: {
    displayName: '편의점 행사',
    primaryColor: '#2563eb',
    icon: './편의점 행사/icon-512.png',
  },
  web: {
    host: 'localhost',
    port: 3000,
    commands: {
      dev: 'node scripts/build-toss.js',
      build: 'node scripts/build-toss.js',
    },
  },
  permissions: [
    { name: 'geolocation', access: 'access' },
  ],
  outdir: 'dist',
});
