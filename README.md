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

完整備份／還原、雲端 CSV、部分收款／多次退款及分析排程仍待後續完成。本次僅進行應用程式與權限驗收，不宣稱上述功能已完成。

## 回復

需要回復外觀時，從 backup/pre-live-20261022 取回原 index.html 作為新提交，勿 force-push main。資料庫本次為新增欄位及唯讀 API，沒有刪除現有商品、訂單或庫存。
