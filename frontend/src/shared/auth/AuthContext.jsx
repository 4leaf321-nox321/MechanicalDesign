/**
 * 인증 상태.
 *
 * 새로고침하면 메모리의 access 토큰이 사라지므로, 앱이 뜰 때 refresh 쿠키로 한
 * 번 갱신을 시도한다. 성공하면 로그인 상태가 유지되고 실패하면 익명이다 —
 * 사용자 눈에는 "로그인이 유지되는" 것으로 보인다.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api, session } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // 'loading' 동안에는 아무것도 판단하지 않는다. 이 상태가 없으면 갱신이
  // 끝나기 전에 ProtectedRoute 가 익명으로 보고 로그인 화면을 한 번 스쳐 간다.
  const [status, setStatus] = useState('loading')
  const [user, setUser] = useState(null)

  const clear = useCallback(() => {
    session.setToken(null)
    setUser(null)
    setStatus('anonymous')
  }, [])

  useEffect(() => {
    let cancelled = false
    session.onLost(() => {
      if (!cancelled) clear()
    })

    api
      .post('/auth/refresh')
      .then((body) => {
        if (cancelled) return
        session.setToken(body.access_token)
        setUser(body.user)
        setStatus('authenticated')
      })
      .catch(() => {
        if (!cancelled) clear()
      })

    return () => {
      cancelled = true
      session.onLost(null)
    }
  }, [clear])

  const login = useCallback(async (email, password) => {
    const body = await api.post('/auth/login', { email, password })
    session.setToken(body.access_token)
    setUser(body.user)
    setStatus('authenticated')
    return body.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      // 서버 호출이 실패해도 이 브라우저에서는 로그아웃되어야 한다.
      clear()
    }
  }, [clear])

  const reload = useCallback(async () => {
    const me = await api.get('/auth/me')
    setUser(me)
    return me
  }, [])

  const value = useMemo(
    () => ({ status, user, login, logout, reload, clear }),
    [status, user, login, logout, reload, clear],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있습니다')
  return value
}
