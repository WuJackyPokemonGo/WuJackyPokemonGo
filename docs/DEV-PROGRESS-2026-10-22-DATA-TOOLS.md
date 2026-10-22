# 2026-10-22 商品匯入與加密備份接續點

## 正式專案

- GitHub：WuJackyPokemonGo/WuJackyPokemonGo，main；GitHub Pages 使用根目錄。
- 正式站：https://wujackypokemongo.github.io/WuJackyPokemonGo/
- 正式後台：https://wujackypokemongo.github.io/WuJackyPokemonGo/admin.html
- Supabase：wlrwlqchlxehlvkyesnj 已作正式資料來源，名稱中的 staging 不代表可清空。舊 INACTIVE 專案勿動。Sites 私人測試後台是另一個發佈，不是正式顧客站。
- 本輪是在已授權正式發佈的前提下進行。既有 main 備份分支 backup/pre-live-20261022 保留。

## 已完成

1. 取回正式原始碼，從資料庫取回上一輪已建立的匯入／快照／補回 RPC 定義並存為 supabase/production/data-io.sql。
2. csv-import.mjs：CSV 範本、管理資料 CSV 匯出、嚴格格式與版本驗證、逐欄預覽、SKU 比對、省略欄位保留、明確空白清除、重複／未知欄位拒絕、試算表公式前綴處理與往返。
3. data-io-service.mjs：既有管理 RPC 接線、跨重新登入重試、伺服器回執確認、加密含圖應用程式備份、媒體 hash、前後快照比對、缺失資料／圖片補回與衝突阻擋。
4. data-tools-ui.mjs、admin.html、cloud-admin.html：手機友善的匯入、逐列變更預覽、已公開商品二次勾選、備份密碼確認、明確儲存連結、加密備份解鎖、雲端快照選擇、14 表差異預覽、確認補回與斷線重試入口。
5. cloud-admin.mjs：登入與登出資料隔離、新功能接線；修正賣場預覽的詢價文字換行。
6. private.admin_io 新增唯讀 request_status，需既有管理員驗證，只回傳本人 request ID 的結果。沒有增加匿名或一般使用者權限。

## 驗證證據與限制

- npm test：79 項通過；涵蓋 CSV 解析／往返、錯誤資料、AES-GCM 實際加密往返、錯誤密碼與竄改、隨機 salt／IV、圖片 hash／完整性、漏圖拒絕、資料變更期間匯出拒絕、圖片衝突前不寫入、斷線重試與回執、瀏覽器 storage 失敗前阻擋寫入。
- tests/data-io-acceptance.sql：真實資料庫 BEGIN／ROLLBACK 驗收通過。測試只刪除該交易自行建立的唯一 SKU fixture，模擬遺失後補回。驗證匯入幂等、草稿不公開、舊版本拒絕、已公開更動確認、整批失敗回滾、無衝突快照、差異阻擋、缺失商品／ledger／餘額補回、庫存對帳與補回幂等。所有 fixture 記錄回滾；序列號可能有正常間隔。
- authenticated 角色實測可呼叫備份與差異預覽；anon 沒有執行權，非管理員 auth.uid 被拒絕。
- 390px 寬 iframe 的 Chrome 本機驗收：預覽 → 勾選 → 匯入完成；備份表單 → 儲存入口；雲端快照 → 差異表 → 補回完成，均已操作。
- 本機 terminal.local 使用 HTTP，沒有 WebCrypto 安全上下文。UI 驗收使用完全本機的 SDK 與 crypto 測試替身；真實密碼學由 Node WebCrypto 測試、真實權限與交易由資料庫回滾驗收分別確認。所有 .qa* 檔案都排除發佈，正式 npm run build 只使用真實 SDK 與瀏覽器 WebCrypto。
- 未使用使用者密碼登入真實後台，未重設密碼。真實 iOS 檔案 App 下載／選檔、使用者登入後操作與真實商品資料確認仍需使用者完成；不宣稱已在真實手機完整驗收。

## 不可誤報

- 還原是安全補回缺失資料，不是時間倒轉或覆寫後續訂單；不同的既有資料會拒絕。
- 雲端自動快照沒有圖片 binary；完整含圖備份須由管理員設定密碼並儲存 .wjb。
- 真實商品的品項、售價、圖片與公開狀態尚待使用者確認；不得用 QA 商品填入正式賣場。
- 部分收款／多次退款、分析排程不是本輪新增項目，不宣稱全部網站願景已完成。

## 下次接續

先查 GitHub main 與本檔，不要只讀舊測試原型檔判定進度。原始碼、bundle 與本紀錄一起提交；本輪後不應再把 CSV／加密備份介面列為未接線。
