import React from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import MainPage from './pages/MainPage'
import ModulePlaceholder from './shared/components/ModulePlaceholder'
import { AuthProvider } from './shared/auth/AuthContext'
import { ThemeProvider } from './shared/theme/ThemeContext'
import { DialogProvider } from './shared/components/Dialog'
import ProtectedRoute from './shared/auth/ProtectedRoute'
import AppShell from './shared/components/AppShell'
import LoginPage from './modules/auth/LoginPage'
import SignupPage from './modules/auth/SignupPage'
import ChangePasswordPage from './modules/auth/ChangePasswordPage'
import TokensPage from './modules/auth/TokensPage'
import RecordsPage from './modules/records/RecordsPage'
import WorkflowEditorPage from './modules/workflows/WorkflowEditorPage'
import RecordDetailPage from './modules/records/RecordDetailPage'
import RecordComparePage from './modules/records/RecordComparePage'
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
            이 화면까지 막으면 강제 변경에서 빠져나올 수 없다.
            껍데기 **밖**에 둔다 — 사이드바로 딴 데 갈 수 있으면
            강제 변경이 강제가 아니게 된다. */}
        <Route path="/change-password" element={<ChangePasswordPage />} />

        {/* 여기부터는 왼쪽 사이드바가 늘 붙는다. 조직 트리가 이 앱의
            길잡이라 화면이 바뀌어도 사라지면 안 된다. */}
        <Route element={<AppShell />}>
          <Route path="/tokens" element={<TokensPage />} />
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/records/compare" element={<RecordComparePage />} />
          <Route path="/records/:recordId" element={<RecordDetailPage />} />
          <Route path="/" element={<MainPage />} />
        {/* 카드 catch-all(/*) 보다 **먼저** 와야 한다. 뒤에 두면 워크플로
            주소도 카드 화면이 잡아 빈 화면이 된다. */}
          <Route path="/wf/*" element={<WorkflowEditorPage />} />
          <Route path="/*"
                 element={<ModulePlaceholder onGoHome={handleGoHome} />} />
        </Route>
      </Route>

      {/* 관리자 전용. 여기도 사이드바를 붙인다 — 계정 관리를 보다가
          카드로 돌아가는 일이 잦다. */}
      <Route element={<ProtectedRoute adminOnly />}>
        <Route element={<AppShell />}>
          <Route path="/accounts" element={<AccountsAdminPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

function App() {
  // 판(밝음·어두움)은 로그인 화면에도 있어야 한다. 그래서 제일 바깥이다.
  return (
    <ThemeProvider>
      {/* 묻는 창은 어느 화면에서도 뜬다. 라우터 바깥이면 창 안에서 화면을
          옮길 수 없으니 안쪽에 두되, 화면들보다는 위에 둔다. */}
      <Router>
        {/* Router 안쪽에 둔다. 세션이 끊겼을 때 로그인 화면으로 보내려면
            AuthProvider 가 라우터 컨텍스트 안에 있어야 한다. */}
        <AuthProvider>
          <DialogProvider>
            <AppRoutes />
          </DialogProvider>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  )
}

export default App
