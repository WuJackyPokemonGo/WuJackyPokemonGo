# 永久商品 SKU：WJ-0001 流水號（2026-11-16）

## 決議與範圍
- 一件「可販售的商品」一個獨立永久 SKU；單隻與套組皆獨立配號。套組組成與 PTC 庫存關聯屬後續工作，不在本次擅自新增。
- 既有商品依 `created_at, id` 固定順序補號；包括草稿、已售罄、封存。**不以清單顯示順序或圖鑑編號重排**。
- 新增商品由資料庫自動領下一個號碼，格式 `WJ-0001` 起（超過 9999 時自然延長，不截斷）。
- SKU 在後台商品列表、搜尋、唯讀編輯欄與 CSV 匯出可見。前台商品卡、詳情、詢價與分享網址都不顯示。訂單明細預計於未來自助下單階段加入 SKU；本次未啟用自助下單。
- UUID 繼續作為商品/庫存/訂單/分享連結關聯鍵；此次僅補 SKU，不重新建立商品。
- 300 個 Excel 預排號碼**不是**已預先占用的商品編號，不可據此認定網站已有 300 件商品。

## 上正式環境前必須檢查
**專案命名與實際接線不同：**2026-11-16 已核對 main 的 `staging-config.mjs`、`cloud-admin.mjs`、`storefront-service.mjs`：正式 GitHub Pages 賣場與後台目前都連到 `wlrwlqchlxehlvkyesnj`（雖名稱為 `wu-jacky-pokemon-staging`）。該**正式網站實際連線的資料庫**唯讀盤點有 127 件商品，127 件 SKU 皆空白。另一個名為 `WuJackyPokemonGo` 的 `uhwhhdtwtzmuodvltijw` 專案目前 INACTIVE，並非 main 程式所用的資料來源。**正式資料庫已盤點，但尚未執行補號或部署**。套用前仍須備份和明確核准，避免寫錯專案。

正式執行前唯讀盤點 SQL：
```sql
select count(*) as total,
       count(*) filter (where sku is null) as missing,
       count(*) filter (where sku is not null) as filled,
       count(*) filter (where sku is not null and
         case when sku ~ '^WJ-[0-9]{4,15}$'
              then substring(sku from 4)::bigint < 1
              else true end) as legacy_or_invalid
from public.products;
select sku,id,name_zh from public.products where sku is not null order by sku;
```
若發現非 `WJ-####` 舊 SKU，migration **直接中止**，不能不經審核覆蓋。先保留原 UUID 與舊編號清單，決定映射策略再調整。

## 變更路徑
1. DB: `supabase/production/sku-auto-number.sql`：單一交易鎖定產品表，核對舊編號，建立不可回退 sequence，依固定順序補空號；新增觸發器禁止人工新填與覆寫，並避免舊編輯器空白值清除 SKU。
2. DB 驗收: `supabase/production/sku-auto-number-acceptance.sql`：在 `BEGIN/ROLLBACK` 測試唯一、補號、自動新增、禁止更改。
3. 後台表單：新增顯示「系統自動產生」，既有 SKU 唯讀。
4. CSV：新增行留空 SKU；既有商品以 UUID 或既有 SKU 更新；企圖更改原 SKU 會在預覽階段拒絕；即使舊 CSV 把該欄留空，也保留原編號。
5. `admin.html` 與 `cloud-admin.html` 必須完全相同；更新產生的 `assets/cloud-admin.bundle.js`，CI 執行 `npm test`、`npm run build`、bundle diff。

## 注意事項
- 序列分配不保證無跳號：失敗交易/併發寫入可留下號碼空缺，但**不會再分配同一號**。
- 刪除商品不回收號碼；日後不允許直接調降序列。
- 舊版備份還原會設定 `wj.restoring` 旗標而略過一般 SKU 強制規則，目的是保留歷史還原相容性。**正式啟用前必須追加「還原舊備份／新增 SKU」完整驗收**；不能僅以本次基礎測試認定所有還原情境均安全。若舊備份有空 SKU，還原後須再核對與補號。
- 此分支沒有設定任何帳密、沒有修改價格、庫存、商品 UUID 或正式資料。
- 本次 SQL 在**正式站目前實際使用的資料庫**（專案名稱雖為 staging）以單次 `BEGIN ... ROLLBACK` 模擬套用與驗收成功，驗收後 127 筆商品仍全部無 SKU，觸發器不存在；**沒有正式套用**。GitHub Actions #43789148172：338/338 測試及 build、管理頁一致性、bundle diff 全部通過。
