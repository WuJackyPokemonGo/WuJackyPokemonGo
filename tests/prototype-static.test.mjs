import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("storefront cart is session-only and validates restored entries", () => {
  assert.match(front, /sessionStorage\.getItem\("wj_inquiry_cart"\)/);
  assert.match(front, /sessionStorage\.setItem\("wj_inquiry_cart"/);
  assert.match(front, /Number\.isInteger\(i\.qty\)/);
  assert.match(front, /renderTags\(\);renderProducts\(\);renderCart\(\);/);
  assert.match(front, /不代表訂單成立/);
  assert.match(front, /if\(p\.price!==null\)total\+=p\.price\*item\.qty/);
  assert.match(front, /aria-label","減少 /);
  assert.match(front, /aria-label","增加 /);
  assert.match(front, /item\.qty=Math\.max\(1,item\.qty-1\)/);
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
});

test("database drafts keep base tables protected and the public view ungranted", () => {
  assert.match(schema, /alter table public\.products enable row level security/i);
  assert.match(schema, /alter table public\.orders enable row level security/i);
  assert.match(security, /create or replace function public\.is_store_admin\(\)/i);
  assert.match(security, /grant select, insert, update, delete on public\.products to authenticated/i);
  assert.match(security, /revoke all on public\.public_catalog_draft from public, anon, authenticated/i);
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
