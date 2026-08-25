import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// 색과 글꼴의 한 벌. 어느 화면보다 먼저 실려야 한다.
// MatNexus 와 같은 Geist. 토큰보다 먼저 실어야 첫 그림에서 글꼴이 안 바뀐다.
import '@fontsource-variable/geist'
import './styles/tokens.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
