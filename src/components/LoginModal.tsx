import React, { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode-generator'

interface LoginModalProps {
  onClose: () => void
  onLoggedIn: () => void
}

const LoginModal: React.FC<LoginModalProps> = ({ onClose, onLoggedIn }) => {
  const qrContainerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('loading')
  const polling = useRef(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    initQr()
    return () => {
      polling.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const initQr = async () => {
    setStatus('loading')
    try {
      const res = await window.electronAPI!.loginGetQr()
      if (res.success && res.qrUrl) {
        // 使用 qrcode-generator 生成表格
        const qr = QRCode(0, 'L')
        qr.addData(res.qrUrl)
        qr.make()
        if (qrContainerRef.current) {
          qrContainerRef.current.innerHTML = qr.createTableTag(6)
        }
        setStatus('waiting')
        startPolling()
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  const startPolling = () => {
    polling.current = true
    const poll = async () => {
      if (!polling.current) return
      try {
        const result = await window.electronAPI!.loginCheckStatus()
        if (result.status === 'success') {
          onLoggedIn()
          return
        }
        if (result.status === 'expired') {
          setStatus('expired')
          return
        }
        if (result.status === 'scanned') {
          setStatus('scanned')
        } else if (result.status === 'waiting') {
          setStatus('waiting')
        } else if (result.status === 'error') {
          setStatus('error')
        }
        timerRef.current = window.setTimeout(poll, 2000)
      } catch {
        timerRef.current = window.setTimeout(poll, 2000)
      }
    }
    poll()
  }

  const handleClose = () => {
    polling.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    onClose()
  }

  // 下载 qrcode-generator 的包（如果没有安装）
  // pnpm add qrcode-generator
  // @types/qrcode-generator 可选

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, width: 320, boxShadow: '0 10px 40px rgba(0,0,0,0.2)', padding: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>登录 Bilibili</h2>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>
            ×
          </button>
        </div>
        <div style={{ textAlign: 'center', minHeight: 220 }}>
          {status === 'loading' && <p style={{ color: '#666' }}>正在生成二维码...</p>}
          {status === 'error' && (
            <div>
              <p style={{ color: '#e74c3c' }}>获取二维码失败</p>
              <button onClick={initQr} style={{ cursor: 'pointer', padding: '4px 10px' }}>重试</button>
            </div>
          )}
          {status === 'expired' && (
            <div>
              <p style={{ color: '#e67e22' }}>二维码已过期</p>
              <button onClick={initQr} style={{ cursor: 'pointer', padding: '4px 10px' }}>刷新</button>
            </div>
          )}
          {(status === 'waiting' || status === 'scanned') && (
            <div>
              <div ref={qrContainerRef} style={{ display: 'inline-block', marginBottom: 10 }}></div>
              <p style={{ color: '#333' }}>
                {status === 'scanned' ? '已扫描，请在手机确认' : '请使用 Bilibili App 扫码登录'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LoginModal