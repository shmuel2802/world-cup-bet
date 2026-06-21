import React, { useState, useEffect } from "react";
import {
  Trophy,
  User,
  Lock,
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
  EyeOff,
  Trash2,
  Pencil,
} from "lucide-react";

const API_URL = "https://world-cup-bet-fxvd.onrender.com/api";
function App() {
  // Auth State
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(!!localStorage.getItem("token"));
  const [authMode, setAuthMode] = useState("login"); // login or register
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");

  // Main UI Tabs
  const [activeTab, setActiveTab] = useState("matches"); // matches, leaderboard, bets, admin

  // Data States
  const [matches, setMatches] = useState(() => {
    try {
      const cached = localStorage.getItem("world_cup_matches");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [bets, setBets] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  // Bet Slip drawer state
  const [betSlipMatch, setBetSlipMatch] = useState(null);
  const [betType, setBetType] = useState("HOME"); // HOME, DRAW, AWAY, EXACT_SCORE
  const [betAmount, setBetAmount] = useState(100);
  const [predHome, setPredHome] = useState("0");
  const [predAway, setPredAway] = useState("0");

  // Admin states
  const [adminSelectedMatch, setAdminSelectedMatch] = useState(null);
  const [adminHomeScore, setAdminHomeScore] = useState("");
  const [adminAwayScore, setAdminAwayScore] = useState("");
  const [adminMatchStatus, setAdminMatchStatus] = useState("FINISHED");
  const [adminCurrentMinute, setAdminCurrentMinute] = useState("");
  const [adminScorers, setAdminScorers] = useState("");

  // Custom Match state for admin
  const [customHomeTeam, setCustomHomeTeam] = useState("");
  const [customAwayTeam, setCustomAwayTeam] = useState("");
  const [customStage, setCustomStage] = useState("שלב הבתים");

  // Admin user management
  const [adminUsers, setAdminUsers] = useState([]);
  const [editingUserBalance, setEditingUserBalance] = useState(null);
  const [balanceEditValue, setBalanceEditValue] = useState("");

  // Long-Term Tournament predictions state
  const [allTeams, setAllTeams] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [longTermPrediction, setLongTermPrediction] = useState({
    winnerTeamId: null,
    topScorerPlayerId: null,
  });
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [searchTeamQuery, setSearchTeamQuery] = useState("");
  const [searchPlayerQuery, setSearchPlayerQuery] = useState("");
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [playerDropdownOpen, setPlayerDropdownOpen] = useState(false);
  const [longTermSaving, setLongTermSaving] = useState(false);

  // 1. Fetch user profile and app data if authenticated
  useEffect(() => {
    if (!token) return;

    // פונקציה שמביאה את כל המידע יחד
    const refreshData = () => {
      if (document.hidden) return;
      fetchMatchesOnly();
      fetchLeaderboardOnly();
    };

    // 1. הגדרת ה-Interval הרגיל (כל 60 שניות)
    const interval = setInterval(refreshData, 60000);

    // 2. האזנה לחזרה של המשתמש לאפליקציה (הדלקת מסך / מעבר טאב)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshData(); // רענון מיידי ברגע שחזרו לאפליקציה!
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // ניקוי ה-Interval והמאזין כשהקומפוננטה נסגרת
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [token]);

  // Periodic background data sync every 60 seconds (only when page is visible to save bandwidth)
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (document.hidden) return; // Skip fetch if tab is in the background
      fetchMatchesOnly();
      fetchLeaderboardOnly();
    }, 60000);
    return () => clearInterval(interval);
  }, [token]);

  // Load admin users when admin tab is opened
  useEffect(() => {
    if (token && user?.isAdmin && activeTab === "admin") {
      fetchAdminUsers();
    }
  }, [token, user, activeTab]);

  // Auto-login: validate stored token on first mount and populate user state
  useEffect(() => {
    if (!token) {
      setIsInitializing(false);
      return;
    }
    fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          localStorage.removeItem("token");
          localStorage.removeItem("world_cup_matches");
          setToken("");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setUser(data);
          fetchMatchesOnly();
          fetchLeaderboardOnly();
        }
      })
      .catch(console.error)
      .finally(() => setIsInitializing(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (text, type = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "" }), 5000);
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
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
      fetchLeaderboardOnly(),
      fetchTournamentData(),
    ]);
    setLoading(false);
  };

  const fetchAdminUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setAdminUsers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMatchesOnly = async () => {
    try {
      const res = await fetch(`${API_URL}/matches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMatches(data);
        try { localStorage.setItem("world_cup_matches", JSON.stringify(data)); } catch {}
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBetsOnly = async () => {
    try {
      const res = await fetch(`${API_URL}/bets`, {
        headers: { Authorization: `Bearer ${token}` },
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
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setLeaderboard(data);
    } catch (err) {
      console.error(err);
    }
  };

  const isTournamentLocked = () => {
    const KICKOFF_DATE = new Date("2026-06-11T19:00:00Z");
    return new Date() > KICKOFF_DATE;
  };

  const fetchTournamentData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [resTeams, resPlayers, resLtp] = await Promise.all([
        fetch(`${API_URL}/teams`, { headers }),
        fetch(`${API_URL}/players`, { headers }),
        fetch(`${API_URL}/predictions/long-term`, { headers }),
      ]);

      const teamsData = await resTeams.json();
      const playersData = await resPlayers.json();
      const ltpData = await resLtp.json();

      if (resTeams.ok) setAllTeams(teamsData);
      if (resPlayers.ok) setAllPlayers(playersData);

      if (resLtp.ok) {
        setLongTermPrediction(ltpData);
        if (ltpData.winnerTeamId) {
          const team = teamsData.find(
            (t) => String(t.id) === String(ltpData.winnerTeamId),
          );
          setSelectedTeam(team || null);
        }
        if (ltpData.topScorerPlayerId) {
          const player = playersData.find(
            (p) => String(p.id) === String(ltpData.topScorerPlayerId),
          );
          setSelectedPlayer(player || null);
        }
      }
    } catch (err) {
      console.error("Error fetching tournament data:", err);
    }
  };

  const saveLongTermPredictionAction = async () => {
    if (!selectedTeam || !selectedPlayer) {
      showToast("אנא בחר מנצחת טורניר ומלך שערים", "error");
      return;
    }

    setLongTermSaving(true);
    try {
      const res = await fetch(`${API_URL}/predictions/long-term`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          winnerTeamId: selectedTeam.id,
          topScorerPlayerId: selectedPlayer.id,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        showToast("הניחושים ארוכי הטווח שלך נשמרו בהצלחה! 🏆⚽");
        setLongTermPrediction(data.prediction);
      } else {
        showToast(data.message || "שגיאה בשמירת הניחושים", "error");
      }
    } catch (err) {
      showToast("שגיאת תקשורת בשמירת הניחושים", "error");
    } finally {
      setLongTermSaving(false);
    }
  };

  // --- Auth Handlers ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    const endpoint = authMode === "login" ? "login" : "register";

    try {
      const res = await fetch(`${API_URL}/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameInput,
          password: passwordInput,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("token", data.token);
        setToken(data.token);
        setUser(data.user);
        setUsernameInput("");
        setPasswordInput("");
        showToast(
          authMode === "login"
            ? "ברוך הבא! התחברת בהצלחה"
            : "נרשמת בהצלחה! התחלת מ-0 נקודות, בהצלחה בניחושים 🚀",
        );
      } else {
        setAuthError(data.message || "שגיאה בהתחברות/הרשמה");
      }
    } catch (err) {
      setAuthError("לא ניתן להתחבר לשרת. ודא שהשרת פועל.");
    }
  };

  const handleLogout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    showToast("התנתקת בהצלחה. נתראה במגרש!", "info");
  };

  const handleScoreInput = (setter) => (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (digits === "") {
      setter("");
      return;
    }
    setter(String(Math.min(9, parseInt(digits.slice(-1), 10))));
  };

  const handleScoreBlur = (value, setter) => {
    if (value === "") setter("0");
  };

  // --- Betting Handlers ---
  const openBetSlip = async (match) => {
    // הוסר התנאי שחסם פתיחה של משחקים שהתחילו או הסתיימו
    setBetSlipMatch(match);
    if (match.myBet) {
      setBetType(match.myBet.betType);
      setPredHome(String(match.myBet.predictedHomeScore ?? 0));
      setPredAway(String(match.myBet.predictedAwayScore ?? 0));
    } else {
      setBetType("HOME");
      setPredHome("0");
      setPredAway("0");
    }

    try {
      const res = await fetch(`${API_URL}/matches/${match.id}/predictions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBetSlipMatch((prev) => {
          if (!prev || prev.id !== match.id) return prev;
          return {
            ...prev,
            homeScore: data.homeScore,
            awayScore: data.awayScore,
            currentMinute: data.currentMinute,
            scorers: data.scorers,
            communityPredictions: data.predictions,
            predictionDistribution: {
              ...prev.predictionDistribution,
              total: data.total,
            },
          };
        });
      }
    } catch (err) {
      console.error("Error fetching match predictions:", err);
    }
  };

  const placeBet = async () => {
    if (
      betSlipMatch.status !== "SCHEDULED" ||
      new Date() >= new Date(betSlipMatch.utcDate)
    ) {
      showToast("המשחק כבר התחיל או הסתיים! לא ניתן להמר.", "error");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          matchId: betSlipMatch.id,
          betType,
          predictedHomeScore:
            betType === "EXACT_SCORE" ? parseInt(predHome, 10) || 0 : null,
          predictedAwayScore:
            betType === "EXACT_SCORE" ? parseInt(predAway, 10) || 0 : null,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        showToast(
          betSlipMatch.myBet
            ? "הניחוש עודכן בהצלחה! ⚽🔥"
            : "הניחוש נשמר בהצלחה! ⚽🔥",
        );
        setBetSlipMatch(null);
        fetchProfile(); // update balance
        fetchData(); // reload games and history
      } else {
        showToast(data.message || "שגיאה בשליחת הניחוש", "error");
      }
    } catch (err) {
      showToast("שגיאת תקשורת בשליחת הניחוש", "error");
    }
  };

  const cancelBet = async () => {
    if (!betSlipMatch || !betSlipMatch.myBet) return;
    if (
      betSlipMatch.status !== "SCHEDULED" ||
      new Date() >= new Date(betSlipMatch.utcDate)
    ) {
      showToast("המשחק כבר התחיל או הסתיים! לא ניתן לבטל את ההימור.", "error");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/bets/${betSlipMatch.myBet.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();

      if (res.ok) {
        showToast("הניחוש בוטל ונמחק בהצלחה!");
        setBetSlipMatch(null);
        fetchProfile(); // update balance
        fetchData(); // reload games and history
      } else {
        showToast(data.message || "שגיאה בביטול הניחוש", "error");
      }
    } catch (err) {
      showToast("שגיאת תקשורת בביטול הניחוש", "error");
    }
  };

  // --- Admin Handlers ---
  const triggerAutoSync = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message);
        fetchData();
        fetchProfile();
      } else {
        showToast(data.message, "error");
      }
    } catch (err) {
      showToast("שגיאה בסנכרון ה-API", "error");
    }
  };

  const handleManualMatchUpdate = async (e) => {
    e.preventDefault();
    if (!adminSelectedMatch) return;

    // Parse scorers from comma-separated string to array
    const scorersArray = adminScorers
      ? adminScorers
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    try {
      const res = await fetch(`${API_URL}/admin/match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          matchId: adminSelectedMatch.id,
          homeScore:
            adminMatchStatus === "FINISHED" || adminMatchStatus === "LIVE"
              ? parseInt(adminHomeScore, 10)
              : null,
          awayScore:
            adminMatchStatus === "FINISHED" || adminMatchStatus === "LIVE"
              ? parseInt(adminAwayScore, 10)
              : null,
          status: adminMatchStatus,
          currentMinute:
            adminMatchStatus === "LIVE"
              ? adminCurrentMinute
                ? parseInt(adminCurrentMinute, 10)
                : null
              : adminMatchStatus === "FINISHED"
                ? 90
                : null,
          scorers: scorersArray,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        showToast("תוצאת המשחק עודכנה וכל ההימורים חושבו בהצלחה!");
        setAdminSelectedMatch(null);
        setAdminHomeScore("");
        setAdminAwayScore("");
        setAdminCurrentMinute("");
        setAdminScorers("");
        fetchData();
        fetchProfile();
      } else {
        showToast(data.message, "error");
      }
    } catch (err) {
      showToast("שגיאת תקשורת בעדכון המשחק", "error");
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (
      !window.confirm(`האם למחוק את המשתמש "${username}"? פעולה זו בלתי הפיכה.`)
    )
      return;

    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`המשתמש ${username} נמחק בהצלחה`);
        fetchAdminUsers();
        fetchLeaderboardOnly();
      } else {
        showToast(data.message || "שגיאה במחיקת המשתמש", "error");
      }
    } catch (err) {
      showToast("שגיאת תקשורת במחיקת המשתמש", "error");
    }
  };

  const handleUpdateUserBalance = async (userId) => {
    const newBalance = parseInt(balanceEditValue, 10);
    if (isNaN(newBalance) || newBalance < 0) {
      showToast("יש להזין מספר נקודות תקין (0 ומעלה)", "error");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/balance`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ balance: newBalance }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("ניקוד המשתמש עודכן בהצלחה");
        setEditingUserBalance(null);
        setBalanceEditValue("");
        fetchAdminUsers();
        fetchLeaderboardOnly();
      } else {
        showToast(data.message || "שגיאה בעדכון הניקוד", "error");
      }
    } catch (err) {
      showToast("שגיאת תקשורת בעדכון הניקוד", "error");
    }
  };

  const handleCreateCustomMatch = async (e) => {
    e.preventDefault();
    if (!customHomeTeam || !customAwayTeam) {
      showToast("אנא הזן את שמות שתי הנבחרות", "error");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin/add-match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          homeTeam: customHomeTeam,
          awayTeam: customAwayTeam,
          stage: customStage,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        showToast(`המשחק בין ${customHomeTeam} ל-${customAwayTeam} נוסף ללוח!`);
        setCustomHomeTeam("");
        setCustomAwayTeam("");
        fetchMatchesOnly();
      } else {
        showToast(data.message, "error");
      }
    } catch (err) {
      showToast("שגיאה ביצירת משחק חדש", "error");
    }
  };

  // Helper translations for UI
  const getBetTypeLabel = (type, hScore, aScore) => {
    if (type === "HOME") return "ניצחון בית";
    if (type === "AWAY") return "ניצחון חוץ";
    if (type === "DRAW") return "תיקו";
    if (type === "EXACT_SCORE") return `תוצאה מדויקת: ${hScore}-${aScore}`;
    return type;
  };

  const formatLocalDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString("he-IL", {
      weekday: "long",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Check if a specific match is locked for betting
  const isMatchLocked = (match) => {
    return (
      match.status !== "SCHEDULED" || new Date() >= new Date(match.utcDate)
    );
  };

  // --- INITIALIZING SPLASH ---
  if (isInitializing) {
    return (
      <div className="app-container" style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⚽</div>
          <div style={{ fontSize: "1rem" }}>טוען...</div>
        </div>
      </div>
    );
  }

  // --- UNAUTHENTICATED RENDER ---
  if (!token || !user) {
    return (
      <div className="app-container" style={{ justifyContent: "center" }}>
        <div className="auth-wrapper">
          <div className="glass-panel auth-card">
            <div
              className="brand"
              style={{ justifyContent: "center", marginBottom: "1.5rem" }}
            >
              <Trophy
                size={40}
                className="rank-crown"
                style={{ color: "var(--accent)" }}
              />
              <h1>MUNDIAL BET</h1>
            </div>

            <h2>
              {authMode === "login" ? "התחברות לחברים" : "רישום שחקן חדש"}
            </h2>
            <p>נחש תוצאות משחקים וצבור נקודות מול החברים במונדיאל!</p>

            {authError && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.12)",
                  color: "var(--danger)",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  fontSize: "0.9rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  justifyContent: "center",
                  marginBottom: "1.5rem",
                }}
              >
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
                  onChange={(e) => setUsernameInput(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>סיסמה (פשוטה)</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-input password-input-field"
                    placeholder="הזן סיסמה"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%", marginTop: "1rem" }}
              >
                {authMode === "login" ? "הכנס למגרש ⚽" : "הרשם והתחל לנחש 🚀"}
              </button>
            </form>

            <div style={{ marginTop: "1.5rem", fontSize: "0.9rem" }}>
              {authMode === "login" ? (
                <span>
                  חבר חדש?{" "}
                  <a
                    href="#"
                    style={{ color: "var(--primary)", fontWeight: "600" }}
                    onClick={(e) => {
                      e.preventDefault();
                      setAuthMode("register");
                    }}
                  >
                    צור חשבון כאן
                  </a>
                </span>
              ) : (
                <span>
                  כבר רשום?{" "}
                  <a
                    href="#"
                    style={{ color: "var(--primary)", fontWeight: "600" }}
                    onClick={(e) => {
                      e.preventDefault();
                      setAuthMode("login");
                    }}
                  >
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
    <div className="app-container" style={{ direction: "rtl" }}>
      {/* Dynamic Toast Notifications */}
      {message.text && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            background:
              message.type === "error"
                ? "var(--danger)"
                : "var(--bg-surface-opaque)",
            border: `1px solid ${message.type === "error" ? "rgba(255,255,255,0.2)" : "var(--primary)"}`,
            boxShadow:
              message.type === "error"
                ? "0 5px 25px rgba(239, 68, 68, 0.4)"
                : "0 5px 25px rgba(16, 185, 129, 0.3)",
            color: "white",
            padding: "0.9rem 1.8rem",
            borderRadius: "14px",
            zIndex: 1000,
            fontWeight: "700",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            animation:
              "slideUp 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) reverse",
          }}
        >
          {message.type === "error" ? (
            <AlertCircle size={20} />
          ) : (
            <Check size={20} style={{ color: "var(--primary)" }} />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* header */}
      <header>
        <div className="brand">
          <Trophy size={32} style={{ color: "var(--accent)" }} />
          <h1>MUNDIAL BET</h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div className="user-badge glass-panel">
            <User size={16} style={{ color: "var(--primary)" }} />
            <span style={{ fontWeight: "600" }}>{user.username}</span>
            <div className="user-balance-glow">
              <Trophy size={16} />
              <span>{user.balance.toLocaleString()} נקודות</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="btn btn-secondary"
            style={{ padding: "0.5rem 0.75rem", borderRadius: "30px" }}
            title="התנתק"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Tabs navigation */}
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === "matches" ? "active" : ""}`}
          onClick={() => setActiveTab("matches")}
        >
          <Calendar size={18} />
          לוח משחקים
        </button>
        <button
          className={`tab-btn ${activeTab === "tournament" ? "active" : ""}`}
          onClick={() => setActiveTab("tournament")}
        >
          <Trophy size={18} style={{ color: "var(--accent)" }} />
          ניחושי מונדיאל
        </button>
        <button
          className={`tab-btn ${activeTab === "leaderboard" ? "active" : ""}`}
          onClick={() => setActiveTab("leaderboard")}
        >
          <Trophy size={18} />
          טבלת מובילים
        </button>
        <button
          className={`tab-btn ${activeTab === "bets" ? "active" : ""}`}
          onClick={() => setActiveTab("bets")}
        >
          <History size={18} />
          ההימורים שלי
        </button>
        {user.isAdmin && (
          <button
            className={`tab-btn ${activeTab === "admin" ? "active" : ""}`}
            onClick={() => setActiveTab("admin")}
            style={{
              border: "1px dashed var(--accent)",
              color: activeTab === "admin" ? "#000" : "var(--accent)",
            }}
          >
            <Settings size={18} />
            פאנל מנהל
          </button>
        )}
      </div>

      {/* MAIN LAYOUT */}
      <div className="dashboard-grid">
        {/* RIGHT/MAIN SIDE: Tab Contents */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          {/* TAB 1: MATCHES DASHBOARD */}
          {activeTab === "matches" && (
            <div>
              <div className="section-title">
                <Calendar size={24} style={{ color: "var(--primary)" }} />
                <h2>משחקי המונדיאל להימור</h2>
              </div>

              {loading ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "3rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  <RefreshCw
                    size={40}
                    style={{
                      animation: "spin 2s linear infinite",
                      marginBottom: "1rem",
                      color: "var(--primary)",
                    }}
                  />
                  <p>טוען משחקים...</p>
                </div>
              ) : matches.length === 0 ? (
                <div
                  className="glass-panel"
                  style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  אין כרגע משחקים פעילים בלוח.
                </div>
              ) : (
                <div className="matches-list">
                  {matches.map((match) => (
                    <div key={match.id} className="glass-panel match-card">
                      <div className="match-header">
                        <span className="match-stage">{match.stage}</span>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <span className="match-time">
                            {formatLocalDate(match.utcDate)}
                          </span>
                          <span
                            className={`match-status-badge ${match.status.toLowerCase()}`}
                          >
                            {match.status === "SCHEDULED" && "טרם החל"}
                            {match.status === "LIVE" && "● בשידור חי"}
                            {match.status === "FINISHED" && "הסתיים"}
                          </span>
                        </div>
                      </div>

                      <div className="match-teams">
                        <div className="team">
                          <img
                            src={match.homeFlag}
                            alt={match.homeTeam}
                            className="team-flag"
                          />
                          <span className="team-name">{match.homeTeam}</span>
                        </div>

                        <div className="match-score-center">
                          {match.status === "SCHEDULED" ? (
                            <span className="score-vs">נגד</span>
                          ) : (
                            <div className="score-display">
                              <span>{match.homeScore}</span>
                              <span
                                style={{
                                  fontSize: "1.5rem",
                                  color: "var(--text-muted)",
                                }}
                              >
                                -
                              </span>
                              <span>{match.awayScore}</span>
                            </div>
                          )}
                        </div>

                        <div className="team">
                          <img
                            src={match.awayFlag}
                            alt={match.awayTeam}
                            className="team-flag"
                          />
                          <span className="team-name">{match.awayTeam}</span>
                        </div>
                      </div>

                      {(match.status === "LIVE" || match.status === "FINISHED") &&
                        match.scorers && match.scorers.length > 0 && (
                        <div
                          className="match-scorers-box"
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--text-secondary)",
                            textAlign: "center",
                            marginTop: "-0.5rem",
                            marginBottom: "0.75rem",
                            padding: "0.25rem 0.5rem",
                            background: "rgba(255, 255, 255, 0.02)",
                            borderRadius: "6px",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ color: "var(--accent)" }}>⚽</span>
                          <span>{match.scorers.join(" • ")}</span>
                        </div>
                      )}

                      {/* User's existing bet on this match */}
                      {match.myBet ? (
                        <>
                          {/* תמיד מאפשרים לחיצה לפתיחה, לא משנה מה הסטטוס */}
                          <div
                            className="my-bet-indicator has-distribution"
                            style={{ cursor: "pointer" }}
                            onClick={() => openBetSlip(match)}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                flex: 1,
                              }}
                            >
                              <Check
                                size={16}
                                style={{ color: "var(--primary)" }}
                              />
                              <span>
                                הניחוש שלך:{" "}
                                <strong>
                                  {getBetTypeLabel(
                                    match.myBet.betType,
                                    match.myBet.predictedHomeScore,
                                    match.myBet.predictedAwayScore,
                                  )}
                                </strong>
                                {!isMatchLocked(match) ? (
                                  <span
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--primary)",
                                      textDecoration: "underline",
                                      marginRight: "8px",
                                    }}
                                  >
                                    (עריכה / ביטול)
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--text-muted)",
                                      marginRight: "8px",
                                    }}
                                  >
                                    (לחץ לצפייה בניחושי כולם)
                                  </span>
                                )}
                              </span>
                            </div>
                            <span
                              className={`my-bet-payout ${match.myBet.status.toLowerCase()}`}
                            >
                              {match.myBet.status === "PENDING" &&
                                "ממתין לתוצאה...⏳"}
                              {match.myBet.status === "WON" &&
                                `פגעת! +${match.myBet.payout} נקודות 🏆`}
                              {match.myBet.status === "LOST" && "לא פגע... ❌"}
                            </span>
                          </div>

                          {/* Mini community distribution under the indicator */}
                          {match.predictionDistribution && (
                            <div
                              className="match-community-distribution"
                              style={{ cursor: "pointer" }}
                              onClick={() => openBetSlip(match)}
                            >
                              <div className="dist-title">
                                התפלגות ניחושי החברים:
                              </div>
                              <div className="dist-bars">
                                <div className="dist-bar-item">
                                  <div className="dist-label">
                                    <span>ניצחון {match.homeTeam}</span>
                                    <span>
                                      {match.predictionDistribution.home}%
                                    </span>
                                  </div>
                                  <div className="dist-bg">
                                    <div
                                      className="dist-fill home"
                                      style={{
                                        width: `${match.predictionDistribution.home}%`,
                                      }}
                                    ></div>
                                  </div>
                                </div>
                                <div className="dist-bar-item">
                                  <div className="dist-label">
                                    <span>תיקו</span>
                                    <span>
                                      {match.predictionDistribution.draw}%
                                    </span>
                                  </div>
                                  <div className="dist-bg">
                                    <div
                                      className="dist-fill draw"
                                      style={{
                                        width: `${match.predictionDistribution.draw}%`,
                                      }}
                                    ></div>
                                  </div>
                                </div>
                                <div className="dist-bar-item">
                                  <div className="dist-label">
                                    <span>ניצחון {match.awayTeam}</span>
                                    <span>
                                      {match.predictionDistribution.away}%
                                    </span>
                                  </div>
                                  <div className="dist-bg">
                                    <div
                                      className="dist-fill away"
                                      style={{
                                        width: `${match.predictionDistribution.away}%`,
                                      }}
                                    ></div>
                                  </div>
                                </div>
                                <div className="dist-bar-item">
                                  <div className="dist-label">
                                    <span>מדויק</span>
                                    <span>
                                      {match.predictionDistribution.exact}%
                                    </span>
                                  </div>
                                  <div className="dist-bg">
                                    <div
                                      className="dist-fill exact"
                                      style={{
                                        width: `${match.predictionDistribution.exact}%`,
                                      }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      ) : // If no bet and scheduled, allow betting
                      match.status === "SCHEDULED" ? (
                        <div>
                          {match.communityPredictions &&
                            match.communityPredictions.length > 0 && (
                              <div
                                className="match-community-count"
                                onClick={() => openBetSlip(match)}
                                style={{ cursor: "pointer" }}
                              >
                                👥 {match.communityPredictions.length} חברים כבר
                                ניחשו — לחץ לצפייה
                              </div>
                            )}
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--text-secondary)",
                              marginBottom: "0.5rem",
                              textAlign: "center",
                            }}
                          >
                            לחץ על יחס הימור כדי לבצע הימור מהיר:
                          </div>
                          <div className="bet-button-row">
                            <button
                              className="odds-card"
                              onClick={() => {
                                openBetSlip(match);
                                setBetType("HOME");
                              }}
                            >
                              <span className="odds-label">
                                ניצחון {match.homeTeam}
                              </span>
                              <span className="odds-value">פי 2.0</span>
                            </button>
                            <button
                              className="odds-card"
                              onClick={() => {
                                openBetSlip(match);
                                setBetType("DRAW");
                              }}
                            >
                              <span className="odds-label">תיקו</span>
                              <span className="odds-value">פי 2.0</span>
                            </button>
                            <button
                              className="odds-card"
                              onClick={() => {
                                openBetSlip(match);
                                setBetType("AWAY");
                              }}
                            >
                              <span className="odds-label">
                                ניצחון {match.awayTeam}
                              </span>
                              <span className="odds-value">פי 2.0</span>
                            </button>
                            <button
                              className="odds-card"
                              onClick={() => {
                                openBetSlip(match);
                                setBetType("EXACT_SCORE");
                              }}
                              style={{ borderStyle: "dashed" }}
                            >
                              <span className="odds-label">תוצאה מדויקת</span>
                              <span
                                className="odds-value"
                                style={{ color: "var(--accent)" }}
                              >
                                פי 5.0 ✨
                              </span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        // אם המשתמש לא הימר והמשחק כבר התחיל או הסתיים - עדיין מאפשרים לראות ניחושים של אחרים
                        <div
                          style={{ marginTop: "0.5rem", textAlign: "center" }}
                        >
                          <button
                            className="btn btn-secondary"
                            style={{
                              fontSize: "0.85rem",
                              padding: "0.4rem 1rem",
                              borderRadius: "20px",
                            }}
                            onClick={() => openBetSlip(match)}
                          >
                            👥 צפה בניחושי החברים (
                            {match.communityPredictions?.length || 0})
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LEADERBOARD */}
          {activeTab === "leaderboard" && (
            <div>
              <div className="section-title">
                <Trophy size={24} style={{ color: "var(--accent)" }} />
                <h2>דירוג החברים בטורניר</h2>
              </div>

              <div className="glass-panel" style={{ padding: "1.5rem" }}>
                <div className="leaderboard-list">
                  {leaderboard.map((player, idx) => {
                    const isTop3 = idx < 3;
                    return (
                      <div
                        key={player.id}
                        className={`leaderboard-item ${isTop3 ? "top-3" : ""}`}
                      >
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
                          <span className="leaderboard-name">
                            {player.username}
                          </span>
                          {player.isAdmin && (
                            <span
                              style={{
                                fontSize: "0.65rem",
                                background: "rgba(255,255,255,0.1)",
                                padding: "1px 4px",
                                borderRadius: "4px",
                                marginRight: "5px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              מנהל
                            </span>
                          )}
                          <div className="leaderboard-stats">
                            <span>הימורים: {player.totalBets} | </span>
                            <span>דיוק: {player.winRate}%</span>
                          </div>
                        </div>

                        <div className="leaderboard-score">
                          <div className="leaderboard-balance">
                            {player.balance.toLocaleString()} 🏆
                          </div>
                          <div className="leaderboard-winrate">
                            נקודות צבורות
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BETTING HISTORY */}
          {activeTab === "bets" && (
            <div>
              <div className="section-title">
                <History size={24} style={{ color: "var(--primary)" }} />
                <h2>היסטוריית ההימורים שלי</h2>
              </div>

              {bets.length === 0 ? (
                <div
                  className="glass-panel"
                  style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  עדיין לא ביצעת אף הימור. לך למסך "לוח משחקים" והתחל לנחש!
                </div>
              ) : (
                <div className="matches-list">
                  {bets.map((bet) => (
                    <div
                      key={bet.id}
                      className="glass-panel"
                      style={{ padding: "1.25rem" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                          marginBottom: "0.75rem",
                          borderBottom: "1px solid var(--border-light)",
                          paddingBottom: "0.5rem",
                        }}
                      >
                        <span>
                          בוצע בתאריך{" "}
                          {new Date(bet.createdAt).toLocaleDateString("he-IL")}
                        </span>
                      </div>

                      {bet.match && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            margin: "0.75rem 0",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              width: "40%",
                            }}
                          >
                            <img
                              src={bet.match.homeFlag}
                              alt={bet.match.homeTeam}
                              style={{
                                width: "30px",
                                height: "20px",
                                objectFit: "cover",
                                borderRadius: "3px",
                              }}
                            />
                            <span style={{ fontWeight: "700" }}>
                              {bet.match.homeTeam}
                            </span>
                          </div>

                          <span style={{ color: "var(--text-muted)" }}>
                            {bet.match.status === "FINISHED"
                              ? `${bet.match.homeScore} - ${bet.match.awayScore}`
                              : "טרם שוחק"}
                          </span>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              width: "40%",
                              justifyContent: "flex-end",
                            }}
                          >
                            <span style={{ fontWeight: "700" }}>
                              {bet.match.awayTeam}
                            </span>
                            <img
                              src={bet.match.awayFlag}
                              alt={bet.match.awayTeam}
                              style={{
                                width: "30px",
                                height: "20px",
                                objectFit: "cover",
                                borderRadius: "3px",
                              }}
                            />
                          </div>
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: "0.75rem",
                          background: "rgba(255,255,255,0.02)",
                          padding: "0.6rem 1rem",
                          borderRadius: "10px",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <div>
                          סוג:{" "}
                          <strong>
                            {bet.betType === "EXACT_SCORE"
                              ? "תוצאה מדויקת"
                              : "תוצאה"}
                          </strong>
                        </div>
                        <div style={{ fontWeight: "800" }}>
                          {bet.status === "PENDING" && (
                            <span style={{ color: "var(--accent)" }}>
                              ממתין... ⏳
                            </span>
                          )}
                          {bet.status === "WON" && (
                            <span style={{ color: "var(--primary)" }}>
                              תוספת: +{bet.payout} נק׳ 🏆
                            </span>
                          )}
                          {bet.status === "LOST" && (
                            <span style={{ color: "var(--danger)" }}>
                              לא פגע ❌
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ADMIN CONTROL PANEL */}
          {activeTab === "admin" && user.isAdmin && (
            <div>
              <div className="section-title">
                <Settings size={24} style={{ color: "var(--accent)" }} />
                <h2>לוח בקרה למנהל המערכת</h2>
              </div>

              {/* API Sync & Simulation controls */}
              <div className="glass-panel admin-card">
                <h3>סנכרון משחקים אוטומטי מ-API</h3>
                <p
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--text-secondary)",
                    margin: "0.5rem 0 1.25rem 0",
                  }}
                >
                  בלחיצה על כפתור זה, השרת יתחבר לשרת כדורגל חיצוני ויסנכרן את
                  כל המשחקים, הזמנים והתוצאות האמיתיים. במידה ולא מוגדר מפתח
                  API, השרת יסמלץ התקדמות משחקים ותוצאות באופן חכם!
                </p>
                <button onClick={triggerAutoSync} className="btn btn-accent">
                  <RefreshCw size={18} />
                  סנכרן ועדכן נתונים עכשיו
                </button>
              </div>

              {/* Set manual match score (For tests & override) */}
              <div className="glass-panel admin-card">
                <h3>עדכון תוצאות ידני וחישוב הימורים</h3>
                <p
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--text-secondary)",
                    marginBottom: "1.25rem",
                  }}
                >
                  כאן תוכל להזין תוצאה סופית של משחק כדי לבדוק את חלוקת הנקודות
                  לשחקנים מיד!
                </p>

                {adminSelectedMatch ? (
                  <form
                    onSubmit={handleManualMatchUpdate}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      padding: "1.25rem",
                      borderRadius: "14px",
                      border: "1px solid var(--primary)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "1rem",
                      }}
                    >
                      <span style={{ fontWeight: "700" }}>
                        עדכון תוצאה: {adminSelectedMatch.homeTeam} נגד{" "}
                        {adminSelectedMatch.awayTeam}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAdminSelectedMatch(null)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "1.5rem",
                        flexWrap: "wrap",
                        marginBottom: "1rem",
                      }}
                    >
                      <div
                        className="form-group"
                        style={{ flex: 1, minWidth: "120px" }}
                      >
                        <label>סטטוס משחק</label>
                        <select
                          className="form-input"
                          value={adminMatchStatus}
                          onChange={(e) => setAdminMatchStatus(e.target.value)}
                        >
                          <option value="SCHEDULED">טרם החל (SCHEDULED)</option>
                          <option value="LIVE">בשידור חי (LIVE)</option>
                          <option value="FINISHED">הסתיים (FINISHED)</option>
                        </select>
                      </div>

                      {(adminMatchStatus === "FINISHED" ||
                        adminMatchStatus === "LIVE") && (
                        <>
                          <div className="form-group" style={{ width: "80px" }}>
                            <label>שערים {adminSelectedMatch.homeTeam}</label>
                            <input
                              type="number"
                              className="form-input"
                              min="0"
                              value={adminHomeScore}
                              onChange={(e) =>
                                setAdminHomeScore(e.target.value)
                              }
                              required
                            />
                          </div>
                          <div className="form-group" style={{ width: "80px" }}>
                            <label>שערים {adminSelectedMatch.awayTeam}</label>
                            <input
                              type="number"
                              className="form-input"
                              min="0"
                              value={adminAwayScore}
                              onChange={(e) =>
                                setAdminAwayScore(e.target.value)
                              }
                              required
                            />
                          </div>
                          {adminMatchStatus === "LIVE" && (
                            <div
                              className="form-group"
                              style={{ width: "100px" }}
                            >
                              <label>דקת משחק</label>
                              <input
                                type="number"
                                className="form-input"
                                min="0"
                                max="120"
                                value={adminCurrentMinute}
                                onChange={(e) =>
                                  setAdminCurrentMinute(e.target.value)
                                }
                                placeholder="למשל: 45"
                              />
                            </div>
                          )}
                          <div
                            className="form-group"
                            style={{ flex: "1 1 200px" }}
                          >
                            <label>כובשי שערים (מופרד בפסיקים)</label>
                            <input
                              type="text"
                              className="form-input"
                              value={adminScorers}
                              onChange={(e) => setAdminScorers(e.target.value)}
                              placeholder="למשל: Lionel Messi (34'), Kylian Mbappé (82' Pen)"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <button type="submit" className="btn btn-primary">
                      שמור שינויים וחשב הימורים
                    </button>
                  </form>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {matches.map((m) => (
                      <div key={m.id} className="admin-match-row">
                        <div className="admin-match-info">
                          <strong style={{ fontSize: "1rem" }}>
                            {m.homeTeam} - {m.awayTeam}
                          </strong>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              background: "rgba(255,255,255,0.06)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            {m.status}
                          </span>
                          {m.status !== "SCHEDULED" && (
                            <span style={{ fontWeight: "700" }}>
                              ({m.homeScore} - {m.awayScore})
                            </span>
                          )}
                        </div>
                        <button
                          className="btn btn-secondary"
                          style={{
                            padding: "0.4rem 0.8rem",
                            fontSize: "0.85rem",
                          }}
                          onClick={() => {
                            setAdminSelectedMatch(m);
                            setAdminMatchStatus(m.status);
                            setAdminHomeScore(
                              m.homeScore !== null ? String(m.homeScore) : "0",
                            );
                            setAdminAwayScore(
                              m.awayScore !== null ? String(m.awayScore) : "0",
                            );
                            setAdminCurrentMinute(
                              m.currentMinute !== null &&
                                m.currentMinute !== undefined
                                ? String(m.currentMinute)
                                : "",
                            );
                            setAdminScorers(
                              m.scorers ? m.scorers.join(", ") : "",
                            );
                          }}
                        >
                          עדכן משחק
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* User Management */}
              <div className="glass-panel admin-card">
                <h3>ניהול משתמשים</h3>
                <p
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--text-secondary)",
                    margin: "0.5rem 0 1.25rem 0",
                  }}
                >
                  מחיקת משתמשים ועדכון יתרת הנקודות שלהם ישירות מהמערכת.
                </p>

                {adminUsers.length === 0 ? (
                  <p
                    style={{
                      color: "var(--text-secondary)",
                      textAlign: "center",
                      padding: "1rem",
                    }}
                  >
                    אין משתמשים במערכת
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {adminUsers.map((adminUser) => (
                      <div key={adminUser.id} className="admin-user-row">
                        <div className="admin-user-info">
                          <strong>{adminUser.username}</strong>
                          {adminUser.isAdmin && (
                            <span className="admin-user-badge">מנהל</span>
                          )}
                          {editingUserBalance === adminUser.id ? (
                            <div className="admin-balance-edit">
                              <input
                                type="number"
                                className="form-input"
                                min="0"
                                value={balanceEditValue}
                                onChange={(e) =>
                                  setBalanceEditValue(e.target.value)
                                }
                                style={{
                                  width: "100px",
                                  padding: "0.4rem 0.6rem",
                                }}
                              />
                              <button
                                className="btn btn-primary"
                                style={{
                                  padding: "0.35rem 0.75rem",
                                  fontSize: "0.8rem",
                                }}
                                onClick={() =>
                                  handleUpdateUserBalance(adminUser.id)
                                }
                              >
                                שמור
                              </button>
                              <button
                                className="btn btn-secondary"
                                style={{
                                  padding: "0.35rem 0.75rem",
                                  fontSize: "0.8rem",
                                }}
                                onClick={() => {
                                  setEditingUserBalance(null);
                                  setBalanceEditValue("");
                                }}
                              >
                                ביטול
                              </button>
                            </div>
                          ) : (
                            <span className="admin-user-points">
                              {adminUser.balance.toLocaleString()} נקודות
                            </span>
                          )}
                        </div>
                        <div className="admin-user-actions">
                          {editingUserBalance !== adminUser.id && (
                            <button
                              className="btn btn-secondary"
                              style={{
                                padding: "0.4rem 0.6rem",
                                fontSize: "0.85rem",
                              }}
                              onClick={() => {
                                setEditingUserBalance(adminUser.id);
                                setBalanceEditValue(String(adminUser.balance));
                              }}
                              title="ערוך ניקוד"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {adminUser.id !== user.id && (
                            <button
                              className="btn btn-danger"
                              style={{
                                padding: "0.4rem 0.6rem",
                                fontSize: "0.85rem",
                              }}
                              onClick={() =>
                                handleDeleteUser(
                                  adminUser.id,
                                  adminUser.username,
                                )
                              }
                              title="מחק משתמש"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Custom Match */}
              <div className="glass-panel admin-card">
                <h3>הוספת משחק מותאם אישית ללוח</h3>
                <form
                  onSubmit={handleCreateCustomMatch}
                  style={{
                    display: "flex",
                    gap: "1rem",
                    flexWrap: "wrap",
                    marginTop: "1rem",
                  }}
                >
                  <div
                    className="form-group"
                    style={{ flex: 1, minWidth: "150px" }}
                  >
                    <label>נבחרת בית</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="למשל: ארגנטינה"
                      value={customHomeTeam}
                      onChange={(e) => setCustomHomeTeam(e.target.value)}
                    />
                  </div>
                  <div
                    className="form-group"
                    style={{ flex: 1, minWidth: "150px" }}
                  >
                    <label>נבחרת חוץ</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="למשל: ברזיל"
                      value={customAwayTeam}
                      onChange={(e) => setCustomAwayTeam(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ width: "120px" }}>
                    <label>שלב בטורניר</label>
                    <input
                      type="text"
                      className="form-input"
                      value={customStage}
                      onChange={(e) => setCustomStage(e.target.value)}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      marginBottom: "1.25rem",
                    }}
                  >
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ padding: "0.85rem 1.5rem" }}
                    >
                      <Plus size={18} />
                      הוסף משחק
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 5: TOURNAMENT LONG-TERM PREDICTIONS */}
          {activeTab === "tournament" && (
            <div>
              <div className="section-title">
                <Trophy size={24} style={{ color: "var(--accent)" }} />
                <h2>ניחושים ארוכי טווח - מונדיאל 2026</h2>
              </div>

              <div className="glass-panel long-term-card">
                <h3>ניחוש מנצחת הטורניר ומלך השערים</h3>
                <p
                  style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}
                >
                  בחר את הנבחרת שתניף את הגביע ואת השחקן שיזכה בנעל הזהב! ניתן
                  לשנות את הניחושים עד שריקת הפתיחה של הטורניר ב-11 ביוני 2026
                  בשעה 22:00 (שעון ישראל).
                </p>

                {isTournamentLocked() && (
                  <div className="long-term-locked-badge">
                    <Lock size={18} />
                    <span>הניחושים ננעלו! הטורניר כבר החל.</span>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.5rem",
                    marginTop: "1rem",
                  }}
                >
                  {/* Select Winner Team */}
                  <div className="long-term-select-group">
                    <label>🏆 מנצחת הטורניר (הנבחרת שתזכה בגביע)</label>

                    {!isTournamentLocked() ? (
                      <div className="searchable-select-wrapper">
                        <div
                          className="selected-display-box"
                          style={{ cursor: "pointer" }}
                          onClick={() => setTeamDropdownOpen(!teamDropdownOpen)}
                        >
                          {selectedTeam ? (
                            <>
                              <img
                                src={selectedTeam.crest}
                                alt={selectedTeam.name}
                                style={{
                                  width: "30px",
                                  height: "20px",
                                  objectFit: "cover",
                                  borderRadius: "3px",
                                }}
                              />
                              <strong style={{ color: "white" }}>
                                {selectedTeam.name}
                              </strong>
                            </>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>
                              בחר נבחרת...
                            </span>
                          )}
                        </div>

                        {teamDropdownOpen && (
                          <div className="select-dropdown-list">
                            <div
                              style={{
                                padding: "0.5rem",
                                borderBottom: "1px solid var(--border-light)",
                                position: "sticky",
                                top: 0,
                                background: "var(--bg-surface-opaque)",
                                zIndex: 10,
                              }}
                            >
                              <input
                                type="text"
                                className="form-input searchable-select-input"
                                placeholder="חפש נבחרת..."
                                value={searchTeamQuery}
                                onChange={(e) =>
                                  setSearchTeamQuery(e.target.value)
                                }
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            {allTeams
                              .filter((t) =>
                                t.name
                                  .toLowerCase()
                                  .includes(searchTeamQuery.toLowerCase()),
                              )
                              .map((t) => (
                                <div
                                  key={t.id}
                                  className={`select-dropdown-item ${selectedTeam?.id === t.id ? "selected" : ""}`}
                                  onClick={() => {
                                    setSelectedTeam(t);
                                    setTeamDropdownOpen(false);
                                    setSearchTeamQuery("");
                                  }}
                                >
                                  <img
                                    src={t.crest}
                                    alt={t.name}
                                    style={{
                                      width: "24px",
                                      height: "16px",
                                      objectFit: "cover",
                                      borderRadius: "2px",
                                    }}
                                  />
                                  <span>{t.name}</span>
                                </div>
                              ))}
                            {allTeams.filter((t) =>
                              t.name
                                .toLowerCase()
                                .includes(searchTeamQuery.toLowerCase()),
                            ).length === 0 && (
                              <div
                                style={{
                                  padding: "1rem",
                                  color: "var(--text-muted)",
                                  textAlign: "center",
                                }}
                              >
                                לא נמצאו נבחרות
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className="selected-display-box"
                        style={{
                          background: "rgba(255,255,255,0.01)",
                          opacity: 0.8,
                        }}
                      >
                        {selectedTeam ? (
                          <>
                            <img
                              src={selectedTeam.crest}
                              alt={selectedTeam.name}
                              style={{
                                width: "30px",
                                height: "20px",
                                objectFit: "cover",
                                borderRadius: "3px",
                              }}
                            />
                            <strong style={{ color: "white" }}>
                              {selectedTeam.name}
                            </strong>
                          </>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>
                            לא נבחרה נבחרת
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Select Top Scorer Player */}
                  <div className="long-term-select-group">
                    <label>🎯 מלך השערים (השחקן שיזכה בנעל הזהב)</label>

                    {!isTournamentLocked() ? (
                      <div className="searchable-select-wrapper">
                        <div
                          className="selected-display-box"
                          style={{ cursor: "pointer" }}
                          onClick={() =>
                            setPlayerDropdownOpen(!playerDropdownOpen)
                          }
                        >
                          {selectedPlayer ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              <strong style={{ color: "white" }}>
                                {selectedPlayer.name}
                              </strong>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {selectedPlayer.position} |{" "}
                                {allTeams.find(
                                  (t) =>
                                    String(t.id) ===
                                    String(selectedPlayer.team_id),
                                )?.name || "נבחרת"}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>
                              בחר שחקן...
                            </span>
                          )}
                        </div>

                        {playerDropdownOpen && (
                          <div className="select-dropdown-list">
                            <div
                              style={{
                                padding: "0.5rem",
                                borderBottom: "1px solid var(--border-light)",
                                position: "sticky",
                                top: 0,
                                background: "var(--bg-surface-opaque)",
                                zIndex: 10,
                              }}
                            >
                              <input
                                type="text"
                                className="form-input searchable-select-input"
                                placeholder="חפש שחקן לפי שם..."
                                value={searchPlayerQuery}
                                onChange={(e) =>
                                  setSearchPlayerQuery(e.target.value)
                                }
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            {allPlayers
                              .filter((p) =>
                                p.name
                                  .toLowerCase()
                                  .includes(searchPlayerQuery.toLowerCase()),
                              )
                              .map((p) => {
                                const team = allTeams.find(
                                  (t) => String(t.id) === String(p.team_id),
                                );
                                return (
                                  <div
                                    key={p.id}
                                    className={`select-dropdown-item ${selectedPlayer?.id === p.id ? "selected" : ""}`}
                                    onClick={() => {
                                      setSelectedPlayer(p);
                                      setPlayerDropdownOpen(false);
                                      setSearchPlayerQuery("");
                                    }}
                                    style={{ justifyContent: "space-between" }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        flexDirection: "column",
                                      }}
                                    >
                                      <span>{p.name}</span>
                                      <span
                                        style={{
                                          fontSize: "0.7rem",
                                          color: "var(--text-muted)",
                                        }}
                                      >
                                        {p.position}
                                      </span>
                                    </div>
                                    {team && (
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "0.35rem",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: "0.75rem",
                                            color: "var(--text-secondary)",
                                          }}
                                        >
                                          {team.name}
                                        </span>
                                        <img
                                          src={team.crest}
                                          alt={team.name}
                                          style={{
                                            width: "18px",
                                            height: "12px",
                                            objectFit: "cover",
                                            borderRadius: "1px",
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            {allPlayers.filter((p) =>
                              p.name
                                .toLowerCase()
                                .includes(searchPlayerQuery.toLowerCase()),
                            ).length === 0 && (
                              <div
                                style={{
                                  padding: "1rem",
                                  color: "var(--text-muted)",
                                  textAlign: "center",
                                }}
                              >
                                לא נמצאו שחקנים במערכת
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className="selected-display-box"
                        style={{
                          background: "rgba(255,255,255,0.01)",
                          opacity: 0.8,
                        }}
                      >
                        {selectedPlayer ? (
                          <div
                            style={{ display: "flex", flexDirection: "column" }}
                          >
                            <strong style={{ color: "white" }}>
                              {selectedPlayer.name}
                            </strong>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {selectedPlayer.position} |{" "}
                              {allTeams.find(
                                (t) =>
                                  String(t.id) ===
                                  String(selectedPlayer.team_id),
                              )?.name || "נבחרת"}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>
                            לא נבחר שחקן
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {!isTournamentLocked() && (
                  <button
                    className="btn btn-primary"
                    style={{
                      width: "100%",
                      marginTop: "1.5rem",
                      padding: "1rem",
                    }}
                    onClick={saveLongTermPredictionAction}
                    disabled={longTermSaving}
                  >
                    <Trophy size={18} />
                    {longTermSaving
                      ? "שומר ניחושים..."
                      : "שמור ניחושים ארוכי טווח 💾"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* LEFT SIDE: Leaderboard widget shown next to everything on Desktop */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          <div className="glass-panel" style={{ padding: "1.5rem" }}>
            <h3
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "1rem",
                borderBottom: "1px solid var(--border-light)",
                paddingBottom: "0.5rem",
              }}
            >
              <TrendingUp size={20} style={{ color: "var(--accent)" }} />
              טבלה מהירה
            </h3>

            <div className="leaderboard-list">
              {leaderboard.slice(0, 5).map((player, idx) => (
                <div
                  key={player.id}
                  className="leaderboard-item"
                  style={{
                    padding: "0.75rem",
                    borderRadius: "12px",
                    fontSize: "0.9rem",
                  }}
                >
                  <div
                    className="leaderboard-rank"
                    style={{ fontSize: "0.9rem", width: "24px" }}
                  >
                    {idx === 0 ? "👑" : idx + 1}
                  </div>
                  <div className="leaderboard-info">
                    <span style={{ fontWeight: "700" }}>{player.username}</span>
                  </div>
                  <div className="leaderboard-score">
                    <span style={{ fontWeight: "700", color: "var(--accent)" }}>
                      {player.balance.toLocaleString()} נק׳
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              className="btn btn-secondary"
              style={{
                width: "100%",
                marginTop: "1rem",
                fontSize: "0.85rem",
                padding: "0.5rem",
              }}
              onClick={() => setActiveTab("leaderboard")}
            >
              לצפייה בדירוג המלא <ChevronRight size={14} />
            </button>
          </div>

          {/* Quick rules / Betting settings widget */}
          <div
            className="glass-panel"
            style={{
              padding: "1.5rem",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
            }}
          >
            <h4
              style={{
                color: "white",
                marginBottom: "0.5rem",
                fontWeight: "700",
              }}
            >
              ℹ️ חוקי הניקוד של החברים:
            </h4>
            <ul
              style={{
                listStyleType: "none",
                paddingLeft: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              <li>
                ⚽ <strong>ניחוש תוצאה (2 נקודות):</strong> ניחוש נכון של מנצחת
                או תיקו מעניק 2 נקודות!
              </li>
              <li>
                🎯 <strong>ניחוש מדויק (5 נקודות):</strong> ניחוש נכון של התוצאה
                המדויקת מעניק 5 נקודות!
              </li>
              <li>
                ⏰ <strong>נעילה:</strong> הניחושים ננעלים אוטומטית בדיוק ברגע
                שריקת הפתיחה.
              </li>
              <li>
                🏆 <strong>נקודות פתיחה:</strong> כל שחקן מתחיל עם 0 נקודות
                וצובר נקודות מניחושים מוצלחים בלבד.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* --- MATCH DETAILS / BET SLIP DRAWER (SLIDES UP ON CLICK) --- */}
      {betSlipMatch && (
        <div className="betslip-backdrop" onClick={() => setBetSlipMatch(null)}>
          <div
            className="betslip-drawer"
            onClick={(e) => e.stopPropagation()}
            style={{ direction: "rtl" }}
          >
            <div className="betslip-header">
              <h3>
                {isMatchLocked(betSlipMatch)
                  ? "פרטי המשחק וניחושי החברים"
                  : betSlipMatch.myBet
                    ? "עדכון / ביטול ניחוש"
                    : "שליחת ניחוש חדש"}
              </h3>
              <button
                onClick={() => setBetSlipMatch(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                <X size={24} />
              </button>
            </div>

            <div className="betslip-match-detail">
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <img
                  src={betSlipMatch.homeFlag}
                  alt={betSlipMatch.homeTeam}
                  style={{
                    width: "30px",
                    height: "20px",
                    objectFit: "cover",
                    borderRadius: "3px",
                  }}
                />
                <span style={{ fontWeight: "700" }}>
                  {betSlipMatch.homeTeam}
                </span>
              </div>

              {/* מציג תוצאה חיה/סופית בתוך המגירה אם קיימת */}
              {betSlipMatch.status === "SCHEDULED" ? (
                <span style={{ color: "var(--text-muted)" }}>נגד</span>
              ) : (
                <span
                  style={{
                    fontWeight: "800",
                    color: "var(--accent)",
                    fontSize: "1.25rem",
                  }}
                >
                  {betSlipMatch.homeScore} - {betSlipMatch.awayScore}
                </span>
              )}

              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <span style={{ fontWeight: "700" }}>
                  {betSlipMatch.awayTeam}
                </span>
                <img
                  src={betSlipMatch.awayFlag}
                  alt={betSlipMatch.awayTeam}
                  style={{
                    width: "30px",
                    height: "20px",
                    objectFit: "cover",
                    borderRadius: "3px",
                  }}
                />
              </div>
            </div>

            {(betSlipMatch.status === "LIVE" || betSlipMatch.status === "FINISHED") &&
              betSlipMatch.scorers && betSlipMatch.scorers.length > 0 && (
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                  textAlign: "center",
                  padding: "0.4rem 0.8rem",
                  background: "rgba(255, 255, 255, 0.03)",
                  borderRadius: "8px",
                  margin: "0.5rem auto 1rem auto",
                  maxWidth: "80%",
                  border: "1px solid var(--border-light)",
                }}
              >
                <span style={{ color: "var(--accent)", marginLeft: "0.25rem" }}>
                  ⚽
                </span>
                {betSlipMatch.scorers.join(" • ")}
              </div>
            )}

            {/* מציג את אזור ההימור והכפתורים רק אם המשחק עדיין פתוח להימורים */}
            {!isMatchLocked(betSlipMatch) ? (
              <>
                {/* Select Bet Type Buttons in drawer - Horizontal options strip */}
                <div className="betslip-options-strip">
                  <button
                    className={`tab-btn ${betType === "HOME" ? "active" : ""}`}
                    onClick={() => setBetType("HOME")}
                  >
                    ניצחון {betSlipMatch.homeTeam} (2 נק׳)
                  </button>
                  <button
                    className={`tab-btn ${betType === "DRAW" ? "active" : ""}`}
                    onClick={() => setBetType("DRAW")}
                  >
                    תיקו (2 נק׳)
                  </button>
                  <button
                    className={`tab-btn ${betType === "AWAY" ? "active" : ""}`}
                    onClick={() => setBetType("AWAY")}
                  >
                    ניצחון {betSlipMatch.awayTeam} (2 נק׳)
                  </button>
                  <button
                    className={`tab-btn ${betType === "EXACT_SCORE" ? "active" : ""}`}
                    onClick={() => setBetType("EXACT_SCORE")}
                    style={{ border: "1px solid var(--accent)" }}
                  >
                    מדויק (5 נק׳)
                  </button>
                </div>

                {/* If Exact Score, render inputs - static container with smooth transitions */}
                <div
                  className={`betslip-exact-score-container ${betType === "EXACT_SCORE" ? "active" : ""}`}
                >
                  <span className="betslip-multiplier-badge">
                    ניקוד פרימיום של 5 נקודות בניחוש מדויק! ⭐
                  </span>
                  <div className="score-inputs">
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {betSlipMatch.homeTeam}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="form-input score-input-box"
                        value={predHome}
                        onFocus={(e) => e.target.select()}
                        onChange={handleScoreInput(setPredHome)}
                        onBlur={() => handleScoreBlur(predHome, setPredHome)}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: "2rem",
                        color: "var(--text-muted)",
                        paddingTop: "1rem",
                      }}
                    >
                      -
                    </span>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {betSlipMatch.awayTeam}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="form-input score-input-box"
                        value={predAway}
                        onFocus={(e) => e.target.select()}
                        onChange={handleScoreInput(setPredAway)}
                        onBlur={() => handleScoreBlur(predAway, setPredAway)}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              // אם המשחק נעול, נראה למשתמש סיכום קטן של מה שהוא עצמו הימר (אם הימר)
              betSlipMatch.myBet && (
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    padding: "0.75rem",
                    borderRadius: "10px",
                    textAlign: "center",
                    margin: "1rem 0",
                    border: "1px solid var(--border-light)",
                  }}
                >
                  🎯 הניחוש שלך למשחק זה היה:{" "}
                  <strong>
                    {getBetTypeLabel(
                      betSlipMatch.myBet.betType,
                      betSlipMatch.myBet.predictedHomeScore,
                      betSlipMatch.myBet.predictedAwayScore,
                    )}
                  </strong>
                </div>
              )
            )}

            {/* Community predictions list - יעבוד תמיד! */}
            {betSlipMatch.communityPredictions &&
            betSlipMatch.communityPredictions.length > 0 ? (
              <div
                className="community-predictions-list"
                style={{ marginTop: "1.5rem" }}
              >
                <h4>
                  ניחושי החברים ({betSlipMatch.communityPredictions.length})
                </h4>
                <div
                  className="community-predictions-scroll"
                  style={{ maxHeight: "200px", overflowY: "auto" }}
                >
                  {betSlipMatch.communityPredictions.map((pred, idx) => (
                    <div
                      key={`${pred.username}-${idx}`}
                      className={`community-prediction-item ${pred.isCurrentUser ? "is-me" : ""}`}
                    >
                      <span className="community-pred-username">
                        {pred.isCurrentUser ? "את/ה" : pred.username}
                      </span>
                      <span className="community-pred-choice">
                        {getBetTypeLabel(
                          pred.betType,
                          pred.predictedHomeScore,
                          pred.predictedAwayScore,
                        )}
                      </span>
                      <span
                        className={`community-pred-status ${pred.status.toLowerCase()}`}
                      >
                        {pred.status === "PENDING" && "ממתין"}
                        {pred.status === "WON" && "פגע ✓"}
                        {pred.status === "LOST" && "לא פגע"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--text-secondary)",
                  padding: "1rem 0",
                }}
              >
                אין עדיין ניחושים של חברים למשחק זה.
              </div>
            )}

            {/* Community Distribution */}
            {betSlipMatch.predictionDistribution &&
              betSlipMatch.predictionDistribution.total > 0 && (
                <div
                  className="community-distribution"
                  style={{ marginTop: "1.5rem" }}
                >
                  <h4>התפלגות הניחושים:</h4>
                  <div className="distribution-bar-wrapper">
                    <div className="distribution-bar-label">
                      <span>ניצחון {betSlipMatch.homeTeam}</span>
                      <span>{betSlipMatch.predictionDistribution.home}%</span>
                    </div>
                    <div className="distribution-progress-bg">
                      <div
                        className="distribution-progress-fill home"
                        style={{
                          width: `${betSlipMatch.predictionDistribution.home}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="distribution-bar-wrapper">
                    <div className="distribution-bar-label">
                      <span>תיקו</span>
                      <span>{betSlipMatch.predictionDistribution.draw}%</span>
                    </div>
                    <div className="distribution-progress-bg">
                      <div
                        className="distribution-progress-fill draw"
                        style={{
                          width: `${betSlipMatch.predictionDistribution.draw}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="distribution-bar-wrapper">
                    <div className="distribution-bar-label">
                      <span>ניצחון {betSlipMatch.awayTeam}</span>
                      <span>{betSlipMatch.predictionDistribution.away}%</span>
                    </div>
                    <div className="distribution-progress-bg">
                      <div
                        className="distribution-progress-fill away"
                        style={{
                          width: `${betSlipMatch.predictionDistribution.away}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="distribution-bar-wrapper">
                    <div className="distribution-bar-label">
                      <span>תוצאה מדויקת</span>
                      <span>{betSlipMatch.predictionDistribution.exact}%</span>
                    </div>
                    <div className="distribution-progress-bg">
                      <div
                        className="distribution-progress-fill exact"
                        style={{
                          width: `${betSlipMatch.predictionDistribution.exact}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                  <div className="distribution-total-votes">
                    סה"כ מנחשים: {betSlipMatch.predictionDistribution.total}
                  </div>
                </div>
              )}

            {/* Action Buttons Row - מוצג רק אם המשחק פתוח לעריכה */}
            {!isMatchLocked(betSlipMatch) ? (
              <div
                style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}
              >
                {betSlipMatch.myBet && (
                  <button
                    className="btn btn-danger"
                    style={{ flex: 1, padding: "0.85rem" }}
                    onClick={cancelBet}
                  >
                    ביטול הימור
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  style={{ flex: 2, padding: "0.85rem" }}
                  onClick={placeBet}
                >
                  {betSlipMatch.myBet ? "עדכן ניחוש 💾" : "שמור ניחוש ⚽"}
                </button>
              </div>
            ) : (
              // כפתור סגירה פשוט למשחקים נעולים
              <div style={{ marginTop: "1.5rem" }}>
                <button
                  className="btn btn-secondary"
                  style={{ width: "100%", padding: "0.85rem" }}
                  onClick={() => setBetSlipMatch(null)}
                >
                  סגור חלון
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
