/**
 * 인증이 필요한 이미지.
 *
 * access 토큰은 메모리에만 있고 쿠키가 아니라서, 브라우저가 스스로 여는
 * `<img src="/api/...">` 요청에는 실리지 않는다. 그래서 평범한 `<img>` 는 항상
 * 401 이 나고, 화면에는 깨진 이미지 아이콘만 남아 원인을 알 수 없다.
 *
 * 토큰을 붙여 blob 으로 받아 온 뒤 objectURL 로 그린다. 언마운트하거나 경로가
 * 바뀌면 이전 URL 을 반드시 반납한다 — 안 하면 탭을 닫을 때까지 메모리에 남고,
 * 이미지가 많은 카드를 오가면 눈에 띄게 쌓인다.
 *
 * 사용:
 *   <AuthedImage path={`/cards/${cardId}/images/${id}/file`} alt={name} />
 *   <Thumb as={AuthedImage} path={...} alt={...} />   // styled 로 감싼 경우
 */

import React, { useEffect, useState } from 'react'

import { fetchBlobUrl } from '../api/client'

export function AuthedImage({ path, alt = '', ...rest }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    if (!path) {
      setUrl(null)
      return undefined
    }

    let cancelled = false
    let created = null

    fetchBlobUrl(path)
      .then((objectUrl) => {
        if (cancelled) {
          // 이미 화면을 떠났다. 만들어진 URL 을 그대로 두면 새는 자리가 된다.
          URL.revokeObjectURL(objectUrl)
          return
        }
        created = objectUrl
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })

    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [path])

  // 아직 못 받았으면 자리만 잡아 둔다. src 를 비운 <img> 를 그리면 브라우저가
  // 현재 페이지를 다시 요청하는 브라우저가 있다.
  if (!url) return <span {...rest} aria-label={alt} />

  return <img src={url} alt={alt} {...rest} />
}

export default AuthedImage
