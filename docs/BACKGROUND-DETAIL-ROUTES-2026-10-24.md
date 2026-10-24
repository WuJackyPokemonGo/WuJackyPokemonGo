# 背景詳情：圖鑑排序與取得途徑分類

2026-10-24（台灣時間）。需求來自使用者轉述朋友建議，已授權接續修改正式網站。本次是單張背景內的排序／分類，不合併其他活動卡片。

| 活動 | 完成行為 |
|---|---|
| 舊金山 BG-0190 | 原始遭遇與進化各依圖鑑編號排序；這輪不改名單或 38／40／42 待核數量。 |
| 長崎 BG-0070 | 團體戰、極巨戰（超極巨長毛巨魔）、GO 集章、調查獎勵；每組依圖鑑編號。 |
| 2026 台南 BG-0122、洛杉磯 BG-0123 | 日間一般團體戰（含超級團體戰）、超級之夜（Mega Night）；每組依圖鑑編號。 |
| 福岡 BG-0022 | 傳說團體戰另外列；顫弦蠑螈分一般、極巨化、超極巨化，高調／低調形態有明示。 |

## 查證及資料補正

- 超級之夜的官方正式名稱為「超級之夜／Mega Night」。原預告六種之外，快龍在活動期間追加；名單須包含快龍，不將其錯放日間區。
- 台南、洛杉磯：日間 9 筆、夜間 7 筆、好啦魷 1 筆留在「其他／取得方式待核對」；各有 2 筆進化另列。沿用原始名單 17 筆，沒有刪除。
- 長崎：三首惡龍、西獅海壬為惡／妖精限時調查最終遭遇，亦能進化取得，因此保留原進化紀錄並補上直接遭遇。九尾更正為阿羅拉形態。原始遭遇 18 → 20 筆，進化仍 6 筆；不是新增背景圖案。
- 長崎：團體戰 3、極巨戰 1、集章 5、調查 15 筆展示；同一款有多種取得方式會跨區顯示，仍只有 20 筆原始遭遇，不將各區加總作款數。電龍集章從 2025-11-10 開始，與 11/7–9 活動集章區分。
- 福岡：保留既有 5 筆，補上高調、低調兩種極巨化顫弦蠑螈，共 7 筆原始遭遇；分類為傳說 2、一般 2、極巨化 2、既有超極巨化紀錄 1。沒有更動或增加福岡背景圖案。
- 原始背景仍 276 筆，已推出 269；原遠古復甦分組維持，沒有合併其他活動。Supabase 公開覆寫查詢為 0，無資料庫寫入。
- 證據不足的新／雲端編輯款不丟棄，留在「其他／取得方式待核對」。

## 驗證

- 198/198 自動測試通過；build 通過；admin、storefront bundle 無變更。
- 選定活動的每組數字遞增排序、原始陣列不變、多途徑不漏資料、六預告加快龍、好啦魷待核、福岡三種能力與雙形態、中英文與 #0849 搜尋皆有測試。
- 逐筆 JSON 差異確認：只修改福岡、長崎、台南、洛杉磯四筆活動內容，其他 272 筆（包括舊金山名單）未改。
- 正式部署 8eded59450112560a0cc169910593ea188fda222：Store checks 與 Pages 均成功；HTML、CSS、bundle、圖鑑 JSON 與本機逐位元相同。
- 正式手機驗收：五個背景 × 320／390／430 px 共 15 組，無橫向溢出，各區與進化排序遞增；英文分類可切換。詳見 `background-detail-routes-live-2026-10-24.json`。
- 正式搜尋「極巨化顫弦蠑螈」「Dynamax Toxtricity」「#0849」皆找到福岡；頁首 276／269／4／3 不變。
- 手機正式畫面：`background-detail-routes-phone-2026-10-24.jpg`。

## 來源

- [台南官方日間](https://pokemongo.com/gotour/tainan/gameplay)、[台南官方超級之夜](https://pokemongo.com/zh_Hant/gotour/tainan/mega-night)
- [洛杉磯官方日間](https://pokemongo.com/gotour/losangeles/gameplay)、[洛杉磯官方超級之夜](https://pokemongo.com/gotour/losangeles/mega-night)
- [Scopely 活動事後回顧：超級快龍初登場](https://www.scopely.com/en/news/pokemon-go-tour-2026-delivers-a-global-celebration-in-los-angeles-and-tainan)、[Serebii Mega Night 實際名單](https://www.serebii.net/pokemongo/reallifeevents/gotourkalos-meganight.shtml)、[Leek Duck 夜間名單含快龍](https://leekduck.com/events/mega-night-pokemon-go-tour-kalos-los-angeles-2026/)
- [長崎官方活動](https://pokemongo.com/gowildarea/nagasaki/gameplay)、[官方 11/10 電龍集章](https://pokemongo.com/news/stamp-rally-nagasaki)、[Leek Duck 長崎逐步調查及集章獎勵](https://leekduck.com/events/pokemon-go-wild-area-2025-nagasaki-japan/)
- [福岡官方：一般／極巨化／超極巨化及背景規則](https://gotour.pokemongolive.com/gowildarea/gameplay/)
