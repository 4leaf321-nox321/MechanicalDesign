import React, { useState, useRef } from 'react'
import styled from 'styled-components'
import { apiFetch } from '../../api/client'
import AuthedImage from '../AuthedImage'
import { TabPane, TabScroll, TabToolbar } from './TabLayout'


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
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
`

const Thumb = styled.img`
  width: 72px;
  height: 72px;
  object-fit: contain;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
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
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Select = styled.select`
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
  outline: none;
  background: white;
  cursor: pointer;
  &:focus { border-color: #3498db; }
`

const IconBtn = styled.button`
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.85rem;
  &:hover { background: #fee; color: #e74c3c; }
`

const UploadRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
`

const FileButton = styled.label`
  padding: 10px 20px;
  background: white;
  color: #3498db;
  border: 1px dashed #3498db;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: #f0f8ff; }
  input { display: none; }
`

const FileName = styled.span`
  font-size: 0.85rem;
  color: #666;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const AddBtn = styled.button`
  padding: 10px 20px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: #2980b9; }
  &:disabled { background: #b0d4f1; cursor: not-allowed; }
`

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: #bbb;
  font-size: 0.95rem;
`

const ErrorMsg = styled.p`
  color: #e74c3c;
  font-size: 0.85rem;
  margin: 8px 0 0 0;
`

function ImageTab({ cardId, images, onRefresh }) {
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
    if (!window.confirm('이 이미지를 삭제하시겠습니까?')) return
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
