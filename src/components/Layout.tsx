import React from 'react'
import { TabProvider } from '../contexts/TabContext'
import TabView from './TabView'
import '../styles/global.css'

const Layout: React.FC = () => {
  return (
    <TabProvider>
      <TabView />
    </TabProvider>
  )
}

export default Layout