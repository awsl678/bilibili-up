import React, { useState, useRef } from 'react'
import { useTabs } from '../contexts/TabContext'
import Home from '../pages/Home'
import Video from '../pages/Video'
import { REGION_IDS } from '../services/biliApi'

const regionNames = Object.keys(REGION_IDS)

const TabView: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, closeTab, updateTabTitle } = useTabs()
  const webviewRefs = useRef<Record<string, HTMLWebViewElement>>({})
  const [activeView, setActiveView] = useState<'home' | { region: string }>('home')
  const [searchText, setSearchText] = useState('')

  const handleWebviewRef = (id: string) => (el: HTMLWebViewElement | null) => {
    if (el) {
      webviewRefs.current[id] = el
      el.addEventListener('page-title-updated', (e: any) => {
        updateTabTitle(id, e.title)
      })
    }
  }

  const handleSearch = () => {
    if (searchText.trim()) {
      alert('搜索功能开发中')
    }
  }

  // 主页内容组件
  const MainContent = (
    <div id="main-content" style={{ flex: 1, display: 'flex' }}>
      {/* 左侧导航 */}
      <div id="sidebar" style={{ width: '200px', borderRight: '1px solid #eee', background: '#fafafa' }}>
        <div style={{ padding: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
            <input
              type="text"
              placeholder="搜索..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ border: 'none', outline: 'none', flex: 1, padding: '6px 8px', fontSize: '13px', borderRadius: '4px 0 0 4px' }}
            />
            <button onClick={handleSearch} style={{ background: 'none', border: 'none', padding: '6px 10px', cursor: 'pointer', color: '#fb7299' }}>
              🔍
            </button>
          </div>
        </div>
        <ul className="nav-list" style={{ listStyle: 'none', padding: 0 }}>
          <li
            className={`nav-item ${activeView === 'home' ? 'active' : ''}`}
            onClick={() => setActiveView('home')}
            style={{ padding: '10px 20px', cursor: 'pointer' }}
          >
            推荐
          </li>
          <li style={{ padding: '6px 20px', fontSize: '12px', color: '#999', marginTop: '8px' }}>分区</li>
          {regionNames.map(region => (
            <li
              key={region}
              className={`nav-item ${typeof activeView !== 'string' && activeView.region === region ? 'active' : ''}`}
              onClick={() => setActiveView({ region })}
              style={{ padding: '8px 20px 8px 30px', cursor: 'pointer', fontSize: '14px' }}
            >
              {region}
            </li>
          ))}
        </ul>
      </div>
      {/* 右侧内容区 */}
      <div id="content-area" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {activeView === 'home' ? (
          <Home />
        ) : (
          <Video region={activeView.region} />
        )}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#fff' }}>
      {/* 标签栏 + 窗口按钮 */}
      <div style={{
        display: 'flex',
        background: '#f0f0f0',
        borderBottom: '1px solid #ddd',
        height: '36px',
        alignItems: 'center',
        padding: '0 4px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '4px 12px',
                borderRadius: '6px 6px 0 0',
                marginRight: '2px',
                cursor: 'pointer',
                background: activeTabId === tab.id ? '#fff' : '#e0e0e0',
                border: activeTabId === tab.id ? '1px solid #ddd' : '1px solid transparent',
                borderBottom: 'none',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                maxWidth: '160px',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                {tab.title}
              </span>
              {tab.id !== 'home' && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                  style={{
                    marginLeft: '6px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: '16px',
                    color: '#999',
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {/* 窗口控制按钮 */}
        <div style={{ display: 'flex', height: '100%', marginLeft: '8px' }}>
          <button className="window-btn minimize-btn" onClick={() => window.electronAPI?.minimize()} title="最小化">
            <svg viewBox="0 0 14 14"><rect y="6" width="14" height="1.5" fill="currentColor"/></svg>
          </button>
          <button className="window-btn maximize-btn" onClick={() => window.electronAPI?.maximize()} title="最大化">
            <svg viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
          <button className="window-btn close-btn" onClick={() => window.electronAPI?.close()} title="关闭">
            <svg viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5"/><line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>
      </div>

      {/* 内容区：主页 或 webview */}
      <div style={{ flex: 1, position: 'relative' }}>
        {activeTabId === 'home' ? (
          MainContent
        ) : (
          tabs.filter(t => t.id !== 'home').map(tab => (
            <webview
              key={tab.id}
              src={tab.url}
              // @ts-ignore
              ref={handleWebviewRef(tab.id)}
              style={{
                width: '100%',
                height: '100%',
                display: activeTabId === tab.id ? 'block' : 'none',
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default TabView