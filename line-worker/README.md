# LINE 客服 Worker（規則處理簡單詢價，其餘交給 Grok）

Cloudflare Worker「wu-jacky-line」的新版程式。**尚未部署**；正式設定由 Jacky／Grok 在試跑後切換。

## 做什麼
| 客人訊息 | 處理 |
|---|---|
| 唯一命中、有貨（可供貨／庫存偏低）、有公開價格 | Worker 用 replyToken 回品名、價格、商品連結，最後一行「（此為自動回覆）」；英文客人用 `?lang=en` |
| 唯一命中、私訊詢價或需詢問供貨 | 只回品名和連結 |
| 候選只差公母 | 固定問句「請問你要公的還是母的？」，客人回答後再回價格 |
| 多件候選、已售完、即將推出、客人指定的款式目錄沒有 | 不自動回，交給 Grok 擬稿 |
| 議價、付款、售後（文字） | 立即交給 Grok 並標「待人工」，不受冷卻限制；就算同時問有貨也不自動回 |
| 圖片 | 標「待人工」，跟著下一次交給 Grok（受冷卻限制） |
| 貼圖、謝謝／OK、短的接話（「對」「14」） | 只記錄，不回、不叫 AI；之後若要交給 Grok，會當前文一起送 |
| 其他 | 最後一則後等 60 秒合併；同一位客人 10 分鐘最多交給 Grok 一次，期間的訊息照收、冷卻後一起送 |

- 連續幾句會合併理解：「紫黑拉魯拉絲」→「母的」→「多少」，在第三句回答。
- LINE 重送同一事件：以 `webhookEventId` 去重。
- 暗號只認 `OWNER_USER_ID`：「#我來」「#接手」暫停 30 分鐘（不回、不叫 AI）、「#交給你」恢復，成功回「收」。暫停開關放在 Durable Object，送出回覆前再確認一次。
- 轉給 Grok 前遮蔽帳密、轉帳末碼、銀行帳號、驗證碼、付款連結。
- 商品比對：寶可夢中英文名、商品別名、`data/crm-nicknames.txt` 暱稱，再用地點、活動、公母、尺寸、球種等限定詞縮小；只剩一件才算命中。

## 程式
- `src/match.mjs` 商品比對 · `src/intent.mjs` 意圖規則 · `src/templates.mjs` 回覆範本 · `src/mask.mjs` 遮蔽
- `src/session.mjs` 每位客人的狀態與決策（純函式）· `src/worker.mjs` Webhook、Durable Object、LINE Reply API、轉發 Grok
- 測試：`tests/line-worker.test.mjs`

## 部署步驟（試跑一週再切換）
1. **先重新產生曾外露的 Channel Secret**，同一時段更新 Worker 並在 LINE Developers 按 Verify。
2. `cp wrangler.example.toml wrangler.toml`，用 `wrangler secret put` 設定：`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`OWNER_USER_ID`、`GROK_FORWARD_URL`（目前 Worker 轉發到 Grok routine 的網址）、`GROK_FORWARD_TOKEN`（選填）、`REPORT_KEY`。
3. `MODE="shadow"` 部署：Worker **不回覆客人**，只記錄本來會回什麼，所有訊息照常交給 Grok（轉發內容多 `worker_would_reply` 欄位方便比對）。用 `GET /report?key=REPORT_KEY` 看紀錄。
4. 試跑一週，記下規則命中數、回錯商品或庫存的筆數、Grok 呼叫次數；確認無誤後改 `MODE="live"`，同時讓 Grok routine 不再自動回 Worker 已處理的詢價，避免 Composio 回第二次。

> 轉給 Grok 的 JSON 欄位（`messages`、`intent`、`needs_human`、`candidates`、`context`…）是新格式；部署前請對照目前 Grok routine 讀取的欄位調整 `forwardToGrok`。

## 用真實資料估算（Threads 私訊 9,375 則客人訊息，本機試算，資料未提交）
| 做法 | Grok 呼叫 | 備註 |
|---|---|---|
| 現行：同一位客人 10 分鐘只轉第一則 | 4,427 次（47.2%） | 後續訊息直接丟掉 |
| 新版規則 | 3,938 次（42.0%），其中待人工 560 | 後續訊息合併送出，不漏 |

- 自動回覆只命中 19 則：私訊多在問當時的商品（目前目錄沒有），或同一隻寶可夢有多款。LINE 客人問的是現在的商品，命中率應較高，以試跑一週的實際數字為準。
- 大部分 Grok 呼叫來自客人在對話中的敘述句；Worker 看不到 Jacky 在官方帳號後台手動回的內容（Messaging API 不提供），所以 Jacky 親自聊時請用「#我來」，這段時間就完全不叫 AI。

## 限制
- 簡體中文客人：比對依賴商品別名裡的簡體字，沒有簡體網站。
- 付款、售後固定範本尚未定稿；定稿後可加入「範本草稿供 Jacky 審核」。
