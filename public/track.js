// ページアクセスの自己申告ビーコン。管理画面のアクセス数可視化用([新規])。
// public/配下は静的アセットとして直接配信されるため、Worker側だけでは
// ページアクセスを捕捉できない。副作用importとして各htmlから読み込むだけでよい。
import { getUserId } from "./auth.js";

try {
  const body = JSON.stringify({ path: location.pathname, user_id: getUserId() });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/track/pageview",
      new Blob([body], { type: "application/json" }),
    );
  } else {
    fetch("/api/track/pageview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }
} catch {
  /* 計測に失敗してもページの利用自体は継続できる */
}
