import React from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import MainPage from './pages/MainPage'
import ModulePlaceholder from './shared/components/ModulePlaceholder'
import { AuthProvider } from './shared/auth/AuthContext'
import ProtectedRoute from './shared/auth/ProtectedRoute'
import LoginPage from './modules/auth/LoginPage'
import SignupPage from './modules/auth/SignupPage'
import ChangePasswordPage from './modules/auth/ChangePasswordPage'
import TokensPage from './modules/auth/TokensPage'
import RecordsPage from './modules/records/RecordsPage'
import WorkflowEditorPage from './modules/workflows/WorkflowEditorPage'
import RecordDetailPage from './modules/records/RecordDetailPage'
import AccountsAdminPage from './modules/accounts/AccountsAdminPage'

// ============================================
// 모듈 임포트 - 새 모듈 구현 시 여기에 import 후 라우트 등록
// ============================================

function AppRoutes() {
  const navigate = useNavigate()
  const handleGoHome = () => navigate('/')

  return (
    <Routes>
      {/* 인증 밖 — 로그인 화면 자체를 막으면 로그인할 방법이 없다 */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* 로그인 필요. 자료 화면은 전부 이 안에 둔다 */}
      <Route element={<ProtectedRoute />}>
        {/* 비밀번호 강제 변경 화면은 가드가 따로 예외 처리한다 —
            이 화면까지 막으면 강제 변경에서 빠져나올 수 없다 */}
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/records/:recordId" element={<RecordDetailPage />} />
        <Route path="/" element={<MainPage />} />
        {/* 카드 catch-all(/*) 보다 **먼저** 와야 한다. 뒤에 두면 워크플로
            주소도 카드 화면이 잡아 빈 화면이 된다. */}
        <Route path="/wf/*" element={<WorkflowEditorPage />} />
        <Route path="/*" element={<ModulePlaceholder onGoHome={handleGoHome} />} />
      </Route>

      {/* 관리자 전용 */}
      <Route element={<ProtectedRoute adminOnly />}>
        <Route path="/accounts" element={<AccountsAdminPage />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <Router>
      {/* Router 안쪽에 둔다. 세션이 끊겼을 때 로그인 화면으로 보내려면
          AuthProvider 가 라우터 컨텍스트 안에 있어야 한다. */}
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  )
}

export default App
