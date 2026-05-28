import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  User, 
  Lock, 
  Coins, 
  Calendar, 
  TrendingUp, 
  History, 
  Settings, 
  LogOut, 
  Check, 
  AlertCircle, 
  ChevronRight, 
  X,
  RefreshCw,
  Plus,
  Eye,
  EyeOff
} from 'lucide-react';

const API_URL = 'https://world-cup-bet.onrender.com/api';

function App() {
  // Auth State
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // login or register
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  // Main UI Tabs
  const [activeTab, setActiveTab] = useState('matches'); // matches, leaderboard, bets, admin

  // Data States
  const [matches, setMatches] = useState([]);
  const [bets, setBets] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Bet Slip drawer state
  const [betSlipMatch, setBetSlipMatch] = useState(null);
  const [betType, setBetType] = useState('HOME'); // HOME, DRAW, AWAY, EXACT_SCORE
  const [betAmount, setBetAmount] = useState(100);
  const [predHome, setPredHome] = useState(0);
  const [predAway, setPredAway] = useState(0);

  // Admin states
  const [adminSelectedMatch, setAdminSelectedMatch] = useState(null);
  const [adminHomeScore, setAdminHomeScore] = useState('');
  const [adminAwayScore, setAdminAwayScore] = useState('');
  const [adminMatchStatus, setAdminMatchStatus] = useState('FINISHED');

  // Custom Match state for admin
  const [customHomeTeam, setCustomHomeTeam] = useState('');
  const [customAwayTeam, setCustomAwayTeam] = useState('');
  const [customStage, setCustomStage] = useState('שלב הבתים');

  // 1. Fetch user profile and app data if authenticated
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      fetchProfile();
      fetchData();
    } else {
      localStorage.removeItem('token');
      setUser(null);
    }
  }, [token]);

  // Periodic background data sync every 15 seconds
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      fetchMatchesOnly();
      fetchLeaderboardOnly();
    }, 15000);
    return () => clearInterval(interval);
  }, [token]);

  const showToast = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
      } else {
        // Token might have expired
        handleLogout();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([
      fetchMatchesOnly(),
      fetchBetsOnly(),
      fetchLeaderboardOnly()
    ]);
    setLoading(false);
  };

  const fetchMatchesOnly = async () => {
    try {
      const res = await fetch(`${API_URL}/matches`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setMatches(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBetsOnly = async () => {
    try {
      const res = await fetch(`${API_URL}/bets`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setBets(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLeaderboardOnly = async () => {
    try {
      const res = await fetch(`${API_URL}/leaderboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setLeaderboard(data);
    } catch (err) {
      console.error(err);
    }
  };

  // --- Auth Handlers ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'login' ? 'login' : 'register';

    try {
      const res = await fetch(`${API_URL}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await res.json();

      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setUsernameInput('');
        setPasswordInput('');
        showToast(authMode === 'login' ? 'ברוך הבא! התחברת בהצלחה' : 'נרשמת בהצלחה! קיבלת 1,000 מטבעות להתחלה 🚀');
      } else {
        setAuthError(data.message || 'שגיאה בהתחברות/הרשמה');
      }
    } catch (err) {
      setAuthError('לא ניתן להתחבר לשרת. ודא שהשרת פועל.');
    }
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('token');
    showToast('התנתקת בהצלחה. נתראה במגרש!', 'info');
  };

  // --- Betting Handlers ---
  const openBetSlip = (match) => {
    if (match.status !== 'SCHEDULED' || new Date() >= new Date(match.utcDate)) {
      showToast('המשחק כבר התחיל או הסתיים! לא ניתן להמר.', 'error');
      return;
    }
    setBetSlipMatch(match);
    setBetType('HOME');
    setBetAmount(100);
    setPredHome(0);
    setPredAway(0);
  };

  const placeBet = async () => {
    if (betAmount > user.balance) {
      showToast('אין לך מספיק מטבעות! הזן סכום נמוך יותר.', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/bets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          matchId: betSlipMatch.id,
          betType,
          amount: betAmount,
          predictedHomeScore: betType === 'EXACT_SCORE' ? predHome : null,
          predictedAwayScore: betType === 'EXACT_SCORE' ? predAway : null
        })
      });
      const data = await res.json();

      if (res.ok) {
        showToast('ההימור שלך נקלט בהצלחה! בהצלחה במשחק ⚽🔥');
        setBetSlipMatch(null);
        fetchProfile(); // update balance
        fetchData(); // reload games and history
      } else {
        showToast(data.message || 'שגיאה בשליחת ההימור', 'error');
      }
    } catch (err) {
      showToast('שגיאת תקשורת בשליחת ההימור', 'error');
    }
  };

  // --- Admin Handlers ---
  const triggerAutoSync = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/sync`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message);
        fetchData();
        fetchProfile();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('שגיאה בסנכרון ה-API', 'error');
    }
  };

  const handleManualMatchUpdate = async (e) => {
    e.preventDefault();
    if (!adminSelectedMatch) return;

    try {
      const res = await fetch(`${API_URL}/admin/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          matchId: adminSelectedMatch.id,
          homeScore: adminMatchStatus === 'FINISHED' ? adminHomeScore : null,
          awayScore: adminMatchStatus === 'FINISHED' ? adminAwayScore : null,
          status: adminMatchStatus
        })
      });
      const data = await res.json();

      if (res.ok) {
        showToast('תוצאת המשחק עודכנה וכל ההימורים חושבו בהצלחה!');
        setAdminSelectedMatch(null);
        setAdminHomeScore('');
        setAdminAwayScore('');
        fetchData();
        fetchProfile();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('שגיאת תקשורת בעדכון המשחק', 'error');
    }
  };

  const handleCreateCustomMatch = async (e) => {
    e.preventDefault();
    if (!customHomeTeam || !customAwayTeam) {
      showToast('אנא הזן את שמות שתי הנבחרות', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin/add-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          homeTeam: customHomeTeam,
          awayTeam: customAwayTeam,
          stage: customStage
        })
      });
      const data = await res.json();

      if (res.ok) {
        showToast(`המשחק בין ${customHomeTeam} ל-${customAwayTeam} נוסף ללוח!`);
        setCustomHomeTeam('');
        setCustomAwayTeam('');
        fetchMatchesOnly();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('שגיאה ביצירת משחק חדש', 'error');
    }
  };

  // Helper translations for UI
  const getBetTypeLabel = (type, hScore, aScore) => {
    if (type === 'HOME') return 'ניצחון בית';
    if (type === 'AWAY') return 'ניצחון חוץ';
    if (type === 'DRAW') return 'תיקו';
    if (type === 'EXACT_SCORE') return `תוצאה מדויקת: ${hScore}-${aScore}`;
    return type;
  };

  const formatLocalDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('he-IL', {
      weekday: 'long',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // --- UNAUTHENTICATED RENDER ---
  if (!token || !user) {
    return (
      <div className="app-container" style={{ justifyContent: 'center' }}>
        <div className="auth-wrapper">
          <div className="glass-panel auth-card">
            <div className="brand" style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
              <Trophy size={40} className="rank-crown" style={{ color: 'var(--accent)' }} />
              <h1>MUNDIAL BEt</h1>
            </div>

            <h2>{authMode === 'login' ? 'התחברות לחברים' : 'רישום שחקן חדש'}</h2>
            <p>המר על משחקים וזכה בכסף וירטואלי מול החברים במונדיאל!</p>

            {authError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.12)',
                color: 'var(--danger)',
                padding: '0.75rem',
                borderRadius: '10px',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                justifyContent: 'center',
                marginBottom: '1.5rem'
              }}>
                <AlertCircle size={18} />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuth}>
              <div className="form-group">
                <label>שם משתמש / כינוי</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="הזן שם משתמש"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label>סיסמה (פשוטה)</label>
                <div className="password-input-wrapper">
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    className="form-input password-input-field" 
                    placeholder="הזן סיסמה"
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    required 
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(prev => !prev)}
                    aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                {authMode === 'login' ? 'הכנס למגרש ⚽' : 'הרשם וקבל 1,000 מטבעות 🚀'}
              </button>
            </form>

            <div style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
              {authMode === 'login' ? (
                <span>
                  חבר חדש?{' '}
                  <a href="#" style={{ color: 'var(--primary)', fontWeight: '600' }} onClick={(e) => { e.preventDefault(); setAuthMode('register'); }}>
                    צור חשבון כאן
                  </a>
                </span>
              ) : (
                <span>
                  כבר רשום?{' '}
                  <a href="#" style={{ color: 'var(--primary)', fontWeight: '600' }} onClick={(e) => { e.preventDefault(); setAuthMode('login'); }}>
                    התחבר כאן
                  </a>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- AUTHENTICATED RENDER ---
  return (
    <div className="app-container" style={{ direction: 'rtl' }}>
      
      {/* Dynamic Toast Notifications */}
      {message.text && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: message.type === 'error' ? 'var(--danger)' : 'var(--bg-surface-opaque)',
          border: `1px solid ${message.type === 'error' ? 'rgba(255,255,255,0.2)' : 'var(--primary)'}`,
          boxShadow: message.type === 'error' ? '0 5px 25px rgba(239, 68, 68, 0.4)' : '0 5px 25px rgba(16, 185, 129, 0.3)',
          color: 'white',
          padding: '0.9rem 1.8rem',
          borderRadius: '14px',
          zIndex: 1000,
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          animation: 'slideUp 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) reverse'
        }}>
          {message.type === 'error' ? <AlertCircle size={20} /> : <Check size={20} style={{ color: 'var(--primary)' }} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* header */}
      <header>
        <div className="brand">
          <Trophy size={32} style={{ color: 'var(--accent)' }} />
          <h1>MUNDIAL BEt</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="user-badge glass-panel">
            <User size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: '600' }}>{user.username}</span>
            <div className="user-balance-glow">
              <Coins size={16} />
              <span>{user.balance.toLocaleString()} מטבעות</span>
            </div>
          </div>

          <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.5rem 0.75rem', borderRadius: '30px' }} title="התנתק">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Tabs navigation */}
      <div className="tabs-nav">
        <button className={`tab-btn ${activeTab === 'matches' ? 'active' : ''}`} onClick={() => setActiveTab('matches')}>
          <Calendar size={18} />
          לוח משחקים
        </button>
        <button className={`tab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`} onClick={() => setActiveTab('leaderboard')}>
          <Trophy size={18} />
          טבלת מובילים
        </button>
        <button className={`tab-btn ${activeTab === 'bets' ? 'active' : ''}`} onClick={() => setActiveTab('bets')}>
          <History size={18} />
          ההימורים שלי
        </button>
        {user.isAdmin && (
          <button className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')} style={{ border: '1px dashed var(--accent)', color: activeTab === 'admin' ? '#000' : 'var(--accent)' }}>
            <Settings size={18} />
            פאנל מנהל
          </button>
        )}
      </div>

      {/* MAIN LAYOUT */}
      <div className="dashboard-grid">
        
        {/* RIGHT/MAIN SIDE: Tab Contents */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* TAB 1: MATCHES DASHBOARD */}
          {activeTab === 'matches' && (
            <div>
              <div className="section-title">
                <Calendar size={24} style={{ color: 'var(--primary)' }} />
                <h2>משחקי המונדיאל להימור</h2>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={40} style={{ animation: 'spin 2s linear infinite', marginBottom: '1rem', color: 'var(--primary)' }} />
                  <p>טוען משחקים...</p>
                </div>
              ) : matches.length === 0 ? (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  אין כרגע משחקים פעילים בלוח.
                </div>
              ) : (
                <div className="matches-list">
                  {matches.map(match => (
                    <div key={match.id} className="glass-panel match-card">
                      <div className="match-header">
                        <span className="match-stage">{match.stage}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="match-time">{formatLocalDate(match.utcDate)}</span>
                          <span className={`match-status-badge ${match.status.toLowerCase()}`}>
                            {match.status === 'SCHEDULED' && 'טרם החל'}
                            {match.status === 'LIVE' && '● בשידור חי'}
                            {match.status === 'FINISHED' && 'סתיים'}
                          </span>
                        </div>
                      </div>

                      <div className="match-teams">
                        <div className="team">
                          <img src={match.homeFlag} alt={match.homeTeam} className="team-flag" />
                          <span className="team-name">{match.homeTeam}</span>
                        </div>

                        <div className="match-score-center">
                          {match.status === 'SCHEDULED' ? (
                            <span className="score-vs">נגד</span>
                          ) : (
                            <div className="score-display">
                              <span>{match.homeScore}</span>
                              <span style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>-</span>
                              <span>{match.awayScore}</span>
                            </div>
                          )}
                        </div>

                        <div className="team">
                          <img src={match.awayFlag} alt={match.awayTeam} className="team-flag" />
                          <span className="team-name">{match.awayTeam}</span>
                        </div>
                      </div>

                      {/* User's existing bet on this match */}
                      {match.myBet ? (
                        <div className="my-bet-indicator">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Check size={16} style={{ color: 'var(--primary)' }} />
                            <span>
                              ההימור שלך: <strong>{getBetTypeLabel(match.myBet.betType, match.myBet.predictedHomeScore, match.myBet.predictedAwayScore)}</strong> 
                              {' '}(השקעת {match.myBet.amount} מטבעות)
                            </span>
                          </div>
                          <span className={`my-bet-payout ${match.myBet.status.toLowerCase()}`}>
                            {match.myBet.status === 'PENDING' && 'ממתין לתוצאה...⏳'}
                            {match.myBet.status === 'WON' && `זכית! +${match.myBet.payout} מטבעות 🏆`}
                            {match.myBet.status === 'LOST' && 'ההימור לא פגע... ❌'}
                          </span>
                        </div>
                      ) : (
                        // If no bet and scheduled, allow betting
                        match.status === 'SCHEDULED' && (
                          <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textAlign: 'center' }}>
                              לחץ על יחס הימור כדי לבצע הימור מהיר:
                            </div>
                            <div className="bet-button-row">
                              <button className="odds-card" onClick={() => { openBetSlip(match); setBetType('HOME'); }}>
                                <span className="odds-label">ניצחון {match.homeTeam}</span>
                                <span className="odds-value">פי 2.0</span>
                              </button>
                              <button className="odds-card" onClick={() => { openBetSlip(match); setBetType('DRAW'); }}>
                                <span className="odds-label">תיקו</span>
                                <span className="odds-value">פי 2.0</span>
                              </button>
                              <button className="odds-card" onClick={() => { openBetSlip(match); setBetType('AWAY'); }}>
                                <span className="odds-label">ניצחון {match.awayTeam}</span>
                                <span className="odds-value">פי 2.0</span>
                              </button>
                              <button className="odds-card" onClick={() => { openBetSlip(match); setBetType('EXACT_SCORE'); }} style={{ borderStyle: 'dashed' }}>
                                <span className="odds-label">תוצאה מדויקת</span>
                                <span className="odds-value" style={{ color: 'var(--accent)' }}>פי 5.0 ✨</span>
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LEADERBOARD */}
          {activeTab === 'leaderboard' && (
            <div>
              <div className="section-title">
                <Trophy size={24} style={{ color: 'var(--accent)' }} />
                <h2>דירוג החברים בטורניר</h2>
              </div>

              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div className="leaderboard-list">
                  {leaderboard.map((player, idx) => {
                    const isTop3 = idx < 3;
                    return (
                      <div key={player.id} className={`leaderboard-item ${isTop3 ? 'top-3' : ''}`}>
                        <div className="leaderboard-rank">
                          {idx === 0 ? (
                            <Trophy size={20} className="rank-crown" />
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </div>

                        <div className="leaderboard-avatar">
                          {player.username.slice(0, 1)}
                        </div>

                        <div className="leaderboard-info">
                          <span className="leaderboard-name">{player.username}</span>
                          {player.isAdmin && <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '4px', marginRight: '5px', color: 'var(--text-secondary)' }}>מנהל</span>}
                          <div className="leaderboard-stats">
                            <span>הימורים: {player.totalBets} | </span>
                            <span>דיוק: {player.winRate}%</span>
                          </div>
                        </div>

                        <div className="leaderboard-score">
                          <div className="leaderboard-balance">{player.balance.toLocaleString()} 💰</div>
                          <div className="leaderboard-winrate">מטבעות וירטואליים</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BETTING HISTORY */}
          {activeTab === 'bets' && (
            <div>
              <div className="section-title">
                <History size={24} style={{ color: 'var(--primary)' }} />
                <h2>היסטוריית ההימורים שלי</h2>
              </div>

              {bets.length === 0 ? (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  עדיין לא ביצעת אף הימור. לך למסך "לוח משחקים" והתחל לנחש!
                </div>
              ) : (
                <div className="matches-list">
                  {bets.map(bet => (
                    <div key={bet.id} className="glass-panel" style={{ padding: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
                        <span>בוצע בתאריך {new Date(bet.createdAt).toLocaleDateString('he-IL')}</span>
                        <span style={{ fontWeight: '700', color: 'var(--accent)' }}>מזהה הימור: {bet.id}</span>
                      </div>

                      {bet.match && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.75rem 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '40%' }}>
                            <img src={bet.match.homeFlag} alt={bet.match.homeTeam} style={{ width: '30px', height: '20px', objectFit: 'cover', borderRadius: '3px' }} />
                            <span style={{ fontWeight: '700' }}>{bet.match.homeTeam}</span>
                          </div>

                          <span style={{ color: 'var(--text-muted)' }}>
                            {bet.match.status === 'FINISHED' ? `${bet.match.homeScore} - ${bet.match.awayScore}` : 'טרם שוחק'}
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '40%', justifyContent: 'flex-end' }}>
                            <span style={{ fontWeight: '700' }}>{bet.match.awayTeam}</span>
                            <img src={bet.match.awayFlag} alt={bet.match.awayTeam} style={{ width: '30px', height: '20px', objectFit: 'cover', borderRadius: '3px' }} />
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', background: 'rgba(255,255,255,0.02)', padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                        <div>
                          סוג הימור: <strong>{getBetTypeLabel(bet.betType, bet.predictedHomeScore, bet.predictedAwayScore)}</strong>
                        </div>
                        <div>
                          השקעה: <strong>{bet.amount} 💰</strong>
                        </div>
                        <div style={{ fontWeight: '800' }}>
                          {bet.status === 'PENDING' && <span style={{ color: 'var(--accent)' }}>ממתין... ⏳</span>}
                          {bet.status === 'WON' && <span style={{ color: 'var(--primary)' }}>זכייה: +{bet.payout} 🏆</span>}
                          {bet.status === 'LOST' && <span style={{ color: 'var(--danger)' }}>הפסד ❌</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ADMIN CONTROL PANEL */}
          {activeTab === 'admin' && user.isAdmin && (
            <div>
              <div className="section-title">
                <Settings size={24} style={{ color: 'var(--accent)' }} />
                <h2>לוח בקרה למנהל המערכת</h2>
              </div>

              {/* API Sync & Simulation controls */}
              <div className="glass-panel admin-card">
                <h3>סנכרון משחקים אוטומטי מ-API</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0.5rem 0 1.25rem 0' }}>
                  בלחיצה על כפתור זה, השרת יתחבר לשרת כדורגל חיצוני ויסנכרן את כל המשחקים, הזמנים והתוצאות האמיתיים. במידה ולא מוגדר מפתח API, השרת יסמלץ התקדמות משחקים ותוצאות באופן חכם!
                </p>
                <button onClick={triggerAutoSync} className="btn btn-accent">
                  <RefreshCw size={18} />
                  סנכרן ועדכן נתונים עכשיו
                </button>
              </div>

              {/* Set manual match score (For tests & override) */}
              <div className="glass-panel admin-card">
                <h3>עדכון תוצאות ידני וחישוב הימורים</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                  כאן תוכל להזין תוצאה סופית של משחק כדי לבדוק את חלוקת הכסף הווירטואלי לשחקנים מיד!
                </p>

                {adminSelectedMatch ? (
                  <form onSubmit={handleManualMatchUpdate} style={{ background: 'rgba(255,255,255,0.03)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <span style={{ fontWeight: '700' }}>עדכון תוצאה: {adminSelectedMatch.homeTeam} נגד {adminSelectedMatch.awayTeam}</span>
                      <button type="button" onClick={() => setAdminSelectedMatch(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={18} /></button>
                    </div>

                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                      <div className="form-group" style={{ flex: 1, minWidth: '120px' }}>
                        <label>סטטוס משחק</label>
                        <select className="form-input" value={adminMatchStatus} onChange={e => setAdminMatchStatus(e.target.value)}>
                          <option value="SCHEDULED">טרם החל (SCHEDULED)</option>
                          <option value="LIVE">בשידור חי (LIVE)</option>
                          <option value="FINISHED">הסתיים (FINISHED)</option>
                        </select>
                      </div>

                      {adminMatchStatus === 'FINISHED' && (
                        <>
                          <div className="form-group" style={{ width: '80px' }}>
                            <label>שערים {adminSelectedMatch.homeTeam}</label>
                            <input type="number" className="form-input" min="0" value={adminHomeScore} onChange={e => setAdminHomeScore(e.target.value)} required />
                          </div>
                          <div className="form-group" style={{ width: '80px' }}>
                            <label>שערים {adminSelectedMatch.awayTeam}</label>
                            <input type="number" className="form-input" min="0" value={adminAwayScore} onChange={e => setAdminAwayScore(e.target.value)} required />
                          </div>
                        </>
                      )}
                    </div>

                    <button type="submit" className="btn btn-primary">
                      שמור שינויים וחשב הימורים
                    </button>
                  </form>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {matches.map(m => (
                      <div key={m.id} className="admin-match-row">
                        <div className="admin-match-info">
                          <strong style={{ fontSize: '1rem' }}>{m.homeTeam} - {m.awayTeam}</strong>
                          <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>{m.status}</span>
                          {m.status !== 'SCHEDULED' && <span style={{ fontWeight: '700' }}>({m.homeScore} - {m.awayScore})</span>}
                        </div>
                        <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => {
                          setAdminSelectedMatch(m);
                          setAdminMatchStatus(m.status);
                          setAdminHomeScore(m.homeScore !== null ? m.homeScore : '0');
                          setAdminAwayScore(m.awayScore !== null ? m.awayScore : '0');
                        }}>
                          עדכן משחק
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Custom Match */}
              <div className="glass-panel admin-card">
                <h3>הוספת משחק מותאם אישית ללוח</h3>
                <form onSubmit={handleCreateCustomMatch} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                  <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                    <label>נבחרת בית</label>
                    <input type="text" className="form-input" placeholder="למשל: ארגנטינה" value={customHomeTeam} onChange={e => setCustomHomeTeam(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                    <label>נבחרת חוץ</label>
                    <input type="text" className="form-input" placeholder="למשל: ברזיל" value={customAwayTeam} onChange={e => setCustomAwayTeam(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ width: '120px' }}>
                    <label>שלב בטורניר</label>
                    <input type="text" className="form-input" value={customStage} onChange={e => setCustomStage(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.85rem 1.5rem' }}>
                      <Plus size={18} />
                      הוסף משחק
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* LEFT SIDE: Leaderboard widget shown next to everything on Desktop */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
              <TrendingUp size={20} style={{ color: 'var(--accent)' }} />
              טבלה מהירה
            </h3>

            <div className="leaderboard-list">
              {leaderboard.slice(0, 5).map((player, idx) => (
                <div key={player.id} className="leaderboard-item" style={{ padding: '0.75rem', borderRadius: '12px', fontSize: '0.9rem' }}>
                  <div className="leaderboard-rank" style={{ fontSize: '0.9rem', width: '24px' }}>
                    {idx === 0 ? '👑' : idx + 1}
                  </div>
                  <div className="leaderboard-info">
                    <span style={{ fontWeight: '700' }}>{player.username}</span>
                  </div>
                  <div className="leaderboard-score">
                    <span style={{ fontWeight: '700', color: 'var(--accent)' }}>{player.balance.toLocaleString()} 💰</span>
                  </div>
                </div>
              ))}
            </div>
            
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', fontSize: '0.85rem', padding: '0.5rem' }} onClick={() => setActiveTab('leaderboard')}>
              לצפייה בדירוג המלא <ChevronRight size={14} />
            </button>
          </div>

          {/* Quick rules / Betting settings widget */}
          <div className="glass-panel" style={{ padding: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <h4 style={{ color: 'white', marginBottom: '0.5rem', fontWeight: '700' }}>ℹ️ חוקי ההימורים של החברים:</h4>
            <ul style={{ listStyleType: 'none', paddingLeft: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li>⚽ <strong>מכפיל תוצאה (x2):</strong> ניחוש מנצחת או תיקו מכפיל את ההשקעה פי 2!</li>
              <li>🎯 <strong>מכפיל מדויק (x5):</strong> ניחוש התוצאה המדויקת בשערים מכפיל פי 5!</li>
              <li>⏰ <strong>נעילה:</strong> הימורים ננעלים אוטומטית בדיוק ברגע שריקת הפתיחה.</li>
              <li>🏆 <strong>הרשמה:</strong> שחקן חדש מתחיל עם 1,000 מטבעות וירטואליים.</li>
            </ul>
          </div>
        </div>

      </div>

      {/* --- BET SLIP DRAWER (SLIDES UP ON CLICK) --- */}
      {betSlipMatch && (
        <div className="betslip-backdrop" onClick={() => setBetSlipMatch(null)}>
          <div className="betslip-drawer" onClick={e => e.stopPropagation()} style={{ direction: 'rtl' }}>
            <div className="betslip-header">
              <h3>שליחת הימור חדש</h3>
              <button onClick={() => setBetSlipMatch(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <div className="betslip-match-detail">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <img src={betSlipMatch.homeFlag} alt={betSlipMatch.homeTeam} style={{ width: '30px', height: '20px', objectFit: 'cover', borderRadius: '3px' }} />
                <span style={{ fontWeight: '700' }}>{betSlipMatch.homeTeam}</span>
              </div>
              <span style={{ color: 'var(--text-muted)' }}>נגד</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: '700' }}>{betSlipMatch.awayTeam}</span>
                <img src={betSlipMatch.awayFlag} alt={betSlipMatch.awayTeam} style={{ width: '30px', height: '20px', objectFit: 'cover', borderRadius: '3px' }} />
              </div>
            </div>

            {/* Select Bet Type Buttons in drawer */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button className={`tab-btn ${betType === 'HOME' ? 'active' : ''}`} onClick={() => setBetType('HOME')} style={{ padding: '0.5rem' }}>
                ניצחון {betSlipMatch.homeTeam} (x2)
              </button>
              <button className={`tab-btn ${betType === 'DRAW' ? 'active' : ''}`} onClick={() => setBetType('DRAW')} style={{ padding: '0.5rem' }}>
                תיקו (x2)
              </button>
              <button className={`tab-btn ${betType === 'AWAY' ? 'active' : ''}`} onClick={() => setBetType('AWAY')} style={{ padding: '0.5rem' }}>
                ניצחון {betSlipMatch.awayTeam} (x2)
              </button>
              <button className={`tab-btn ${betType === 'EXACT_SCORE' ? 'active' : ''}`} onClick={() => setBetType('EXACT_SCORE')} style={{ padding: '0.5rem', border: '1px solid var(--accent)' }}>
                מדויק (x5)
              </button>
            </div>

            {/* If Exact Score, render inputs */}
            {betType === 'EXACT_SCORE' && (
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <span className="betslip-multiplier-badge">מכפיל פרימיום פי 5.0 בהימור מדויק! ⭐</span>
                <div className="score-inputs">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{betSlipMatch.homeTeam}</span>
                    <input type="number" className="form-input score-input-box" min="0" max="9" value={predHome} onChange={e => setPredHome(parseInt(e.target.value) || 0)} />
                  </div>
                  <span style={{ fontSize: '2rem', color: 'var(--text-muted)', paddingTop: '1rem' }}>-</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{betSlipMatch.awayTeam}</span>
                    <input type="number" className="form-input score-input-box" min="0" max="9" value={predAway} onChange={e => setPredAway(parseInt(e.target.value) || 0)} />
                  </div>
                </div>
              </div>
            )}

            {/* Enter Bet Amount */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>כמות מטבעות להימור</span>
                <span style={{ color: 'var(--accent)' }}>יתרה שלך: {user.balance.toLocaleString()} 💰</span>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="number" 
                  className="form-input" 
                  min="10" 
                  max={user.balance} 
                  value={betAmount} 
                  onChange={e => setBetAmount(parseInt(e.target.value) || 0)} 
                  required
                />
                <button type="button" className="btn btn-secondary" onClick={() => setBetAmount(user.balance)} style={{ padding: '0 1rem' }}>Max</button>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setBetAmount(50)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>50</button>
                <button type="button" className="btn btn-secondary" onClick={() => setBetAmount(100)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>100</button>
                <button type="button" className="btn btn-secondary" onClick={() => setBetAmount(200)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>200</button>
                <button type="button" className="btn btn-secondary" onClick={() => setBetAmount(500)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>500</button>
              </div>
            </div>

            {/* Submit Bet */}
            <button className="btn btn-primary" style={{ width: '100%', padding: '1rem' }} onClick={placeBet}>
              <Coins size={20} />
              שלח הימור של {betAmount} מטבעות
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
