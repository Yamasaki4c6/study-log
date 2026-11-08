import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// GitHub Pages ではサーバー側で URL を振り分けられないので、#/quiz のようなハッシュ形式の URL を使う
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { requestPersistentStorage } from './lib/db'
import './styles.css'

// オフラインでも動くようにするための Service Worker を登録（新しい版が出たら自動で更新）
registerSW({ immediate: true })
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
