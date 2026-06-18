// טעינת משתני הסביבה (כדי לקרוא את ה-CLOUD_DB_URL מה-.env)
require("dotenv").config();

const db = require("./database");
const FootballApiService = require("./apiService");
const apiService = new FootballApiService(db);

async function migrateAndRecalculate() {
  console.log("=== מתחיל תהליך חישוב מחדש של נקודות והימורים ===");

  // בדיקה מול איזה DB אנחנו עובדים
  if (process.env.CLOUD_DB_URL) {
    console.log(
      `🌐 שרת חיצוני מזהה! מתחבר ל-Firebase בכתובת: ${process.env.CLOUD_DB_URL}`,
    );
    // נותנים לשרת שנייה לטעון את הנתונים מהענן בפעם הראשונה
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } else {
    console.log("📂 עובד במצב מקומי על קובץ db.json");
  }

  // 1. שליפת הנתונים האמיתיים מה-DB (אם זה ענן, זה יביא מהענן!)
  const users = db.getUsers();
  const bets = db.getBets();
  const matches = db.getMatches();

  if (!users.length && !bets.length) {
    console.log(
      "⚠️ לא נמצאו נתונים. אם אתה מחובר לענן, ודא שההתחברות הצליחה או המתן עוד מספר שניות.",
    );
    return;
  }

  console.log(`נמצאו ${users.length} משתמשים ו-${bets.length} הימורים במערכת.`);

  // 2. איפוס מאזן הנקודות והסטטיסטיקות של המשתמשים
  users.forEach((user) => {
    user.balance = 0; //
    user.totalBets = 0;
    user.winRate = 0;
    db.saveUser(user);
  });
  console.log("✅ כל מאזני הנקודות של המשתמשים הוגדרו מחדש ל-0.");

  // 3. החזרת כל ההימורים של משחקים שהסתיימו לסטטוס PENDING
  let resetCount = 0;
  bets.forEach((bet) => {
    const match = matches.find((m) => m.id === bet.matchId);
    if (match && match.status === "FINISHED") {
      bet.status = "PENDING";
      bet.payout = 0;
      db.saveBet(bet);
      resetCount++;
    }
  });
  console.log(
    `✅ החזרנו ${resetCount} הימורים של משחקים שהסתיימו לסטטוס PENDING.`,
  );

  // 4. הרצת הלוגיקה החדשה מתוך apiService שתחשב הכל מחדש
  console.log("🏃 מריץ את לוגיקת החישוב המעודכנת...");
  const updated = apiService.resolveFinishedBets();

  if (updated) {
    console.log(
      "🎉 כל הנקודות וההימורים בענן חושבו מחדש בהצלחה לפי החוקים החדשים!",
    );
  } else {
    console.log("⚠️ הלוגיקה רצה אך לא עודכנו הימורים.");
  }

  // מחכים שנייה לוודא שכל פקודות ה-PUT נשלחו לענן לפני שהסקריפט נסגר
  console.log("⏳ מסנכרן שינויים סופיים מול השרת החיצוני...");
  await new Promise((resolve) => setTimeout(resolve, 3000));
  console.log("=== התהליך הסתיים בהצלחה והענן מעודכן! ===");
}

// הרצת הסקריפט
migrateAndRecalculate().catch((err) => {
  console.error("שגיאה במהלך החישוב מחדש:", err);
});
