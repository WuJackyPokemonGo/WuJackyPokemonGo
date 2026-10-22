# Wu Jacky Pokémon GO 正式賣場

正式網址：https://wujackypokemongo.github.io/WuJackyPokemonGo/
管理入口：https://wujackypokemongo.github.io/WuJackyPokemonGo/admin.html

2026-10-22 使用者明確授權直接修改及發佈正式站。本次以前的 main 已備份為 backup/pre-live-20261022（1e708193a53e151ad10c91395ae44eff3a036d6f）。不再將舊 README 的「不可改正式站」視為目前限制。

## 執行與建置

npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build

GitHub Pages 從 main 根目錄提供靜態檔案，assets/*.bundle.js 必須與原始碼一起保存。admin.html 為 cloud-admin.html 的正式入口副本，更新 UI 時保持一致。瀏覽器設定只有公開 publishable key，不能放 service-role key 或密碼。

## 正式資料

沿用已驗證的 Supabase 專案 wlrwlqchlxehlvkyesnj。專案顯示名稱目前仍為 wu-jacky-pokemon-staging，但從本次發佈起作為此正式站的資料來源；請勿再新增未標記測試資料或假設此環境可清空。舊 INACTIVE 專案沒有啟用或修改。

products.is_live 預設 false。公開目錄必須同時 is_live=true 和 publication_status=published，避免先前測試商品自動公開。管理員從正式後台編輯商品，勾選「正式賣場顯示」並設定上架即可公開。

公開 API 只有 storefront_catalog，回傳白名單商品欄位，不回傳精確庫存、成本、來源、客戶、訂單、管理員或稽核資料。匿名仍不能查基礎表或呼叫管理 RPC。

原始商品圖片保留於 private product-images。只有管理員明確選用並公開的 WebP 縮圖會複製到 public storefront-thumbnails；原圖不會上傳到 public bucket。已公開圖片的網址可能被分享或快取，取消顯示商品不會保證已公開縮圖立即失效。

supabase/production/public-storefront.sql 已透過 execute_sql 套用，沒有新增 migration history，不可重跑 schema 建置。SQL 驗收檔使用 BEGIN/ROLLBACK，不留下測試商品。

## 功能與限制

已連接雲端商品／圖片／分類、詢價清單、官方 LINE；管理員登入、庫存異動、採購到貨、訂單處理、實際收退款記錄、完成扣庫存及實物退回。

網站只記錄你已完成的外部交易，不會付款或轉帳。商品目前沒有已確認的真實公開庫存，因此顧客頁顯示「商品陸續整理中」，不以示範商品充數。

2026-10-22 本輪已完成商品 CSV 批次匯入／匯出與加密應用程式備份／遺失資料補回：

- CSV：UTF-8、版本 1、每批 1,000 筆／2 MB；逐筆預覽新增、更新、略過與錯誤。依 SKU 配對，省略欄位保留原值，明確空白清除選填值；別名／分類使用 JSON 陣列。CSV 不改庫存與 is_live，新商品不公開。已公開商品必須另行確認，版本衝突拒絕整批。
- 資料寫入：單一資料庫交易；匯入／補回前自動保存雲端資料快照，保留操作 ID 與稽核。斷線可重試同一個 request ID；還原檔不會明文存進 sessionStorage，已提交但回應遺失時可從伺服器收據確認結果。
- 加密備份：WebCrypto AES-256-GCM、PBKDF2-SHA256 310,000 次，隨機 salt／IV。密碼由管理員自行輸入，至少 12 字元，不送往伺服器。匯出 14 張應用程式資料表與兩個圖片 bucket 的所有物件（含未建立索引的上傳），圖片附 SHA-256。前後核對資料與物件清單，變更中止備份。
- 限制：每份資料最多 16 MB／50,000 筆、圖片合計 64 MB／10,000 個。超過上限停止，不會默默漏掉資料。這不是 Supabase 原生災難復原：不含 Auth 帳號、admin_profiles、schema、程式碼、伺服器設定或遞迴的雲端自動快照副本；需保留目前專案與管理員登入。
- 補回：同專案、同版本與欄位驗證，只 INSERT 遺失資料；既有內容不同時拒絕，不刪除／覆寫後續交易。圖片逐檔不可覆寫、可接續；資料補回為單一交易，完成後核對庫存 ledger 與退款。雲端自動快照不含圖片 binary，不能代替加密含圖備份。
- 操作：登入正式後台，在「匯入與備份」選擇功能。先預覽再確認；加密檔產生後須按「儲存加密備份檔」並在手機「檔案」確認已下載。密碼遺失無法解鎖。

驗證紀錄與可重跑的回滾資料庫驗收見 docs/DEV-PROGRESS-2026-10-22-DATA-TOOLS.md、tests/data-io-acceptance.sql。79 項 Node 測試通過；真實登入後的 iOS 檔案 App 儲存／上傳仍需使用者在自己的手機驗收。部分收款／多次退款、分析排程屬其他未實作範圍，不宣稱已完成。

## 回復

需要回復外觀時，從 backup/pre-live-20261022 取回原 index.html 作為新提交，勿 force-push main。資料庫本次為新增欄位及唯讀 API，沒有刪除現有商品、訂單或庫存。
