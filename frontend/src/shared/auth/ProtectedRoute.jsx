/**
 * 인증 가드.
 *
 * 세 가지를 강제한다.
 *   1. 로그인하지 않았으면 로그인 화면으로 보내되 **원래 가려던 곳을 기억한다.**
 *      기억하지 않으면 링크로 받은 주소가 로그인 후 홈으로 흘러가 버린다.
 *   2. `must_change_password` 면 다른 화면을 못 쓰게 한다. 임시 비밀번호가
 *      그대로 남는 사고를 막는 것이 이 플래그의 존재 이유인데, 주소창에
 *      직접 쳐서 우회할 수 있으면 무의미하다.
 *   3. 관리자 전용 화면은 관리자만.
 */

import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import styled from 'styled-components'

import { useAuth } from './AuthContext'

const Center = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f2f5;
  color: #888;
  font-size: 0.95rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`

export function ProtectedRoute({ adminOnly = false }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <Center>확인 중…</Center>

  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (adminOnly && !user.is_admin) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default ProtectedRoute
