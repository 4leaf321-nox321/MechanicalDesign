import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000,

        // **브라우저가 실제로 친 주소를 백엔드에 알려 준다.**
        //
        // changeOrigin 이 켜져 있으면 Vite 가 Host 를 프록시 대상(127.0.0.1:5176)
        // 으로 바꿔 버린다. 그러면 백엔드는 사용자가 어느 주소로 들어왔는지
        // 알 수 없고, 그 주소를 써서 만드는 값(토큰 화면의 MCP 등록 명령)이
        // 개발 중에는 늘 127.0.0.1 로 나온다. 옆 사람이 내 PC 로 접속해
        // 그 명령을 복사해 가면 자기 PC 를 가리키게 된다.
        //
        // 운영에는 프록시가 없어(백엔드가 SPA 까지 서빙) 이런 일이 없다.
        // 그래서 **개발에서만 다르게 보이는** 차이가 되는데, 그런 차이는
        // 개발 중에 확인할 수 없게 만들어서 더 나쁘다.
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            const host = req.headers.host
            if (host) proxyReq.setHeader('X-Forwarded-Host', host)
          })
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
