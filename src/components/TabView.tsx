import React, { useState, useEffect } from 'react'
import { useTabs } from '../contexts/TabContext'
import Home from '../pages/Home'
import Video from '../pages/Video'
import Search from '../pages/Search'
import MarkedUps from '../pages/MarkedUps'
import { REGION_IDS } from '../services/biliApi'
import LoginModal from './LoginModal'

const regionNames = Object.keys(REGION_IDS)

const TabView: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, closeTab, updateTabTitle, openTab, openSearchTab } = useTabs()
  const [activeView, setActiveView] = useState<'home' | { region: string }>('home')
  const [visitedRegions, setVisitedRegions] = useState<string[]>([]) // 访问过的分区（每个保留独立缓存）
  const [searchText, setSearchText] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [showMarkedUps, setShowMarkedUps] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (window.electronAPI) window.electronAPI.isLoggedIn().then(setIsLoggedIn)
  }, [])

  const handleSearch = () => {
    if (searchText.trim()) {
      openSearchTab(searchText.trim())
      setSearchText('')
    }
  }

  const handleLoggedIn = () => {
    setIsLoggedIn(true)
    setShowLogin(false)
    setReloadKey(prev => prev + 1)
  }

  const [confirmLogout, setConfirmLogout] = useState(false)

  const handleLogout = async () => {
    setConfirmLogout(true)
  }

  const doLogout = async () => {
    await window.electronAPI!.logout()
    setIsLoggedIn(false)
    setReloadKey(prev => prev + 1)
    setConfirmLogout(false)
  }

  const getWebviewRef = (id: string) => (el: HTMLWebViewElement | null) => {
    if (el) {
      el.addEventListener('page-title-updated', (e: any) => updateTabTitle(id, e.title))
    }
  }

  // 活动标签
  const activeTab = tabs.find(t => t.id === activeTabId)
  const isHomeActive = activeTabId === 'home'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#fff' }}>
      {/* 标签栏 */}
      <div style={{
        display: 'flex', background: '#f0f0f0', borderBottom: '1px solid #ddd', height: '36px', alignItems: 'center', padding: '0 4px', flexShrink: 0,
        WebkitAppRegion: 'drag', userSelect: 'none',
      }}>
        <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
          {tabs.map(tab => (
            <div key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '4px 8px', borderRadius: '6px 6px 0 0', marginRight: '2px', cursor: 'pointer',
                background: activeTabId === tab.id ? '#fff' : '#e0e0e0',
                border: activeTabId === tab.id ? '1px solid #ddd' : '1px solid transparent',
                borderBottom: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', maxWidth: '160px', flexShrink: 0, WebkitAppRegion: 'no-drag',
              }}>
              <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{tab.title}</span>
              {tab.id !== 'home' && (
                <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                  style={{ marginLeft: '6px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: '#999', padding: 0, lineHeight: 1 }}
                >×</button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px', WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={() => { setActiveTab('home'); setShowMarkedUps(v => !v) }}
            title="查看已收藏UP主"
            style={{
              background: showMarkedUps ? '#fce4ec' : 'none',
              border: '1px solid #ddd', borderRadius: '4px', padding: '0 8px',
              fontSize: '12px', cursor: 'pointer', color: showMarkedUps ? '#fb7299' : '#666', height: '24px',
            }}
          >★ 收藏</button>
          {isLoggedIn ? (
            <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '4px', padding: '0 8px', fontSize: '12px', cursor: 'pointer', color: '#666', height: '24px' }}>已登录</button>
          ) : (
            <button onClick={() => setShowLogin(true)} style={{ background: '#fb7299', border: 'none', borderRadius: '4px', padding: '0 8px', fontSize: '12px', cursor: 'pointer', color: 'white', height: '24px' }}>登录</button>
          )}
        </div>
        <div style={{ display: 'flex', height: '100%', marginLeft: '4px', WebkitAppRegion: 'no-drag' }}>
          {/* 窗口控制按钮 */}
          <button className="window-btn minimize-btn" onClick={() => window.electronAPI?.minimize()}>
            <svg viewBox="0 0 14 14"><rect y="6" width="14" height="1.5" fill="currentColor"/></svg>
          </button>
          <button className="window-btn maximize-btn" onClick={() => window.electronAPI?.maximize()}>
            <svg viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
          <button className="window-btn close-btn" onClick={() => window.electronAPI?.close()}>
            <svg viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5"/><line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* 主页标签：侧栏+内容 —— 始终挂载，CSS 显隐 */}
        <div style={{ display: isHomeActive ? 'flex' : 'none', height: '100%', width: '100%' }}>
          {showMarkedUps ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', WebkitAppRegion: 'no-drag' }}>
              <MarkedUps isLoggedIn={isLoggedIn} />
            </div>
          ) : (
            <>
              <div id="sidebar" style={{
                width: '200px', borderRight: '1px solid #eee', background: '#fafafa', height: '100%',
                overflowY: 'auto', WebkitAppRegion: 'no-drag',
              }}>
                <div style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', background: 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
                    <input
                      type="text" placeholder="搜索..." value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      style={{ border: 'none', outline: 'none', flex: 1, padding: '6px 8px', fontSize: '13px', borderRadius: '4px 0 0 4px' }}
                    />
                    <button onClick={handleSearch} style={{ background: 'none', border: 'none', padding: '6px 10px', cursor: 'pointer', color: '#fb7299' }}>🔍</button>
                  </div>
                </div>
                <ul className="nav-list" style={{ listStyle: 'none', padding: 0 }}>
                  <li className={`nav-item ${activeView === 'home' ? 'active' : ''}`} onClick={() => setActiveView('home')} style={{ padding: '10px 20px', cursor: 'pointer' }}>推荐</li>
                  <li style={{ padding: '6px 20px', fontSize: '12px', color: '#999', marginTop: '8px' }}>分区</li>
                  {regionNames.map(region => (
                    <li key={region} className={`nav-item ${typeof activeView !== 'string' && activeView.region === region ? 'active' : ''}`} onClick={() => { setActiveView({ region }); setVisitedRegions(prev => prev.includes(region) ? prev : [...prev, region]) }} style={{ padding: '8px 20px 8px 30px', cursor: 'pointer', fontSize: '14px' }}>{region}</li>
                  ))}
                </ul>
              </div>
              <div id="content-area" style={{ flex: 1, overflowY: 'auto', padding: '20px', WebkitAppRegion: 'no-drag' }}>
                <div style={{ display: activeView === 'home' ? 'block' : 'none' }}><Home key={`home-${reloadKey}`} /></div>
                {visitedRegions.map(r => (
                  <div key={r} style={{ display: activeView !== 'home' && activeView.region === r ? 'block' : 'none' }}>
                    <Video key={`video-${r}-${reloadKey}`} region={r} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 搜索标签 —— 每个始终挂载，CSS 显隐 */}
        {tabs.filter(t => t.type === 'search').map(tab => (
          <div key={tab.id} style={{ display: activeTabId === tab.id ? 'block' : 'none', height: '100%', width: '100%' }}>
            <Search keyword={tab.url} onClose={() => closeTab(tab.id)} />
          </div>
        ))}

        {/* Webview 标签 —— 每个始终挂载，CSS 显隐 */}
        {tabs.filter(t => t.type === 'webview').map(tab => (
          <webview
            key={tab.id}
            src={tab.url}
            ref={getWebviewRef(tab.id)}
            style={{
              display: activeTabId === tab.id ? 'flex' : 'none',
              width: '100%', height: '100%', position: 'absolute', top: 0, left: 0,
            }}
          />
        ))}
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLoggedIn={handleLoggedIn} />}

      {confirmLogout && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2001 }} onClick={() => setConfirmLogout(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 30, width: 360, textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, margin: '0 0 24px', color: '#333' }}>确定要退出登录吗？</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={() => setConfirmLogout(false)} style={{ padding: '8px 32px', borderRadius: 6, border: '1px solid #ddd', background: '#f5f5f5', color: '#666', cursor: 'pointer', fontSize: 14 }}>取消</button>
              <button onClick={doLogout} style={{ padding: '8px 32px', borderRadius: 6, border: 'none', background: '#fb7299', color: '#fff', cursor: 'pointer', fontSize: 14 }}>确定退出</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TabView