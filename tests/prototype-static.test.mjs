import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [front, admin, schema, security, inventory, analytics] = await Promise.all([
  read("../index.html"),
  read("../admin.html"),
  read("../supabase/migrations/202610170001_initial_schema_draft.sql"),
  read("../supabase/migrations/202610180001_security_policy_draft.sql"),
  read("../supabase/migrations/202610180002_inventory_adjustment_function_draft.sql"),
  read("../supabase/migrations/202610180003_analytics_events_draft.sql"),
]);

test("HTML prototypes declare document language and mobile viewport", () => {
  for (const [name, source] of [["storefront", front], ["admin", admin]]) {
    assert.match(source, /<!doctype html>/i, name + " has doctype");
    assert.match(source, /<html lang="zh-Hant">/i, name + " uses Traditional Chinese");
    assert.match(source, /name="viewport"/i, name + " sets viewport");
    assert.equal((source.match(/<script\b/gi) || []).length, (source.match(/<\/script>/gi) || []).length, name + " has balanced script tags");
    assert.equal((source.match(/<style\b/gi) || []).length, (source.match(/<\/style>/gi) || []).length, name + " has balanced style tags");
  }
});

test("inline JavaScript parses without syntax errors", () => {
  for (const [name, source] of [["storefront", front], ["admin", admin]]) {
    const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length > 0, name + " includes a script");
    for (const [index, match] of scripts.entries()) {
      assert.doesNotThrow(() => new Script(match[1]), name + " inline script " + (index + 1) + " parses");
    }
  }
});

test("coming-soon storefront products are not mislabeled sold out", () => {
  const status = front.match(/function statusInfo\(p\)\{([\s\S]*?)\}\nfunction renderTags/)?.[1] || "";
  assert.ok(status.indexOf('p.status==="coming"') < status.indexOf('p.stock===0'), "coming-soon status takes precedence over zero stock");
  assert.match(admin, /replace\(\/\^\\uFEFF\//);
});

test("storefront cart persists locally and validates restored entries", () => {
  assert.match(front, /localStorage\.getItem\("wj_inquiry_cart"\)/);
  assert.match(front, /localStorage\.setItem\("wj_inquiry_cart"/);
  assert.match(front, /Number\.isInteger\(i\.qty\)/);
  assert.match(front, /renderTags\(\);renderProducts\(\);renderCart\(\);/);
  assert.match(front, /不代表訂單成立/);
  assert.match(front, /if\(p\.price!==null\)total\+=p\.price\*item\.qty/);
  assert.match(front, /aria-label","減少 /);
  assert.match(front, /aria-label","增加 /);
  assert.match(front, /className="cartactions"/);
  assert.match(front, /className="qtybutton"/);
  assert.match(front, /item\.qty=Math\.min\(99,item\.qty\+1\)/);
  assert.match(front, /item\.qty=Math\.max\(1,item\.qty-1\)/);
  assert.match(front, /cart=cart\.filter\(x=>x\.id!==item\.id\)/);
  assert.match(front, /item\.qty=Math\.max\(1,item\.qty-1\)/);
  assert.match(front, /activeProduct\.status==="coming"/);
  assert.match(front, /已售罄，請確認能否補貨/);
  assert.match(front, /id="clearCart"/);
  assert.match(front, /確定清空整份詢價清單/);
});

test("catalog search supports normalized spaces and numeric Pokédex leading zeros", () => {
  assert.match(front, /function normalizeSearch\(value\)/);
  assert.match(front, /replace\(\/\\s\+\/g,""\)/);
  assert.match(front, /replace\(\/\^0\+\(\?=\\d\)\/,""\)/);
  assert.match(front, /numberMatch=\/\^\\d\+\$\/\.test\(term\)/);
});

test("CSV import checks rows and never overwrites existing stock", () => {
  assert.match(admin, /function parseCSV\(text\)/);
  assert.match(admin, /else if\(c==="\\\\n"&&!quoted\)/);
  assert.match(admin, /text\[i\+1\]==='"/);
  assert.match(admin, /CSV 有未配對的引號/);
  assert.match(admin, /CSV 內有重複 ID/);
  assert.match(admin, /庫存必須是非負整數/);
  assert.match(admin, /售價必須是非負整數或留空/);
  assert.match(admin, /stock:old\.stock/);
  assert.match(admin, /CSV 匯入初始庫存/);
  assert.match(admin, /stockEditReasonWrap/);
  assert.match(admin, /調整既有商品庫存時，請填寫庫存異動原因/);
  assert.match(admin, /新增商品初始庫存/);
  assert.match(admin, /增加或減少的數量必須大於 0/);
  assert.match(admin, /庫存沒有變更，不建立異動紀錄/);
  assert.match(admin, /請填寫庫存異動原因/);
  assert.match(admin, /Number\.isInteger\(n\)/);
  assert.match(admin, /匯出商品 CSV/);
  assert.match(admin, /匯入商品 CSV/);
  assert.match(admin, /class="alt moveTag"/);
  assert.match(admin, /tags\[i\],tags\[j\]/);
});

test("database drafts keep base tables protected and the public view ungranted", () => {
  assert.match(schema, /alter table public\.products enable row level security/i);
  assert.match(schema, /alter table public\.orders enable row level security/i);
  assert.match(security, /create or replace function public\.is_store_admin\(\)/i);
  assert.match(security, /grant select, insert, update, delete on public\.products to authenticated/i);
  assert.match(security, /revoke all on public\.public_catalog_draft from public, anon, authenticated/i);
  assert.ok(!security.includes("\\\\nrevoke all on public.public_catalog_draft"), "SQL contains real line breaks");
  assert.ok(!/grant select on public\.admin_profiles to authenticated/i.test(security), "admin profile table is not directly readable by clients");
  assert.match(security, /create policy "admins can read inventory balances"/i);
  assert.ok(!/create policy "admins can manage inventory balances"/i.test(security), "inventory balance writes must use reviewed transaction functions");
  assert.match(security, /grant select on public\.inventory_balances to authenticated/i);
  assert.match(security, /grant select on public\.inventory_movements to authenticated/i);
  assert.match(security, /grant select on public\.audit_logs to authenticated/i);
  assert.ok(!/grant select, insert, update, delete on public\.inventory_balances to authenticated/i.test(security));
  assert.ok(!/create policy "admins can insert audit logs"/i.test(security));
  const view = security.match(/create or replace view public\.public_catalog_draft[\s\S]*?from public\.products p/i)?.[0];
  assert.ok(view, "restricted catalog view exists");
  for (const privateColumn of ["quantity_on_hand", "unit_cost_twd", "supplier_name", "customer_contact_private", "fee_twd"]) {
    assert.ok(!view.includes(privateColumn), "public catalog view must not expose " + privateColumn);
  }
});

test("inventory adjustment draft is atomic, admin-only, and audited", () => {
  assert.match(inventory, /create or replace function public\.admin_adjust_inventory/i);
  assert.match(inventory, /not \(select public\.is_store_admin\(\)\)/);
  assert.match(inventory, /for update/);
  assert.match(inventory, /adjustment would create negative inventory/);
  assert.match(inventory, /insert into public\.inventory_movements/);
  assert.match(inventory, /insert into public\.audit_logs/);
  assert.match(inventory, /revoke all on function public\.admin_adjust_inventory\(uuid, integer, text\) from public/i);
  assert.match(inventory, /grant execute on function public\.admin_adjust_inventory\(uuid, integer, text\) to authenticated/i);
  assert.match(inventory, /set search_path = ''/i);
  assert.match(inventory, /revoke all on function public\.admin_adjust_inventory\(uuid, integer, text\) from public/i);
  assert.ok(!/grant execute on function public\.admin_adjust_inventory\(uuid, integer, text\) to anon/i.test(inventory));
  assert.match(inventory, /pg_catalog\.length\(pg_catalog\.btrim\(p_reason\)\) < 3/);
  assert.match(inventory, /for key share/);
});

test("admin prototype warns when local storage writes fail", () => {
  assert.match(admin, /function save\(\)\{try\{localStorage\.setItem\("wj_admin_tags"/);
  assert.match(admin, /catch\(err\)\{console\.error\("本機儲存失敗",err\);return false\}/);
  assert.match(admin, /id="persistenceWarning" class="warning hidden" role="status"/);
  assert.match(admin, /const persisted=save\(\);\$\("persistenceWarning"\)\.classList\.toggle\("hidden",persisted\)/);
  assert.match(admin, /請先匯出商品 CSV 備份/);
});

test("admin form validates non-negative integer stock, threshold, price and non-empty tags", () => {
  assert.match(admin, /庫存必須是非負整數/);
  assert.match(admin, /低庫存門檻必須是非負整數/);
  assert.match(admin, /售價必須是非負整數/);
  assert.match(admin, /if\(!t\)\{toast\("請輸入標籤名稱"\)/);
});

test("frontend admin data map documents stable IDs, image safety, and private-field allowlist", async () => {
  const mapping = await read("../docs/FRONTEND-ADMIN-DATA-MAP.md");
  assert.match(mapping, /不能直接假設等於資料庫 UUID 或 SKU/);
  assert.match(mapping, /禁止用商品名稱、英文別名或圖鑑編號作唯一鍵/);
  assert.match(mapping, /商品更新不可意外重設庫存/);
  assert.match(mapping, /拒絕偽裝副檔名/);
  assert.match(mapping, /不能先傳到瀏覽器再隱藏/);
  assert.match(mapping, /完成 staging 同步/);
});

test("order lifecycle rules separate order state, cash, and stock effects", async () => {
  const rules = await read("../docs/ORDER-LIFECYCLE-INVENTORY-RULES.md");
  assert.match(rules, /詢價清單不扣庫存/);
  assert.match(rules, /退款不代表一律把商品加回庫存/);
  assert.match(rules, /幂等鍵/);
  assert.match(rules, /歷史成本快照/);
  assert.match(rules, /非法狀態轉換被拒絕/);
  assert.match(rules, /匿名及一般帳號不能讀寫訂單/);
});

test("import export contract keeps inventory and private data guarded", async () => {
  const contract = await read("../docs/IMPORT-EXPORT-CONTRACT.md");
  assert.match(contract, /products-v1\.csv/);
  assert.match(contract, /inventory-movements-v1\.csv/);
  assert.match(contract, /預設不得改變現有庫存/);
  assert.match(contract, /匯入採購批次不可自動增加庫存/);
  assert.match(contract, /正式環境不允許以 CSV 直接覆寫庫存餘額/);
  assert.match(contract, /穩定的 SKU/);
  assert.match(contract, /不是可完整還原系統的唯一手段/);
});

test("backup and restore plan states unverified safeguards clearly", async () => {
  const backup = await read("../docs/BACKUP-RESTORE-PLAN.md");
  assert.match(backup, /尚未配置供應商備份、排程或實際還原/);
  assert.match(backup, /CSV 匯出不是完整備份/);
  assert.match(backup, /還原到隔離 staging/);
  assert.match(backup, /已實際完成一次 staging 還原/);
  assert.match(backup, /RPO/);
  const workflow = await read("../.github/workflows/prototype-tests.yml");
  assert.match(workflow, /"docs\/\*\*"/);
});

test("current release safeguards remain documented", async () => {
  const readme = await read("../README-DEV.md");
  assert.match(readme, /Do not merge to `main` or publish until owner reviews and explicitly approves/);
  assert.ok(readme.includes("has **not** been applied"), "documents that migration is not applied");
});
test("Discord analytics plan distinguishes local cart activity from submitted inquiries and protects secrets", async () => {
  const plan = await read("../docs/DISCORD-ANALYTICS-PLAN.md");
  assert.match(plan, /不得將 Discord Webhook/);
  assert.match(plan, /加入清單當成購買意願確定/);
  assert.match(plan, /複製詢價文字.*當成已送出詢問/);
  assert.match(plan, /Asia\/Taipei/);
  assert.match(plan, /速率限制/);
  assert.match(plan, /保留期限/);
  assert.match(plan, /尚未建立.*Webhook/);
  assert.match(plan, /不連接正式資料庫/);
  assert.match(plan, /staging/);
});
test("analytics event ledger draft is private, idempotent, bounded, and excludes sensitive event types", () => {
  assert.match(analytics, /create table public\.analytics_events_draft/i);
  assert.match(analytics, /event_key uuid not null unique/);
  assert.match(analytics, /enable row level security/i);
  assert.match(analytics, /revoke all on table public\.analytics_events_draft from public, anon, authenticated/i);
  assert.match(analytics, /octet_length\(metadata::text\) <= 1024/);
  assert.match(analytics, /inquiry_submitted/);
  assert.match(analytics, /cart_add/);
  assert.match(analytics, /Never expose a service-role key or Discord webhook/i);
  assert.match(analytics, /Do not store IPs, raw search text, customer contacts, cart contents, payment data/i);
  assert.match(analytics, /Not deployed/i);
});
test("analytics Edge Function draft is disabled by default and allowlists inputs", async () => {
  const fn = await read("../supabase/functions/analytics-event/index.ts");
  assert.match(fn, /ANALYTICS_INGEST_ENABLED.*!== "true"/);
  assert.match(fn, /ANALYTICS_ALLOWED_ORIGINS/);
  assert.match(fn, /allowedTypes = new Set/);
  assert.match(fn, /payload\.event_key/);
  assert.match(fn, /payload\.result_count/);
  assert.match(fn, /payload_too_large/);
  assert.match(fn, /ignore unknown properties/);
  assert.match(fn, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(fn, /analytics_events_draft/);
  assert.match(fn, /never persist raw search terms, cart contents/i);
});
