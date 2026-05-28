import React from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import MainPage from './pages/MainPage'
import ModulePlaceholder from './shared/components/ModulePlaceholder'

// ============================================
// 모듈 임포트 - 새 모듈 구현 시 여기에 import 후 라우트 등록
// ============================================

function AppRoutes() {
  const navigate = useNavigate()
  const handleGoHome = () => navigate('/')

  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      {/* 아직 구현되지 않은 카드는 placeholder 페이지로 이동 */}
      <Route path="/*" element={<ModulePlaceholder onGoHome={handleGoHome} />} />
    </Routes>
  )
}

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  )
}

export default App
