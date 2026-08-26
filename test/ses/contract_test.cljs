(ns ses.contract-test
  "ses の面どうしの契約を固定する。

  ses は L3 dispatcher CF Worker で、DB 書き込みは mitama 側（asyncpg）に委譲する。
  この repo の実体は『複数の面が同じ actor・同じ安全境界について同じことを言っている』
  という合意である:

    src/app.ts             edge handler（auth / NSID guard / /_app/meta / XRPC 転送）
    src/dispatcher.ts      bpmn-dispatcher への HMAC 転送
    wrangler.jsonc         配備（routes / vars —— HYPERDRIVE 無し）
    kotodama.jsonld        actor identity（DID / nanoid / nsidPrefixes）
    package.json           version
    CLAUDE.md              CRITICAL Forbidden Patterns と jokyo 状態機械

  どの面も他を import していないので、片方だけ直した drift は throw しない
  —— identity 文書と worker が別の DID を名乗っても、配備は成功し、
  did:web を解決した相手と実際に喋る相手が別人になって初めて分かる。

  **CRITICAL をここが見る理由。** CLAUDE.md は HYPERDRIVE 禁止・NSID guard・
  Bearer auth・non-federable・append-only jokyo を **MUST** と書いているが、
  それを強制するコードは散文とコメント以外には無かった。散文は配備を止めない。

  抽出の床: 各抽出は見つからなければ throw する。『抽出できなかった』が
  『合意している』と同じ顔をしてはならない。"
  (:require [clojure.string :as str]
            [clojure.test :refer [deftest is testing]]
            ["fs" :as fs]))

;; ─── 抽出（見つからなければ throw） ─────────────────────────────────────

(defn- slurp-file [path] (fs/readFileSync path "utf8"))

(defn- extract-1
  [src re path what]
  (or (second (re-find re src))
      (throw (ex-info (str "extraction failed: " what " not found in " path)
                      {:path path :what what}))))

(defn- non-empty! [coll path what]
  (when (empty? coll)
    (throw (ex-info (str "extraction floor: 0 " what " extracted from " path)
                    {:path path :what what})))
  coll)

(defn- read-json [path]
  (js->clj (js/JSON.parse (slurp-file path)) :keywordize-keys true))

(defn- read-jsonc [path]
  (->> (str/split-lines (slurp-file path))
       (remove #(str/starts-with? (str/triml %) "//"))
       (str/join "\n")
       js/JSON.parse
       (#(js->clj % :keywordize-keys true))))

(def app-ts (delay (slurp-file "src/app.ts")))
(def dispatcher-ts (delay (slurp-file "src/dispatcher.ts")))
(def claude-md (delay (slurp-file "CLAUDE.md")))
(def kotodama (delay (read-json "kotodama.jsonld")))
(def wrangler (delay (read-jsonc "wrangler.jsonc")))
(def pkg (delay (read-json "package.json")))

(def worker
  (delay
   {:root-did        (extract-1 @app-ts #"c\.json\(\{ app: \"ses\", did: \"([^\"]+)\"" "src/app.ts" "root / did")
    :meta-default-did (extract-1 @app-ts #"SES_ACTOR_DID \?\? \"([^\"]+)\"" "src/app.ts" "SES_ACTOR_DID fallback")
    :nsid-prefix     (extract-1 @app-ts #"nsid\.startsWith\(\"([^\"]+)\"\)" "src/app.ts" "NSID guard prefix")
    :public-paths    (->> ["\"/health\"" "\"/_worker/health\"" "\"/_app/meta\"" "\"/\""]
                          (map #(when-not (str/includes? @app-ts %) (throw (ex-info (str "public path " % " missing") {}))))
                          count)
    :surfaces        (->> (re-seq #"\"/xrpc/com\.etzhayyim\.apps\.ses\.[^\"]+\"" @app-ts)
                          (map #(subs % 1 (dec (count %))))
                          (#(non-empty! % "src/app.ts" "documented XRPC surfaces"))
                          set)
    :jokyo-values    (let [block (extract-1 @app-ts #"jokyoValues: (\[[^\]]+\])" "src/app.ts" "jokyoValues array")]
                       (vec (js->clj (js/JSON.parse block))))
    :auth-401        (boolean (re-find #"Bearer token required" @app-ts))
    :not-found-404   (boolean (re-find #"app\.notFound" @app-ts))}))

(def expected-jokyo
  ["提案中" "選考中" "契約" "稼働中" "終了" "見送り" "中途終了"])

(def expected-surfaces
  #{"/xrpc/com.etzhayyim.apps.ses.ingestAnken"
    "/xrpc/com.etzhayyim.apps.ses.updateJokyo"
    "/xrpc/com.etzhayyim.apps.ses.getAnken"
    "/xrpc/com.etzhayyim.apps.ses.listAnken"
    "/xrpc/com.etzhayyim.apps.ses.listJokyo"
    "/xrpc/com.etzhayyim.apps.ses.coverage"})

;; ─── 不変条件 ───────────────────────────────────────────────────────────

(deftest worker-has-no-hyperdrive-binding
  (testing "wrangler.jsonc に hyperdrive / d1 / sql 系 binding が無い（ADR-2605111200）"
    (let [raw (str/lower-case (slurp-file "wrangler.jsonc"))]
      (is (not (str/includes? raw "hyperdrive"))
          "HYPERDRIVE binding が wrangler に在る — CF Worker が DB に直接触れる")
      (is (not (str/includes? raw "d1_databases"))
          "D1 binding が wrangler に在る — domain write が edge に戻った")
      (is (not (str/includes? raw "\"services\""))
          "services binding ブロックが在る — 意図しない DB 経路の可能性"))))

(deftest non-federable-and-no-hyperdrive-are-declared-in-meta
  (testing "/_app/meta は federable: false と hyperdrive: false を返す"
    (is (re-find #"federable: false" @app-ts)
        "federable: false が無い — AT Repo へ漏れる前提で読まれる")
    (is (re-find #"hyperdrive: false" @app-ts)
        "hyperdrive: false が無い — DB binding があると誤解される"))
  (testing "CLAUDE.md も Non-federable と HYPERDRIVE 禁止を名乗っている"
    (is (str/includes? @claude-md "Non-federable"))
    (is (re-find #"No HYPERDRIVE" @claude-md))))

(deftest nsid-guard-only-admits-ses-lexicon
  (testing "NSID guard の prefix は kotodama nsidPrefixes と一致"
    (let [prefix (:nsid-prefix @worker)
          declared (first (get @kotodama :nsidPrefixes))]
      (is (= "com.etzhayyim.apps.ses." prefix)
          "guard prefix が com.etzhayyim.apps.ses. でない — 他 actor の XRPC が通る")
      (is (= declared (str/replace prefix #"\.$" ""))
          "kotodama.jsonld の nsidPrefixes と worker guard が食い違う")))
  (testing "未知 NSID は 404（黙って通さない）"
    (is (re-find #"error: \"NotFound\"" @app-ts)
        "NSID 拒否が 404 でない — 別のエラー形に変わると client が誤読する")))

(deftest bearer-auth-is-required-off-public-paths
  (testing "XRPC は Bearer 無しで 401"
    (is (:auth-401 @worker)
        "AuthRequired 401 が無い — 認証なしで ingest/update が通る"))
  (testing "公開 probe は auth ミドルウェアの除外に載っている"
    (doseq [p ["/health" "/_worker/health" "/_app/meta" "/"]]
      (is (str/includes? @app-ts p)
          (str "public path " p " が auth 除外リストから消えている")))))

(deftest jokyo-state-machine-values-are-fixed
  (testing "/_app/meta の jokyoValues は CLAUDE.md の 7 状態と一致"
    (is (= expected-jokyo (:jokyo-values @worker))
        "jokyoValues が CLAUDE.md の状態機械と食い違う — LangGraph 側と meta が別の語彙になる"))
  (testing "CLAUDE.md が 7 状態を列挙している"
    (doseq [s expected-jokyo]
      (is (str/includes? @claude-md s)
          (str "CLAUDE.md に jokyo 状態 " s " が無い")))))

(deftest documented-xrpc-surfaces-agree
  (testing "app.ts ヘッダコメントと /_app/meta surfaces が同じ 6 本"
    (is (= expected-surfaces (:surfaces @worker))
        "documented surfaces が 6 本の SES lexicon と一致しない"))
  (testing "CLAUDE.md の NSID 表が 6 lexicon を名乗っている"
    (doseq [ns ["ingestAnken" "updateJokyo" "getAnken" "listAnken" "listJokyo" "coverage"]]
      (is (str/includes? @claude-md (str "com.etzhayyim.apps.ses." ns))
          (str "CLAUDE.md に lexicon " ns " が無い")))))

(deftest actor-identity-agrees-across-surfaces
  (testing "DID: kotodama == worker root == meta fallback"
    (let [did (:did @kotodama)]
      (is (= did (:root-did @worker)))
      (is (= did (:meta-default-did @worker))
          "identity 文書と worker が別の DID を名乗ると did:web 解決が嘘になる")))
  (testing "nanoid: kotodama == wrangler APP_NANOID"
    (let [n (:nanoid @kotodama)]
      (is (= n (get-in @wrangler [:vars :APP_NANOID])))
      (is (= (str "kotodama-" n) (:name @wrangler)))))
  (testing "ses.etzhayyim.com route が wrangler に在る"
    (let [patterns (->> (get @wrangler :routes)
                        (map :pattern)
                        set)]
      (is (contains? patterns "ses.etzhayyim.com/*")
          "vanity host route が無い — identity の DID host と配備がずれる"))))

(deftest dispatcher-forwards-with-internal-trust
  (testing "dispatcher は bpmn-dispatcher へ x-internal-trust を付ける"
    (is (str/includes? @dispatcher-ts "x-internal-trust")
        "internal trust header が無い — 転送が認可されない")
    (is (str/includes? @dispatcher-ts "x-etzhayyim-actor-did")
        "actor DID bridge header が無い"))
  (testing "未知 path は 404（notFound handler）"
    (is (:not-found-404 @worker))))

(deftest version-and-display-name-agree
  (let [v (:version @pkg)]
    (is (seq v) "package.json に version が無い")
    (testing "displayName: wrangler == kotodama profile"
      (is (= (get-in @kotodama [:profile :displayName])
             (get-in @wrangler [:vars :APP_DISPLAY_NAME]))))))
