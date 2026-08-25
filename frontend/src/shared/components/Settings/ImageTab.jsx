import React, { useState, useRef } from 'react'
import styled from 'styled-components'
import { apiFetch } from '../../api/client'
import AuthedImage from '../AuthedImage'
import { TabPane, TabScroll, TabToolbar } from './TabLayout'
import { useDialog } from '../Dialog'


/**
 * 이미지 목록을 여러 열로 편다.
 *
 * 썸네일 한 장과 파일명만 있는 줄이 모달 너비만큼 늘어나면 오른쪽이 통째로
 * 비고, 장수가 늘수록 세로로만 길어진다. 카드가 좁아도 읽을 것이 적어서
 * 최소 너비를 변수·표보다 작게 잡는다.
 */
const ImgGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
  align-items: start;
`

const Card = styled.div`
  background: hsl(var(--surface-2));
  border: 1px solid hsl(var(--surface-2));
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
`

const Thumb = styled.img`
  width: 72px;
  height: 72px;
  object-fit: contain;
  background: hsl(var(--surface));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  flex-shrink: 0;
`

const Meta = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`

const Filename = styled.div`
  font-weight: 600;
  font-size: 0.9rem;
  color: hsl(var(--fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Select = styled.select`
  padding: 6px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.85rem;
  outline: none;
  background: hsl(var(--surface));
  cursor: pointer;
  &:focus { border-color: hsl(var(--primary)); }
`

const IconBtn = styled.button`
  background: none;
  border: none;
  color: hsl(var(--fg-subtle));
  cursor: pointer;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  &:hover { background: hsl(var(--danger-soft)); color: hsl(var(--danger)); }
`

const UploadRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
`

const FileButton = styled.label`
  padding: 10px 20px;
  background: hsl(var(--surface));
  color: hsl(var(--primary));
  border: 1px dashed hsl(var(--primary));
  border-radius: var(--radius);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: hsl(var(--primary-soft)); }
  input { display: none; }
`

const FileName = styled.span`
  font-size: 0.85rem;
  color: hsl(var(--fg-muted));
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const AddBtn = styled.button`
  padding: 10px 20px;
  background: hsl(var(--primary));
  color: white;
  border: none;
  border-radius: var(--radius);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: hsl(var(--primary)); }
  &:disabled { background: hsl(var(--primary) / 0.45); cursor: not-allowed; }
`

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: hsl(var(--border-strong));
  font-size: 0.95rem;
`

const ErrorMsg = styled.p`
  color: hsl(var(--danger));
  font-size: 0.85rem;
  margin: 8px 0 0 0;
`

function ImageTab({ cardId, images, onRefresh }) {
  const { confirm } = useDialog()
  const [pendingFile, setPendingFile] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const handleUpload = async () => {
    if (!pendingFile) return
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      const res = await apiFetch(`/cards/${cardId}/images`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || '업로드 실패')
        return
      }
      setPendingFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onRefresh()
    } catch {
      setError('서버 통신 실패')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: '이 이미지를 삭제합니다',
      body: '이 이미지를 쓰는 배치에서도 사라집니다.',
      confirmLabel: '삭제',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await apiFetch(`/cards/${cardId}/images/${id}`, { method: 'DELETE' })
      onRefresh()
    } catch {
      setError('삭제 실패')
    }
  }

  return (
    <TabPane>
      <TabToolbar>
        <UploadRow>
          <FileButton>
            파일 선택
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => { setPendingFile(e.target.files?.[0] || null); setError('') }}
            />
          </FileButton>
          <FileName>{pendingFile ? pendingFile.name : '선택된 파일 없음'}</FileName>
          <AddBtn onClick={handleUpload} disabled={!pendingFile || uploading}>
            {uploading ? '업로드 중...' : '업로드'}
          </AddBtn>
        </UploadRow>
        {error && <ErrorMsg>{error}</ErrorMsg>}
      </TabToolbar>
      <TabScroll>
      {images.length === 0 ? (
        <EmptyState>등록된 이미지가 없습니다.</EmptyState>
      ) : (
        <ImgGrid>
        {images.map(img => (
          <Card key={img.id}>
            <Thumb as={AuthedImage} path={`/cards/${cardId}/images/${img.id}/file`} alt={img.filename} />
            <Meta>
              <Filename title={img.filename}>{img.filename}</Filename>
            </Meta>
            <IconBtn onClick={() => handleDelete(img.id)}>삭제</IconBtn>
          </Card>
        ))}
        </ImgGrid>
      )}
      </TabScroll>
    </TabPane>
  )
}

export default ImageTab
