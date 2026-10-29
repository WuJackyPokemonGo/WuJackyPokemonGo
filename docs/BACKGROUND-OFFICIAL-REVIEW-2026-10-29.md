# 官方公告增量核對 — 2026-10-29

以 main 的 273372c9f0f536ce23836de7202c85f5ddff9b70 為合併基準（已保留本日並行完成的暗黑蒼穹／紫黑修正）。實際資料為 data/backgrounds.json + data/background-reference-facts.json，以及唯讀 background_catalog_overrides RPC；本次查得覆寫0筆。沒有資料庫寫入或商品／庫存／售價變更。

## 已確認差異

- 新增 Dynamax Trails 2026 預告：11/16 10:00–11/23 20:00當地時間。官方明列非傳說、非幻之既有極巨化寶可夢對戰捕獲機率特殊背景，免費／豪華GO Pass有附背景活動極巨化遭遇。符合深入荒野第一階段條件者11/14 10:00提前取得通行證；不把提前取得通行證視為背景已發放。圖樣及逐隻名單未公布，無極汰那與不可捕獲的無極巨化無極汰那不列為已確認背景遭遇。
- BG-0240：沿用2026年度社群日背景，新增駒刀小兵的2026/11/21未來日期及中英條件。14:00–17:00野外機率背景、付費特殊調查三次背景遭遇；普通誘餌14:00–21:00、指定田野調查與社群大使報到限時調查依公告。另列即將推出預告以免誤認今天可得，沒有新增獨立背景圖樣或推測進化款。
- BG-0212 / BG-0213：補上持票現場限定、遠距不給地點背景，以及各物種團戰／極巨對戰／超極巨鋁鋼龍特殊調查背景條件。集章僅主票券日期10:00–20:00；額外日不新增集章，但可重取鋼／龍限時調查。集章未明列背景保證，不當成背景取得途徑。官方對戰形態名稱與既有捕獲形態分開說明，未增算遭遇形態。
- 深入荒野既有預告補齊官方明列五星團體戰及五星極巨對戰對象，不把GO Pass極巨美錄坦推作背景保證。

## 公開呈現及保留

原有4筆 additional_announced_events 已存在但未顯示在網站；本次沿用此欄，加入2筆後共6筆，提供獨立的「已公告活動・背景圖樣待確認」區塊。預告依既有搜尋、類型、系列、地區、年份及排序處理，沒有套用假圖、不顯示商品庫存；已推出篩選先給查看預告入口，全部／即將推出篩選顯示獨立預告。

正式圖樣紀錄仍278：271已推出、4即將推出、3待核對；預告不加入上述計數。僅遠古復甦六款合併，其他活動仍獨立。暗黑蒼穹／紫黑的52歷史遭遇、36進化與54未確認未來候選完整保留，本次沒有把候選轉為已確認或將2026背景推定為同一張圖。

## 待確認與本次範圍

Dynamax Trails背景圖樣／逐隻名單、深入荒野／全球曠野／印度光之祭典／墨西哥城亡靈節地點背景的圖樣及未明列細節仍待確認。既有BG-0072、BG-0276、BG-0277未更動；既有日期／取得條件未解決項也未結案，complete仍false。此輪核對官方最新新聞索引及相關近期／未來活動頁，不宣稱全量重驗278筆歷史公告。

另核對Night Out、墨西哥亡靈節、印度光之祭典、全球曠野；未發現需覆蓋既有修正的差異。萬聖節I／II、水晶燈火靈超級團體戰日、November GO Pass及歐洲曠野聚會公告未明列額外背景，不新增背景款。

## 官方來源

- https://pokemongo.com/news
- https://pokemongo.com/news/dynamax-trails-eternamax-eternatus-2026
- https://pokemongo.com/news/communityday-november-2026-pawniard
- https://pokemongo.com/news/go-wild-area-stamp-rally-details-2026
- https://pokemongo.com/gowildarea/sendai/gameplay
- https://pokemongo.com/en/gowildarea/mexico-city/gameplay
- https://pokemongo.com/news/into-the-wild-2026
- https://pokemongo.com/es-MX/news/dia-de-muertos-2026
- https://pokemongo.com/en/news/festival-of-lights-2026
- https://pokemongo.com/en/gowildarea/global
- https://pokemongo.com/news/pokemon-night-out-irl-details2026
- https://pokemongo.com/news/halloween-part-1-2026
- https://pokemongo.com/news/halloween-part-2-2026
- https://pokemongo.com/news/chandelure-super-mega-raid-day-2026
- https://pokemongo.com/news/go-pass-november-2026

## 驗證

222項測試通過、build通過；新增預告篩選／無庫存／不當成已發放、年度背景未來日期、曠野現場及集章邊界回歸測試。只有BG-0212、BG-0213、BG-0240三筆正式紀錄異動。發布依既有main→Store checks→GitHub Pages流程；部署成功須以該提交的Actions與正式站檢查為準。
