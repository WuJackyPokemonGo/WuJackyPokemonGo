# Wu Jacky LINE 試用版

先用測試環境部署 `line-ai-replies`。只處理 `LINE_PILOT_USER_IDS` 指定的 LINE 使用者，使用逗號分隔。其他使用者、群組及非文字事件不回覆。人工提示留在原聊天室供管理員接手，沒有逐聊天室暫停 AI 的功能。

在後端密鑰設定填 `LINE_CHANNEL_SECRET`（重發後的新值）、`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_PILOT_USER_IDS`、`OPENAI_API_KEY` 和 `LINE_OPENAI_MODEL`（選支援 Structured Outputs 的模型）。商品資料沿用網站公開目錄。測試訊息請使用虛構內容。

部署後在測試頻道填入函式 HTTPS 網址，按 Verify，再開啟 Use webhook。測試查價、庫存不明、同名商品、議價轉人工、非指定帳號和既有自動回覆是否重複。要停止試用，在測試頻道關閉 Use webhook。
