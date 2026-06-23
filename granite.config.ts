import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'cvs-event-navi', // 콘솔에 등록한 앱 ID와 반드시 일치해야 함
  brand: {
    displayName: '편의점 행사',
    primaryColor: '#2563eb',
    icon: 'https://static.toss.im/appsintoss/32449/88cb5d09-28bb-4f89-b645-e81c622d8a8f.png', // 콘솔에 등록한 로고와 정확히 일치해야 함
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
