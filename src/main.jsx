import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

class AppErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error: error?.message || '알 수 없는 화면 오류' };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <main style={{ margin: '10vh auto', padding: 24, maxWidth: 540, fontFamily: 'system-ui,sans-serif', color: '#23433b' }}>
      <h1>화면을 불러오지 못했습니다</h1>
      <p>앱 화면에 오류가 발생했습니다. 이 메시지와 아래 원인을 알려주시면 재현하여 수정하겠습니다.</p>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 14, background: '#f3f6f4', borderRadius: 8 }}>{this.state.error}</pre>
      <button onClick={() => window.location.reload()} style={{ padding: '10px 14px', cursor: 'pointer' }}>새로고침</button>
    </main>;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>
);
