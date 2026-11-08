import { useEffect } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { Home } from './pages/Home'
import { Import } from './pages/Import'
import { QuestionEdit } from './pages/QuestionEdit'
import { Questions } from './pages/Questions'
import { Quiz } from './pages/Quiz'
import { Settings } from './pages/Settings'

/**
 * スマホの共有メニューから送られてきたテキストを受け取る。
 * manifest の share_target で「?share=1&text=...」付きでアプリが開かれるので、
 * その内容を取り込み画面に渡し、URL からは消しておく。
 */
function useShareTarget() {
  const navigate = useNavigate()
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('share') !== '1') return
    const sharedText = [params.get('text'), params.get('url')].filter(Boolean).join('\n')
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    navigate('/import', { state: { sharedText } })
  }, [navigate])
}

export function App() {
  useShareTarget()
  return (
    <div className="app">
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/import" element={<Import />} />
          <Route path="/questions" element={<Questions />} />
          <Route path="/questions/:id" element={<QuestionEdit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <nav className="tabbar">
        <NavLink to="/" end>
          <span aria-hidden>🏠</span>ホーム
        </NavLink>
        <NavLink to="/quiz">
          <span aria-hidden>✏️</span>出題
        </NavLink>
        <NavLink to="/import">
          <span aria-hidden>📥</span>取り込み
        </NavLink>
        <NavLink to="/questions">
          <span aria-hidden>📚</span>問題
        </NavLink>
        <NavLink to="/settings">
          <span aria-hidden>⚙️</span>設定
        </NavLink>
      </nav>
    </div>
  )
}
