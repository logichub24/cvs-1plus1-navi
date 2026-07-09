// 토스인앱(Apps in Toss) 빌드용 스크립트.
// granite.config.ts의 web.commands.build/dev에서 호출됨.
// 정적 HTML 앱이라 별도 번들러 없이, 필요한 파일만 dist/로 복사한다.
// stores/, deals.json은 복사하지 않음 - 런타임에 DATA_BASE_URL(GitHub Pages)에서 직접 fetch하므로
// 번들에 포함시키면 용량만 커지고 어차피 매일 새벽 갱신되는 데이터라 의미 없음.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC_DIR = path.join(__dirname, '..', '편의점 행사');
const DIST_DIR = path.join(__dirname, '..', 'dist');

fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

fs.copyFileSync(path.join(SRC_DIR, '1_1.html'), path.join(DIST_DIR, 'index.html'));

// Tailwind를 미리 컴파일해 styles.css 생성. Play CDN(런타임 컴파일) 대신 정적 CSS를 써서 로딩·FPS 개선.
// HTML의 실제 사용 클래스만 스캔하므로, 클래스가 바뀌면 빌드 때마다 자동으로 최신화된다(스타일 깨짐 방지).
const tailwind = path.join(__dirname, '..', 'node_modules', '.bin', 'tailwindcss');
const twInput = path.join(SRC_DIR, 'tailwind.input.css');
const twOutput = path.join(SRC_DIR, 'styles.css');
execSync(
  `"${tailwind}" -i "${twInput}" -o "${twOutput}" --content "${path.join(SRC_DIR, '1_1.html')}" --minify`,
  { stdio: 'inherit' }
);
fs.copyFileSync(twOutput, path.join(DIST_DIR, 'styles.css'));

// ads.js는 @apps-in-toss/web-bridge를 esm.sh CDN이 아닌 로컬 패키지로 번들링한다.
// WebView 환경에서 외부 CDN 접근이 차단될 수 있어 번들로 내장해야 광고 SDK가 동작한다.
const adsSrc = path.join(SRC_DIR, 'ads.js');
const adsDist = path.join(DIST_DIR, 'ads.js');
const esbuild = path.join(__dirname, '..', 'node_modules', '.bin', 'esbuild');
execSync(
  `"${esbuild}" "${adsSrc}" --bundle --format=esm --outfile="${adsDist}" --platform=browser`,
  { stdio: 'inherit' }
);

for (const file of fs.readdirSync(SRC_DIR)) {
  if (/^icon.*\.(png|svg)$/.test(file)) {
    fs.copyFileSync(path.join(SRC_DIR, file), path.join(DIST_DIR, file));
  }
}

console.log('토스 빌드 완료:', DIST_DIR);
