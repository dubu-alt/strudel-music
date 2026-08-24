// GitHub Pages 배포용 Vite 설정
import { defineConfig } from 'vite';

export default defineConfig({
  // 저장소 이름이 경로에 포함되므로 base 설정 필수
  base: '/strudel-music/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        midi: 'midi.html',
        mp3: 'mp3.html',
      },
    },
  },
});
