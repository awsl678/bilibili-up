import React, { useRef } from 'react'
import { useTabs } from '../contexts/TabContext'

const TabBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, closeTab, updateTabTitle } = useTabs()
  const webviewRefs = useRef<Record<string, HTMLWebViewElement>>({})

  const handleWebviewRef = (id: string) => (el: HTMLWebViewElement | null) => {
    if (el) {
      webviewRefs.current[id] = el
      el.addEventListener('page-title-updated', (e: any) => {
        updateTabTitle(id, e.title)
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* 标签头 */}
      <div style={{
        display: 'flex',
        background: '#f0f0f0',
        borderBottom: '1px solid #ddd',
        height: '34px',
        alignItems: 'center',
        padding: '0 4px',
        overflowX: 'auto',
        flexShrink: 0,
      }}>
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
              maxWidth: '180px',
            }}
          >
            <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{tab.title}</span>
            <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }} style={{ marginLeft: '6px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: '#999' }}>×</button>
          </div>
        ))}
      </div>

      {/* webview 容器 */}
      <div style={{ flex: 1, position: 'relative' }}>
        {tabs.map(tab => (
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
        ))}
      </div>
    </div>
  )
}

export default TabBar