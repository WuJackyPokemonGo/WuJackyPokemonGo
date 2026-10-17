import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [front, admin, schema, security] = await Promise.all([
  read("../index.html"),
  read("../admin.html"),
  read("../supabase/migrations/202610170001_initial_schema_draft.sql"),
  read("../supabase/migrations/202610180001_security_policy_draft.sql"),
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

test("storefront cart persists locally and validates restored entries", () => {
  assert.match(front, /localStorage\.getItem\("wj_inquiry_cart"\)/);
  assert.match(front, /localStorage\.setItem\("wj_inquiry_cart"/);
  assert.match(front, /Number\.isInteger\(i\.qty\)/);
  assert.match(front, /renderTags\(\);renderProducts\(\);renderCart\(\);/);
  assert.match(front, /不代表訂單成立/);
  assert.match(front, /if\(p\.price!==null\)total\+=p\.price\*item\.qty/);
  assert.match(front, /aria-label","減少 /);
  assert.match(front, /aria-label","增加 /);
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
  assert.match(admin, /Number\\.isInteger\\(n\\)/);
  assert.match(admin, /匯出商品 CSV/);
  assert.match(admin, /匯入商品 CSV/);
});

test("database drafts keep base tables protected and the public view ungranted", () => {
  assert.match(schema, /alter table public\.products enable row level security/i);
  assert.match(schema, /alter table public\.orders enable row level security/i);
  assert.match(security, /create or replace function public\.is_store_admin\(\)/i);
  assert.match(security, /grant select, insert, update, delete on public\.products to authenticated/i);
  assert.match(security, /revoke all on public\.public_catalog_draft from public, anon, authenticated/i);
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

test("current release safeguards remain documented", async () => {
  const readme = await read("../README-DEV.md");
  assert.match(readme, /Do not merge to `main` or publish until owner reviews and explicitly approves/);
  assert.ok(readme.includes("has **not** been applied"), "documents that migration is not applied");
});
