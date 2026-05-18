import React, { createContext, useContext, useState, ReactNode } from 'react'

export interface Tab {
  id: string
  url: string          // 对于 search 类型，存放关键词；其余为真实URL
  title: string
  type?: 'home' | 'search' | 'webview'  // 新增类型
}

interface TabContextType {
  tabs: Tab[]
  activeTabId: string
  openTab: (url: string) => void
  openSearchTab: (keyword: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabTitle: (id: string, title: string) => void
}

const TabContext = createContext<TabContextType | undefined>(undefined)

export const TabProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'home', url: '', title: '主页', type: 'home' }
  ])
  const [activeTabId, setActiveTabId] = useState<string>('home')

  const openTab = (url: string) => {
    const id = crypto.randomUUID()
    const newTab: Tab = { id, url, title: '加载中...', type: 'webview' }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(id)
  }

  const openSearchTab = (keyword: string) => {
    const id = `search-${keyword}`
    // 避免重复：如果已存在相同搜索标签，直接切换
    const existing = tabs.find(t => t.id === id)
    if (existing) {
      setActiveTabId(id)
      return
    }
    const newTab: Tab = { id, url: keyword, title: `搜索：${keyword}`, type: 'search' }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(id)
  }

  const closeTab = (id: string) => {
    if (id === 'home') return
    setTabs(prev => {
      const updated = prev.filter(t => t.id !== id)
      if (activeTabId === id && updated.length > 0) {
        setActiveTabId(updated[updated.length - 1].id)
      }
      return updated
    })
  }

  const updateTabTitle = (id: string, title: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, title } : t))
  }

  return (
    <TabContext.Provider value={{ tabs, activeTabId, openTab, openSearchTab, closeTab, setActiveTab: setActiveTabId, updateTabTitle }}>
      {children}
    </TabContext.Provider>
  )
}

export const useTabs = () => {
  const ctx = useContext(TabContext)
  if (!ctx) throw new Error('useTabs must be inside TabProvider')
  return ctx
}