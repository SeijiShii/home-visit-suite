// 自動生成ファイル — 直接編集しない。
// 生成元: docs/manual/**/*.md / 生成スクリプト: pwa/scripts/manual/build.mjs
// 仕様: docs/wants/12_操作マニュアル.md

/** マニュアルのトピック ID。ページを消すとここから消え、参照側が tsc で落ちる。 */
export type ManualTopic = "areas" | "dashboard" | "feedback" | "getting-started" | "map" | "regions" | "requests" | "settings" | "users" | "visits";

export interface ManualPageData {
  id: ManualTopic;
  title: string;
  /** 対応するアプリのルート（無ければ null） */
  route: string | null;
  status: "draft" | "published";
  /** sources の変更後に本文が更新されていない可能性がある */
  stale: boolean;
  html: string;
}

/** 執筆言語。未訳ロケールはここへフォールバックする。 */
export const MANUAL_BASE_LOCALE = "ja";

/** 目次の並び順（ファイル名順）。 */
export const MANUAL_ORDER: readonly ManualTopic[] = [
  "getting-started",
  "dashboard",
  "map",
  "areas",
  "visits",
  "regions",
  "users",
  "requests",
  "feedback",
  "settings",
];

/** ルート → トピックの対応（":param" はワイルドカードとして照合する）。 */
export const MANUAL_ROUTE_TOPICS: readonly (readonly [string, ManualTopic])[] = [
  ["/", "dashboard"],
  ["/map", "map"],
  ["/areas", "areas"],
  ["/visits/:areaId", "visits"],
  ["/regions", "regions"],
  ["/users", "users"],
  ["/requests", "requests"],
  ["/feedback", "feedback"],
  ["/settings", "settings"],
];

export const MANUAL_PAGES: Record<string, Partial<Record<ManualTopic, ManualPageData>>> = {
  "ja": {
    "getting-started": {
      id: "getting-started",
      title: "はじめての設定",
      route: null,
      status: "published",
      stale: false,
      html: "<p>このアプリを初めて開いたときの流れです。やることは 3 つのうちのどれか 1 つだけです。</p>\n<ul><li><strong>新しくグループを始める</strong> → 「新しく ID を作成する」</li><li><strong>誰かに招待された</strong> → 招待 URL を開く</li><li><strong>すでに使っている自分の別の端末がある</strong> → 「既存の自分の端末から引き継ぐ」</li></ul>\n<figure class=\"manual-shot manual-shot-missing\"><div class=\"manual-shot-placeholder\">onboarding-choose</div><figcaption>最初に表示される選択画面</figcaption></figure>\n<h2>新しく ID を作成する</h2>\n<p>初めてこのアプリを使う場合はこちらです。あなたがそのグループの最初のメンバー、つまり<strong>管理者</strong>になります。</p>\n<ol><li>「新しく ID を作成する」を選びます。</li><li><strong>表示名</strong>を入力します。ほかのメンバーの画面に表示される名前です。</li><li><strong>グループ名</strong>を入力します。あなたが管理者となる新しいグループが作られます。</li><li>「はじめる」を押すと <a class=\"manual-inline-link\" href=\"#/manual/dashboard\">ダッシュボード</a> が開きます。</li></ol>\n<h2>招待された場合</h2>\n<p>招待 URL（<code>#/join?...</code> を含む URL）をブラウザで開くと、参加画面が表示されます。 まだ自分の ID を作っていない場合は、先に ID の作成へ案内されます。</p>\n<p>参加が成立すると、招待に設定されていたロール（管理者・編集メンバー・活動メンバー）があなたに割り当てられます。 招待した側がその場にいなくても参加できます。少し時間をおいてから成立することがあります。</p>\n<h2>別の端末から引き継ぐ</h2>\n<p>同じ人が複数の端末（パソコンとスマートフォンなど）で使う場合は、<strong>新しく ID を作らずに引き継ぎます</strong>。 別々に ID を作ってしまうと別人として扱われるので注意してください。</p>\n<ol><li>すでに使っている端末で <a class=\"manual-inline-link\" href=\"#/manual/settings\">設定</a> を開き、「デバイス」の QR コードを表示します。</li><li>新しい端末のカメラアプリでその QR を撮影して開くか、表示された URL を新しい端末のブラウザに貼り付けます。</li><li>自動で引き継ぎが行われ、同じ ID・同じグループのデータが使えるようになります。</li></ol>\n<p>QR には数分の有効期限があります。期限が切れた場合は、既存端末で新しい QR を発行し直してください。</p>\n<h2>使用許諾への同意</h2>\n<p>初回起動時と、使用許諾・免責事項が改定されたときは、全文が表示され同意を求められます。 同意しないとアプリは利用できません。全文は後から <a class=\"manual-inline-link\" href=\"#/manual/settings\">設定</a> でいつでも読み返せます。</p>",
    },
    "dashboard": {
      id: "dashboard",
      title: "ダッシュボード",
      route: "/",
      status: "draft",
      stale: false,
      html: "<p>アプリを開いたときに最初に表示される画面です。通知と、自分がアクセスできる区域の一覧を確認できます。</p>",
    },
    "map": {
      id: "map",
      title: "区域編集（地図）",
      route: "/map",
      status: "draft",
      stale: false,
      html: "<p>地図上にポリゴンを描いて区域の範囲を決め、区域ツリーと紐付ける画面です。編集メンバー以上が使います。 画面の幅が狭い端末（スマートフォンなど）では表示されません。</p>",
    },
    "areas": {
      id: "areas",
      title: "区域一覧",
      route: "/areas",
      status: "draft",
      stale: false,
      html: "<p>区域親番ごとに区域を一覧し、チェックアウトの割り当て・回収・招待を行う画面です。編集メンバー以上が使います。</p>",
    },
    "visits": {
      id: "visits",
      title: "訪問記録",
      route: "/visits/:areaId",
      status: "draft",
      stale: false,
      html: "<p>区域の地図を見ながら訪問の結果を記録する画面です。場所の追加や編集リクエストもここから行います。</p>",
    },
    "regions": {
      id: "regions",
      title: "領域管理",
      route: "/regions",
      status: "draft",
      stale: false,
      html: "<p>領域・区域親番・区域という区分けの体系を作り、記号や番号を管理する画面です。管理者のみが使います。 画面の幅が狭い端末（スマートフォンなど）では表示されません。</p>",
    },
    "users": {
      id: "users",
      title: "メンバー管理",
      route: "/users",
      status: "draft",
      stale: false,
      html: "<p>グループのメンバーを招待し、ロール（管理者・編集メンバー・活動メンバー）を管理する画面です。管理者のみが使います。</p>",
    },
    "requests": {
      id: "requests",
      title: "申請管理",
      route: "/requests",
      status: "draft",
      stale: false,
      html: "<p>活動メンバーから上がってきた申請（場所の削除・情報修正・地図の更新など）を確認して処理する画面です。編集メンバー以上が使います。</p>",
    },
    "feedback": {
      id: "feedback",
      title: "フィードバック",
      route: "/feedback",
      status: "draft",
      stale: false,
      html: "<p>グループの管理者、またはアプリの開発者へ、バグ報告や要望を送る画面です。すべてのメンバーが使えます。</p>",
    },
    "settings": {
      id: "settings",
      title: "設定",
      route: "/settings",
      status: "draft",
      stale: false,
      html: "<p>表示名・表示言語の変更、端末の追加と管理、使用許諾の閲覧、アプリの情報確認を行う画面です。</p>",
    },
  },
};
