# 第 05 項：原始公告與 PokéXperience 即時名錄覆核（2026-11-10）

本輪從 GitHub 與正式站一致的圖鑑 blob `922ecb3ca41832650b3b837d7a6337656a55736d` 繼續。完整名錄對照與前輪判定見 [282 筆逐筆對照](BACKGROUND-AUDIT-CROSSWALK-2026-11-10.md)。

## 本輪圖鑑修正

| 條目 | 判定 | 證據 |
| --- | --- | --- |
| BG-0002 濟州島 | 2023/7/28–30，持票者在有效時段親自參加超級團體戰，捕捉拉帝亞斯或拉帝歐斯後有機會附濟州島地點背景。補明團戰類型。舊官方售票連結現在只顯示通用活動頁，途徑證據採當時活動報導，並與名錄物種交叉核對。 | [同期活動報導](https://pokemongohub.net/post/event/pokemon-air-adventures-jeju-island-south-korea/) · [Serebii](https://www.serebii.net/pokemongo/reallifeevents/pokemonairadventures-jejuisland.shtml) |
| BG-0022 福岡 | 早期英文公告與轉載寫了原始團體戰。Niantic 日本客服於 2024/11/8 更正福岡無原始團體戰。蓋歐卡、固拉多維持只列於這兩場活動中的全球場 BG-0223。此判定取代前輪紀錄的實證待查。 | [Niantic 更正](https://x.com/niantichelpjp/status/1854814307495694769) · [保留官方更正全文的同期報導](https://getnews.jp/archives/3572437) · [全球場官方公告](https://pokemongo.com/news/get-ready-for-go-wild-area-2024) |
| BG-0137 江東、0138 港、0139 品川 | 官方營運商確認 2026/5/25 起、各區分開且無需 GO Fest 票券。遊戲集章進度紀錄顯示江東、品川於第 2、4 枚觸發背景遭遇，港區於第 2、4、5 枚觸發。維持原寶可夢名單。 | [營運商新聞稿](https://prtimes.jp/main/html/rd/p/000000003.000177618.html) · [遊戲畫面及各區獎勵](https://pokemongo-raku.com/post156582) · [GameWith](https://pokemongo.gamewith.jp/article/show/492937) |
| BG-0196–0200 | 布里斯本、慕尼黑、馬賽、里斯本、里約 2026/9/26–27。官方共同公告說明 GO 集章取代舊限時調查，每活動日最多八枚，逐枚給探險帽伊布遭遇。開場特殊調查另外給探險帽伊布，該途徑的背景資格未明列。 | [Scopely 共同公告](https://www.scopely.com/en/news/pokemon-go-announces-city-safari-events-coming-september-2026) · [里斯本官方活動頁](https://pokemongo.com/en/featured-in-person-events/citysafari/lisbon) |

圖鑑提交為 `9a6dd23381a5c2b945848a6aadc607ea26f50312` 與 `abfc6adcf7c8df2aacf7ab5a2a847fc22e1ec6b5`。兩筆合計影響 10 個條目。圖樣與寶可夢名單維持原值。

## 另完成原始公告對照

- BG-0122、0123：台南和洛杉磯現場票期都是 2026/2/20–22。官方明列有效票券時段的現場團體戰（含超級團體戰）成功捕捉後有背景機會。外部名錄的好啦魷與官方超級烏賊王的捕捉結果分開看，好啦魷仍缺可辨認的背景取得實證。 [台南](https://pokemongo.com/gotour/tainan) · [洛杉磯](https://pokemongo.com/gotour/losangeles) · [洛杉磯玩法](https://pokemongo.com/gotour/losangeles/gameplay)
- BG-0244–0249：官方逐日列城都 2/24、豐緣 2/25、神奧 2/26，金／銀、紅／藍寶石、鑽石／珍珠各自對應兩種版本，站內起日和寶可夢列表一致。外部名錄以 2/23–27 的活動總區間顯示。 [官方卡洛斯之路](https://pokemongo.com/news/road-to-kalos-event)

## PokéXperience 即時資料

從 [公開名錄](https://pokexperience.com/backgrounds/) 讀取其前端所用的 `backgrounds.json` 與 `bg-dates.json`，兩者均成功。以檔名比對站內上一版 346 筆保存參考，345 筆沿用，10 筆新增，1 筆離開名錄，現有 355 筆。日期欄的精確標記屬該來源自述，不能單獨確認活動首發。新增素材的對應如下。

| 新素材 | 站內對應 | 判定 |
| --- | --- | --- |
| `2026_gowa_mexicocity.webp` | BG-0213 | 已有墨西哥城曠野地點背景。 |
| `2026_gowa_sendai.webp` | BG-0212 | 已有仙台曠野地點背景。 |
| `2026diadelosmuertos.webp` | BG-0278 | 與下一筆有同一組剪紙圖案及卡拉卡拉進化系標籤，屬已收錄的特殊背景。 |
| `dia_de_muertos_2026.webp` | BG-0278 | 同款剪紙圖樣的另一版本。 |
| `fc2026_seoul.webp` | BG-0269 | 已有首爾世界盃競技場活動與小火龍進化系。 |
| `gwa26-global.webp` | BG-0284 | 已有 2026 全球曠野特殊背景。外部日期早一天，官方活動時程優先。 |
| `lc_pokelid_gunma.webp` | BG-0285 | 已有待確認的群馬圖樣。來源日期 10/23 早於沼田實體設置，不能據此更改遊戲推出日。 |
| `nationaltrustclumberpark2.png` | BG-0168 | 已與現有草原教堂素材並排目視核對，新增檔是站內已有紀錄的舊林蔭步道版。 |
| `night_out2026_la.webp` | BG-0211 | 已有洛杉磯 Night Out。 |
| `night_out2026_london.webp` | BG-0214 | 已有倫敦 Night Out 預告；素材對應與遊戲發放查核分開。 |

離開名錄的 `sb-dia-de-muertos-2026.jpg` 原對應 BG-0278，現有兩筆替代參考。沿用檔案中，洛杉磯 Night Out 改為 2026/10/24、波士頓城市狩獵改為 2026/10/24，均已是站內日期。其他日曆日期沿用。未將 10 筆素材直接新增成 10 款發放紀錄。

## 待查證據

仍有部分歷年條目未逐一取得日期、裝扮／形態、取得條件的完整證據。已定位的例子包括 BG-0016 檀香山地點背景實際截止是賽事 8/18 或遊戲慶祝 8/20、BG-0017 日惹票券與遠距資格、BG-0122／0123 好啦魷，以及 BG-0079／0081 雪梨／布宜諾斯艾利斯同期指南同時列舊限時調查與替代集章。這些仍保留在逐筆對照表及本紀錄，無足夠證據時不更動條目。第 05 項仍未結案。
